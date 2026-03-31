/**
 * StockInsight Pro — FCM Client
 * ==============================
 * Registers the browser for Firebase Cloud Messaging push notifications.
 * After sign-in, this saves an FCM token to Firestore.
 * The Cloud Function reads these tokens to deliver background price alerts.
 *
 * SETUP REQUIRED:
 *   1. Go to Firebase Console → Project Settings → Cloud Messaging tab
 *   2. Scroll to "Web configuration" → "Web Push certificates"
 *   3. Click "Generate key pair" (if not done yet)
 *   4. Copy the key and paste it as VAPID_KEY below
 */

(function () {
  "use strict";

  // ⬇ Replace with your key from Firebase Console → Project Settings → Cloud Messaging
  // → Web configuration → Web Push certificates → Generate key pair
  const VAPID_KEY = "BL_gsr0jt6i5xS_CECRzn2Dq4MZOQlnlyMNizLCgc87LMh54xX2CI9iDanyVII2DM2LC7bh_Ibnztaw9VtlGcwI";

  async function setupFCM(uid) {
    if (!window.fbMessaging)                      return;
    if (!("serviceWorker" in navigator))          return;
    if (!("Notification" in window))              return;
    if (Notification.permission !== "granted")    return;
    if (VAPID_KEY === "YOUR_VAPID_KEY_HERE") {
      console.warn("[FCM] VAPID key not set — background push notifications disabled");
      return;
    }

    try {
      // Register service worker
      const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      // Get FCM token
      const token = await fbMessaging.getToken({
        vapidKey:                    VAPID_KEY,
        serviceWorkerRegistration:   swReg,
      });

      if (!token) {
        console.warn("[FCM] No token returned");
        return;
      }

      // Persist token under this user in Firestore
      await fbDB
        .collection("users").doc(uid)
        .collection("fcmTokens").doc(token)
        .set({
          createdAt: new Date().toISOString(),
          userAgent: navigator.userAgent.slice(0, 200),
        });
      console.log("[FCM] Token registered ✅");

      // Handle messages when app tab is in the foreground
      fbMessaging.onMessage((payload) => {
        const body = payload.notification?.body || "Price alert triggered";
        window.Portfolio?.showToast(`🔔 ${body}`, "alert");
      });

    } catch (err) {
      console.warn("[FCM] Setup error:", err.message);
    }
  }

  async function removeFCMToken(uid) {
    if (!window.fbMessaging || !uid) return;
    try {
      const token = await fbMessaging.getToken();
      if (token) {
        await fbMessaging.deleteToken();
        await fbDB
          .collection("users").doc(uid)
          .collection("fcmTokens").doc(token)
          .delete();
        console.log("[FCM] Token removed on sign-out");
      }
    } catch (err) {
      console.warn("[FCM] Token removal error:", err.message);
    }
  }

  window.FCM = { setupFCM, removeFCMToken };
})();
