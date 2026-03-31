"use strict";

/**
 * StockInsight Pro — Cloud Functions
 * ====================================
 * checkPriceAlerts: runs every 10 min during US market hours (Mon–Fri 9:25am–4:05pm ET).
 *   1. Reads all active price alerts across every user (collection group query)
 *   2. Fetches live prices via yahoo-finance2
 *   3. Marks triggered alerts as done in Firestore
 *   4. Sends FCM push notification to the user's registered browser(s)
 */

const { onSchedule }    = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore }  = require("firebase-admin/firestore");
const { getMessaging }  = require("firebase-admin/messaging");
const yf                = require("yahoo-finance2").default;

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ─── MARKET HOURS (ET) ────────────────────────────────────────────────────────
function isMarketOpen() {
  // Convert current UTC time to Eastern Time
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et    = new Date(etStr);
  const day   = et.getDay();                          // 0=Sun … 6=Sat
  const mins  = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return false;           // Weekend
  if (mins < 9 * 60 + 25)    return false;            // Before 9:25am ET
  if (mins > 16 * 60 + 5)    return false;            // After  4:05pm ET
  return true;
}

// ─── SCHEDULED FUNCTION ───────────────────────────────────────────────────────
exports.checkPriceAlerts = onSchedule(
  {
    // Every 10 min, 9am–4pm ET window, Mon–Fri; isMarketOpen() tightens to 9:25–4:05
    schedule:       "*/10 9-16 * * 1-5",
    timeZone:       "America/New_York",
    memory:         "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    if (!isMarketOpen()) {
      console.log("[Alerts] Market closed — skipping");
      return;
    }

    // ── 1. Get all active alerts across all users ───────────────────────────
    const snap = await db.collectionGroup("alerts")
      .where("active", "==", true)
      .get();

    if (snap.empty) {
      console.log("[Alerts] No active alerts");
      return;
    }
    console.log(`[Alerts] Checking ${snap.size} active alert(s)`);

    // ── 2. Collect unique tickers then fetch prices ─────────────────────────
    const tickers = [...new Set(snap.docs.map((d) => d.data().ticker))];
    const prices  = {};

    await Promise.allSettled(
      tickers.map(async (ticker) => {
        try {
          const quote = await yf.quote(ticker, {}, { validateResult: false });
          const price = quote.regularMarketPrice ?? null;
          if (price != null) {
            prices[ticker] = price;
            console.log(`[Price] ${ticker} = $${price}`);
          }
        } catch (err) {
          console.warn(`[Price] Failed for ${ticker}: ${err.message}`);
        }
      })
    );

    // ── 3. Evaluate each alert ──────────────────────────────────────────────
    const batch         = db.batch();
    const toNotify      = [];

    for (const doc of snap.docs) {
      const alert = doc.data();
      const price = prices[alert.ticker];
      if (price == null) continue;

      const triggered =
        (alert.condition === "above" && price >= alert.targetPrice) ||
        (alert.condition === "below" && price <= alert.targetPrice);

      if (!triggered) continue;

      // Mark alert done
      batch.update(doc.ref, {
        active:         false,
        triggeredAt:    new Date().toISOString(),
        triggeredPrice: price,
      });

      // uid lives at: users/{uid}/alerts/{alertId}
      const uid = doc.ref.parent.parent.id;
      toNotify.push({ uid, alert, currentPrice: price });
    }

    if (toNotify.length === 0) {
      console.log("[Alerts] No alerts triggered this cycle");
      return;
    }

    // ── 4. Commit Firestore updates atomically ──────────────────────────────
    await batch.commit();
    console.log(`[Alerts] ${toNotify.length} alert(s) triggered — sending notifications`);

    // ── 5. Send FCM push notifications ─────────────────────────────────────
    for (const { uid, alert, currentPrice } of toNotify) {
      const tokensSnap = await db
        .collection("users").doc(uid)
        .collection("fcmTokens")
        .get();

      const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
      if (tokens.length === 0) {
        console.warn(`[FCM] No tokens for uid=${uid}`);
        continue;
      }

      const condWord = alert.condition === "above" ? "risen above" : "dropped below";
      const body = `${alert.ticker} is $${currentPrice.toFixed(2)} — has ${condWord} your target of $${parseFloat(alert.targetPrice).toFixed(2)}`;

      try {
        const res = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: "StockInsight Pro — Price Alert 🔔",
            body,
          },
          webpush: {
            notification: {
              icon:               "https://stock-insight-dashboard.web.app/assets/favicon.svg",
              requireInteraction: true,
              tag:                `alert-${alert.ticker}`,
            },
            fcmOptions: {
              link: "https://stock-insight-dashboard.web.app",
            },
          },
        });

        console.log(`[FCM] uid=${uid}: ${res.successCount}/${tokens.length} delivered`);

        // Remove stale / unregistered tokens
        const stale = res.responses
          .map((r, i) => (!r.success &&
            (r.error?.code === "messaging/invalid-registration-token" ||
             r.error?.code === "messaging/registration-token-not-registered"))
            ? tokens[i] : null)
          .filter(Boolean);

        for (const t of stale) {
          await db.collection("users").doc(uid)
            .collection("fcmTokens").doc(t).delete();
          console.log(`[FCM] Removed stale token for uid=${uid}`);
        }
      } catch (err) {
        console.error(`[FCM] Send error for uid=${uid}:`, err.message);
      }
    }
  }
);
