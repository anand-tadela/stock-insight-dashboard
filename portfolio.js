/**
 * StockInsight Pro — Portfolio & Price Alerts
 * ==============================================
 * Manages the user's personal stock portfolio and price alert system.
 *
 * Firestore structure:
 *   users/{uid}/
 *     portfolio/stocks  → { stocks: [{ticker, name, addedAt, addedPrice}] }
 *     alerts/{alertId}  → { ticker, targetPrice, condition, active, ... }
 */

(function () {
  "use strict";

  let currentUserId   = null;
  let portfolioStocks = [];   // [{ ticker, name, addedAt, addedPrice }]
  let priceAlerts     = [];   // [{ id, ticker, targetPrice, condition, active, ... }]

  // ─── PORTFOLIO ─────────────────────────────────────────────────────────────

  async function loadPortfolio(uid) {
    currentUserId = uid;
    try {
      const doc = await fbDB
        .collection("users")
        .doc(uid)
        .collection("portfolio")
        .doc("stocks")
        .get();
      portfolioStocks = doc.exists ? (doc.data().stocks || []) : [];
    } catch (err) {
      console.error("[Portfolio] Load error:", err);
      portfolioStocks = [];
    }
    renderPortfolio();
  }

  async function addToPortfolio(ticker, name, price) {
    if (!currentUserId) {
      window.Auth?.openAuthModal();
      return;
    }
    if (portfolioStocks.find((s) => s.ticker === ticker)) {
      showToast(`${ticker} is already in your portfolio`);
      return;
    }

    const entry = {
      ticker,
      name,
      addedAt:    new Date().toISOString(),
      addedPrice: price || null,
    };
    portfolioStocks.push(entry);

    try {
      await fbDB
        .collection("users")
        .doc(currentUserId)
        .collection("portfolio")
        .doc("stocks")
        .set({ stocks: portfolioStocks }, { merge: true });
      renderPortfolio();
      showToast(`${ticker} added to portfolio ✓`);
    } catch (err) {
      console.error("[Portfolio] Save error:", err);
      portfolioStocks.pop();
      showToast("Failed to save. Please try again.", "error");
    }
  }

  async function removeFromPortfolio(ticker) {
    if (!currentUserId) return;
    portfolioStocks = portfolioStocks.filter((s) => s.ticker !== ticker);
    try {
      await fbDB
        .collection("users")
        .doc(currentUserId)
        .collection("portfolio")
        .doc("stocks")
        .set({ stocks: portfolioStocks });
      renderPortfolio();
      showToast(`${ticker} removed from portfolio`);
    } catch (err) {
      console.error("[Portfolio] Remove error:", err);
      showToast("Failed to remove. Please try again.", "error");
    }
  }

  function renderPortfolio() {
    const grid  = document.getElementById("portfolioGrid");
    const empty = document.getElementById("portfolioEmpty");
    const count = document.getElementById("portfolioCount");
    if (!grid) return;

    // Update count badge
    if (count) {
      count.textContent = portfolioStocks.length
        ? `${portfolioStocks.length} stock${portfolioStocks.length > 1 ? "s" : ""}`
        : "";
      count.style.display = portfolioStocks.length ? "" : "none";
    }

    if (portfolioStocks.length === 0) {
      grid.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");

    // Get live prices from dashboard data
    const liveData = window.APP_DATA;

    grid.innerHTML = portfolioStocks
      .map((stock) => {
        let currentPrice  = null;
        let changePercent = null;
        if (liveData?.sectors) {
          for (const sec of Object.values(liveData.sectors)) {
            const found = sec.stocks.find((s) => s.ticker === stock.ticker);
            if (found) {
              currentPrice  = found.price;
              changePercent = found.changePercent;
              break;
            }
          }
        }

        const sinceAdded =
          currentPrice != null && stock.addedPrice != null
            ? (((currentPrice - stock.addedPrice) / stock.addedPrice) * 100).toFixed(2)
            : null;

        const chgClass  = (changePercent || 0) >= 0 ? "up" : "down";
        const sinceClass = sinceAdded != null
          ? (parseFloat(sinceAdded) >= 0 ? "up" : "down")
          : "";

        // Safe-escaped values for inline onclick attributes
        const safeTicker = stock.ticker.replace(/'/g, "\\'");
        const safeName   = (stock.name || "").replace(/'/g, "\\'");

        return `
<div class="portfolio-card">
  <div class="portfolio-card-top">
    <div class="portfolio-ticker">${escHtml(stock.ticker)}</div>
    <button class="portfolio-remove" onclick="Portfolio.removeFromPortfolio('${safeTicker}')" title="Remove">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="portfolio-name">${escHtml(stock.name || "")}</div>
  ${
    currentPrice != null
      ? `<div class="portfolio-price">$${currentPrice.toFixed(2)}</div>
         <div class="portfolio-change ${chgClass}">
           ${changePercent >= 0 ? "▲" : "▼"} ${Math.abs(changePercent).toFixed(1)}% today
         </div>`
      : `<div class="portfolio-price">—</div>`
  }
  ${
    sinceAdded != null
      ? `<div class="portfolio-since ${sinceClass}">
           Since added: ${parseFloat(sinceAdded) >= 0 ? "+" : ""}${sinceAdded}%
         </div>`
      : ""
  }
  <button class="portfolio-alert-btn"
    onclick="Portfolio.openAddAlertForm('${safeTicker}')">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    Set Alert
  </button>
</div>`;
      })
      .join("");
  }

  // ─── PRICE ALERTS ──────────────────────────────────────────────────────────

  async function loadAlerts(uid) {
    currentUserId = uid;
    try {
      const snap = await fbDB
        .collection("users")
        .doc(uid)
        .collection("alerts")
        .orderBy("createdAt", "desc")
        .get();
      priceAlerts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("[Alerts] Load error:", err);
      priceAlerts = [];
    }
    renderAlerts();
    // Check immediately after loading
    if (window.APP_DATA) checkAlerts(window.APP_DATA);
  }

  function openAddAlertForm(ticker) {
    const tickerInput = document.getElementById("alertTicker");
    if (tickerInput) tickerInput.value = ticker || "";
    const alertsSection = document.getElementById("alertsSection");
    if (alertsSection) {
      alertsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => document.getElementById("alertPrice")?.focus(), 400);
  }

  async function addAlert(ticker, targetPrice, condition) {
    if (!currentUserId) return;

    const alert = {
      ticker:       ticker.toUpperCase().trim(),
      targetPrice:  parseFloat(targetPrice),
      condition,               // 'above' | 'below'
      active:       true,
      createdAt:    new Date().toISOString(),
      notifiedAt:   null,
      triggeredPrice: null,
    };

    try {
      const docRef = await fbDB
        .collection("users")
        .doc(currentUserId)
        .collection("alerts")
        .add(alert);
      priceAlerts.unshift({ id: docRef.id, ...alert });
      renderAlerts();
      showToast(`Alert set: ${alert.ticker} ${condition} $${parseFloat(targetPrice).toFixed(2)}`);
    } catch (err) {
      console.error("[Alerts] Add error:", err);
      showToast("Failed to save alert. Please try again.", "error");
    }
  }

  async function removeAlert(alertId) {
    if (!currentUserId) return;
    try {
      await fbDB
        .collection("users")
        .doc(currentUserId)
        .collection("alerts")
        .doc(alertId)
        .delete();
      priceAlerts = priceAlerts.filter((a) => a.id !== alertId);
      renderAlerts();
    } catch (err) {
      console.error("[Alerts] Remove error:", err);
      showToast("Failed to remove alert.", "error");
    }
  }

  async function checkAlerts(dashboardData) {
    if (!currentUserId || priceAlerts.length === 0) return;

    // Build a price map from dashboard data
    const priceMap = {};
    if (dashboardData?.sectors) {
      Object.values(dashboardData.sectors).forEach((sec) => {
        sec.stocks.forEach((s) => {
          if (s.price != null) priceMap[s.ticker] = s.price;
        });
      });
    }

    const triggered = [];

    for (const alert of priceAlerts) {
      if (!alert.active) continue;
      const currentPrice = priceMap[alert.ticker];
      if (currentPrice == null) continue;

      const hit =
        (alert.condition === "above" && currentPrice >= alert.targetPrice) ||
        (alert.condition === "below" && currentPrice <= alert.targetPrice);

      if (hit) {
        triggered.push({ alert, currentPrice });
        // Mark as triggered in Firestore
        try {
          await fbDB
            .collection("users")
            .doc(currentUserId)
            .collection("alerts")
            .doc(alert.id)
            .update({
              active:         false,
              notifiedAt:     new Date().toISOString(),
              triggeredPrice: currentPrice,
            });
          alert.active         = false;
          alert.notifiedAt     = new Date().toISOString();
          alert.triggeredPrice = currentPrice;
        } catch (err) {
          console.error("[Alerts] Update error:", err);
        }
      }
    }

    if (triggered.length > 0) {
      triggered.forEach(({ alert, currentPrice }) =>
        fireAlertNotification(alert, currentPrice)
      );
      renderAlerts();
    }
  }

  function fireAlertNotification(alert, currentPrice) {
    const symbol   = escHtml(alert.ticker);
    const condWord = alert.condition === "above" ? "risen above" : "dropped below";
    const msg = `${symbol} is now $${currentPrice.toFixed(2)} — it has ${condWord} your target of $${alert.targetPrice.toFixed(2)}`;

    // In-app toast (always shown)
    showToast(`🔔 Price Alert: ${msg}`, "alert");

    // Browser push notification (shown even if tab is background)
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("StockInsight Pro — Price Alert 🔔", {
          body:             msg,
          icon:             "/assets/favicon.svg",
          tag:              `price-alert-${alert.ticker}`,
          requireInteraction: true,
        });
      } catch (err) {
        console.warn("[Alerts] Browser notification error:", err);
      }
    }
  }

  function renderAlerts() {
    const list  = document.getElementById("alertsList");
    const empty = document.getElementById("alertsEmpty");
    if (!list) return;

    if (priceAlerts.length === 0) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");

    list.innerHTML = priceAlerts
      .map((alert) => {
        const dateStr = new Date(alert.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day:   "numeric",
        });
        const safeId = alert.id.replace(/'/g, "\\'");
        return `
<div class="alert-row ${alert.active ? "active" : "triggered"}">
  <div class="alert-pill">
    <span class="alert-row-ticker">${escHtml(alert.ticker)}</span>
    <span class="alert-row-cond">${alert.condition === "above" ? "≥" : "≤"} $${alert.targetPrice.toFixed(2)}</span>
    <span class="alert-row-status ${alert.active ? "status-active" : "status-done"}">
      ${alert.active ? "Active" : "✓ Triggered"}
    </span>
    ${
      alert.triggeredPrice != null
        ? `<span class="alert-row-hit">at $${alert.triggeredPrice.toFixed(2)}</span>`
        : ""
    }
  </div>
  <div class="alert-row-meta">
    <span class="alert-row-date">${dateStr}</span>
    <button class="alert-row-remove"
      onclick="Portfolio.removeAlert('${safeId}')"
      title="Remove alert">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</div>`;
      })
      .join("");
  }

  // ─── TOAST ─────────────────────────────────────────────────────────────────

  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("show"));
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // ─── CLEAR (on sign-out) ───────────────────────────────────────────────────

  function clear() {
    currentUserId   = null;
    portfolioStocks = [];
    priceAlerts     = [];
    renderPortfolio();
    renderAlerts();
  }

  // ─── UTILITY ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── CUSTOM TICKER LOOKUP ─────────────────────────────────────────────────
  // Uses the Cloud Run server's /api/stock/:ticker endpoint.
  // Falls back to adding ticker with no price if server is offline.

  const API_BASE = "https://stockinsight-pro-306494317452.us-central1.run.app";

  async function lookupAndAddTicker(rawTicker) {
    const ticker = rawTicker.toUpperCase().trim();
    if (!ticker) return;

    if (portfolioStocks.find((s) => s.ticker === ticker)) {
      showToast(`${ticker} is already in your portfolio`);
      return;
    }

    showToast(`Looking up ${ticker}…`);

    let name  = ticker;
    let price = null;

    // Try the MCP server for live data
    try {
      const res = await fetch(`${API_BASE}/api/stock/${ticker}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        if (d) {
          name  = d.name  || d.longName || ticker;
          price = d.price ?? d.currentPrice ?? null;
        }
      }
    } catch (err) {
      console.warn("[Portfolio] Ticker lookup failed:", err.message);
    }

    // Also check dashboard data in memory
    if (window.APP_DATA?.sectors) {
      for (const sec of Object.values(window.APP_DATA.sectors)) {
        const found = sec.stocks.find((s) => s.ticker === ticker);
        if (found) {
          name  = found.name  || name;
          price = found.price ?? price;
          break;
        }
      }
    }

    await addToPortfolio(ticker, name, price);
  }

  // ─── ALERT FORM SUBMIT ─────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", () => {
    // Portfolio custom-add form
    const portfolioAddForm = document.getElementById("portfolioAddForm");
    if (portfolioAddForm) {
      portfolioAddForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) { window.Auth?.openAuthModal(); return; }
        const input     = document.getElementById("portfolioTickerInput");
        const submitBtn = portfolioAddForm.querySelector("button[type='submit']");
        const ticker    = (input?.value || "").trim();
        if (!ticker) { showToast("Enter a ticker symbol first", "error"); return; }
        if (submitBtn) submitBtn.disabled = true;
        await lookupAndAddTicker(ticker);
        if (input)     input.value = "";
        if (submitBtn) submitBtn.disabled = false;
      });
    }

    const alertForm = document.getElementById("addAlertForm");
    if (alertForm) {
      alertForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ticker    = document.getElementById("alertTicker").value.trim().toUpperCase();
        const price     = document.getElementById("alertPrice").value.trim();
        const condition = document.getElementById("alertCondition").value;

        if (!ticker) {
          showToast("Please enter a ticker symbol", "error");
          return;
        }
        if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
          showToast("Please enter a valid target price", "error");
          return;
        }
        if (!currentUserId) {
          window.Auth?.openAuthModal();
          return;
        }

        const submitBtn = alertForm.querySelector("button[type='submit']");
        if (submitBtn) submitBtn.disabled = true;

        await addAlert(ticker, price, condition);

        alertForm.reset();
        if (submitBtn) submitBtn.disabled = false;
      });
    }
  });

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  window.Portfolio = {
    loadPortfolio,
    loadAlerts,
    addToPortfolio,
    removeFromPortfolio,
    openAddAlertForm,
    addAlert,
    removeAlert,
    checkAlerts,
    renderPortfolio,
    renderAlerts,
    showToast,
    clear,
    get portfolioStocks() { return portfolioStocks; },
  };
})();
