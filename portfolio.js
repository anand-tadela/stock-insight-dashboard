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
  let portfolioStocks = [];   // [{ ticker, name, addedAt, addedPrice, thesis? }]
  let priceAlerts     = [];   // [{ id, ticker, targetPrice, condition, active, ... }]
  let thesisTickerTarget = null; // which ticker the thesis modal is currently editing
  let portfolioAnalysisFW    = "ai"; // current framework for the portfolio AI analysis panel
  let portfolioAnalysisCache = {};   // ticker → normalized flat data fetched from /api/stock/{ticker}

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

        // Thesis review badge — appears when stock moves ±10% since added
        const showReview = sinceAdded != null && Math.abs(parseFloat(sinceAdded)) >= 10;

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
  ${
    showReview
      ? `<div class="review-badge">📌 Review your thesis</div>`
      : ""
  }
  <div class="thesis-block">
    ${
      stock.thesis
        ? `<div class="thesis-text">"${escHtml(stock.thesis)}"</div>
           <button class="thesis-edit-btn" onclick="Portfolio.openThesisModal('${safeTicker}')">
             ✏️ Edit Thesis
           </button>`
        : `<button class="thesis-btn" onclick="Portfolio.openThesisModal('${safeTicker}')">
             📝 Add Investment Thesis
           </button>`
    }
  </div>
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

  // ─── THESIS TRACKER ─────────────────────────────────────────────────────────

  function openThesisModal(ticker) {
    thesisTickerTarget = ticker;
    const overlay  = document.getElementById("thesisModalOverlay");
    const tickerEl = document.getElementById("thesisModalTicker");
    const textarea = document.getElementById("thesisTextarea");
    if (!overlay || !textarea) return;
    const stock = portfolioStocks.find((s) => s.ticker === ticker);
    if (tickerEl) tickerEl.textContent = `${ticker}${stock?.name ? " — " + stock.name : ""}`;
    textarea.value = stock?.thesis || "";
    overlay.classList.add("active");
    setTimeout(() => textarea.focus(), 100);
  }

  async function saveThesis(ticker, text) {
    if (!currentUserId) return;
    const stock = portfolioStocks.find((s) => s.ticker === ticker);
    if (!stock) return;
    stock.thesis = text.trim();
    try {
      await fbDB
        .collection("users")
        .doc(currentUserId)
        .collection("portfolio")
        .doc("stocks")
        .set({ stocks: portfolioStocks }, { merge: true });
      renderPortfolio();
      showToast(text.trim() ? `Thesis saved for ${ticker} ✓` : `Thesis removed for ${ticker}`);
    } catch (err) {
      console.error("[Portfolio] Thesis save error:", err);
      showToast("Failed to save thesis.", "error");
    }
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

  // ─── PORTFOLIO AI ANALYSIS ────────────────────────────────────────────────

  async function renderPortfolioAnalysis() {
    const container = document.getElementById("portfolioAnalysisContent");
    if (!container) return;

    if (portfolioStocks.length === 0) {
      container.innerHTML = `
        <div class="pa-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
          <p>Add stocks to your portfolio first, then come back here for AI analysis.</p>
        </div>`;
      return;
    }

    const utils = window.AppUtils;
    const fw    = portfolioAnalysisFW;

    // Build a flat ticker→stockData map from APP_DATA sectors
    const stockDataMap = {};
    if (window.APP_DATA?.sectors) {
      Object.values(window.APP_DATA.sectors).forEach((sec) => {
        sec.stocks.forEach((s) => { stockDataMap[s.ticker] = s; });
      });
    }

    // Merge already-cached custom ticker data
    Object.assign(stockDataMap, portfolioAnalysisCache);

    // Find tickers not in either source and fetch them from the API
    const missing = portfolioStocks.map((s) => s.ticker).filter((t) => !stockDataMap[t]);
    if (missing.length > 0) {
      container.innerHTML = `<div class="pa-loading"><div class="pa-spinner"></div><p>Fetching AI analysis for ${missing.join(", ")}…</p></div>`;
      await Promise.all(missing.map(async (ticker) => {
        try {
          const res  = await fetch(`${API_BASE}/api/stock/${encodeURIComponent(ticker)}`,
            { signal: AbortSignal.timeout(20000) });
          const json = await res.json();
          if (json.status === "ok" && json.data) {
            const p = json.data.prices      || {};
            const f = json.data.fundamentals || {};
            const r = json.data.rating       || {};
            const normalized = {
              ticker,
              name:           f.name           || ticker,
              price:          p.price,
              change:         p.change,
              changePercent:  p.changePercent,
              pe:             f.pe,
              pb:             f.pb,
              marketCap:      f.marketCap,
              beta:           f.beta,
              debtToEquity:   f.debtToEquity,
              returnOnEquity: f.returnOnEquity,
              freeCashflow:   f.freeCashflow,
              revenueGrowth:  f.revenueGrowth,
              targetPrice:    f.targetPrice,
              analystCount:   f.analystCount,
              recommendation: f.recommendation,
              aiScore:        r.score,
              aiRating:       r.rating,
              aiReasons:      r.reasons || [],
            };
            portfolioAnalysisCache[ticker] = normalized;
            stockDataMap[ticker]           = normalized;
          }
        } catch (err) {
          console.warn(`[AI Analysis] Could not fetch ${ticker}:`, err);
        }
      }));
    }

    const fmtC = (n) => {
      if (n == null) return "—";
      if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
      return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Score and sort portfolio stocks
    const scored = portfolioStocks.map((stock) => {
      const fullData = stockDataMap[stock.ticker] || null;
      const score    = fullData && utils ? utils.computeFrameworkScore(fullData, fw) : null;
      const rating   = score != null && utils ? utils.getFrameworkRating(score) : null;
      return { stock, fullData, score, rating };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const LOGO_BG = {
      NVDA:"#76b900", MSFT:"#00a4ef", AVGO:"#cc0000", AAPL:"#555555",
      GOOGL:"#4285f4", PLTR:"#101010", AMD:"#ed1c24", AMZN:"#ff9900",
      META:"#0081fb", TSLA:"#cc0000", JPM:"#003087", GS:"#6e9ecf",
      V:"#1a1f71", MA:"#ff5f00", NFLX:"#e50914", XOM:"#ed1b2d",
    };

    const cardsHtml = scored.map(({ stock, fullData, score, rating }) => {
      const bg = LOGO_BG[stock.ticker] || "#6366f1";

      if (!fullData) {
        return `
          <div class="analysis-card pa-card pa-card--unknown">
            <div class="analysis-card-header">
              <div class="analysis-card-logo" style="background:${bg}">${escHtml(stock.ticker.slice(0, 3))}</div>
              <div>
                <div class="analysis-card-title">${escHtml(stock.ticker)} — No data</div>
                <div class="analysis-card-subtitle">${escHtml(stock.name || "")} · Custom ticker, not in tracked sectors</div>
              </div>
            </div>
            <div class="analysis-body">
              <div class="analysis-text" style="opacity:0.55">
                • No fundamental data available for AI scoring<br>
                • Only tickers in the tracked dashboard sectors can be scored
              </div>
            </div>
          </div>`;
      }

      let fwPoints = [];
      if (fw === "buffett") {
        if (fullData.pe != null)             fwPoints.push(`P/E ${fullData.pe} — ${fullData.pe < 18 ? "value territory" : fullData.pe < 28 ? "fair value" : "growth premium"}`);
        if (fullData.debtToEquity != null)   fwPoints.push(`D/E ${fullData.debtToEquity} — ${fullData.debtToEquity < 0.5 ? "fortress balance sheet" : "manageable leverage"}`);
        if (fullData.returnOnEquity != null) fwPoints.push(`ROE ${fullData.returnOnEquity}% — ${fullData.returnOnEquity > 20 ? "exceptional capital returns" : "solid returns"}`);
        if (fullData.freeCashflow != null)   fwPoints.push(`FCF ${fmtC(fullData.freeCashflow)} — ${fullData.freeCashflow > 0 ? "positive cash generation" : "cash burn concern"}`);
      } else if (fw === "cathie") {
        if (fullData.revenueGrowth != null)  fwPoints.push(`Revenue ${fullData.revenueGrowth > 0 ? "+" : ""}${fullData.revenueGrowth}% — ${fullData.revenueGrowth > 25 ? "hypergrowth" : "steady expansion"}`);
        fwPoints.push(`AI disruption score: ${fullData.aiScore}/100`);
        if (fullData.targetPrice && fullData.price) {
          const up = (((fullData.targetPrice - fullData.price) / fullData.price) * 100).toFixed(0);
          fwPoints.push(`Analyst target $${fullData.targetPrice} — ${up > 0 ? "+" : ""}${up}% upside`);
        }
      } else if (fw === "momentum") {
        if (fullData.changePercent != null)  fwPoints.push(`${fullData.changePercent >= 0 ? "▲" : "▼"} ${Math.abs(fullData.changePercent).toFixed(2)}% today — ${fullData.changePercent >= 0 ? "positive momentum" : "downward pressure"}`);
        if (fullData.analystCount)           fwPoints.push(`${fullData.analystCount} Wall Street analysts covering this stock`);
        if (fullData.targetPrice && fullData.price) {
          const up = (((fullData.targetPrice - fullData.price) / fullData.price) * 100).toFixed(0);
          fwPoints.push(`Consensus target $${fullData.targetPrice} (${up > 0 ? "+" : ""}${up}% upside)`);
        }
        fwPoints.push(`Recommendation: ${fullData.recommendation || fullData.aiRating || "Buy"}`);
      } else {
        // ai mode
        fwPoints = (fullData.aiReasons || []).slice();
        if (!fwPoints.length) {
          fwPoints.push(`AI composite score: ${fullData.aiScore || "—"}/100`);
          fwPoints.push(`Analyst rating: ${fullData.aiRating || "—"}`);
          if (fullData.targetPrice && fullData.price) {
            const up = (((fullData.targetPrice - fullData.price) / fullData.price) * 100).toFixed(0);
            fwPoints.push(`Analyst target $${fullData.targetPrice} (${up > 0 ? "+" : ""}${up}% upside)`);
          }
        }
      }

      const sinceAdded = fullData.price && stock.addedPrice
        ? (((fullData.price - stock.addedPrice) / stock.addedPrice) * 100).toFixed(1)
        : null;

      return `
        <div class="analysis-card pa-card">
          <div class="analysis-card-header">
            <div class="analysis-card-logo" style="background:${bg}">${escHtml(stock.ticker.slice(0, 3))}</div>
            <div style="flex:1;min-width:0">
              <div class="analysis-card-title">${escHtml(stock.ticker)} — ${rating} (${score}/100)</div>
              <div class="analysis-card-subtitle">${escHtml(fullData.name || stock.name || "")}</div>
            </div>
            ${sinceAdded != null ? `
            <div class="pa-since ${parseFloat(sinceAdded) >= 0 ? "up" : "down"}">
              ${parseFloat(sinceAdded) >= 0 ? "+" : ""}${sinceAdded}%
              <span class="pa-since-label">since added</span>
            </div>` : ""}
          </div>
          <div class="analysis-body">
            <div class="analysis-text">${fwPoints.map((r) => `• ${r}`).join("<br>")}</div>
            <div class="analysis-chips">
              ${fullData.pe != null            ? `<span class="chip blue">PE ${fullData.pe}</span>` : ""}
              ${fullData.revenueGrowth != null  ? `<span class="chip green">Rev +${fullData.revenueGrowth}%</span>` : ""}
              ${fullData.returnOnEquity != null ? `<span class="chip cyan">ROE ${fullData.returnOnEquity}%</span>` : ""}
              ${fullData.debtToEquity != null   ? `<span class="chip orange">D/E ${fullData.debtToEquity}</span>` : ""}
              ${fullData.freeCashflow != null   ? `<span class="chip green">FCF ${fmtC(fullData.freeCashflow)}</span>` : ""}
              ${fullData.targetPrice != null    ? `<span class="chip blue">Target $${fullData.targetPrice}</span>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    const fwMeta = utils?.FRAMEWORK_META || {
      ai:       { label: "🤖 AI Score" },
      buffett:  { label: "💰 Buffett Value" },
      cathie:   { label: "🚀 Growth Mode" },
      momentum: { label: "📈 Momentum" },
    };
    const fwTabsHtml = Object.entries(fwMeta).map(([fwKey, meta]) =>
      `<button class="ptab ${fwKey === fw ? "active" : ""}" data-pfw="${fwKey}">${meta.label}</button>`
    ).join("");

    container.innerHTML = `
      <div class="pa-framework-bar">
        <span class="pa-bar-label">Score by:</span>
        ${fwTabsHtml}
      </div>
      <p class="section-sub" style="margin:0 0 16px">Your holdings ranked by ${fwMeta[fw]?.label || "AI Score"}. Switch frameworks to re-rank under different investment philosophies.</p>
      <div class="pa-grid">${cardsHtml}</div>`;

    // Hook framework tab clicks (re-render on switch)
    container.querySelectorAll(".ptab").forEach((tab) => {
      tab.addEventListener("click", () => {
        portfolioAnalysisFW = tab.dataset.pfw;
        renderPortfolioAnalysis();
      });
    });
  }

  // ─── CLEAR (on sign-out) ───────────────────────────────────────────────────

  function clear() {
    currentUserId          = null;
    portfolioStocks        = [];
    priceAlerts            = [];
    portfolioAnalysisCache = {};
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

    // Thesis modal
    const thesisOverlay  = document.getElementById("thesisModalOverlay");
    const thesisSaveBtn  = document.getElementById("thesisSaveBtn");
    const thesisCloseBtn = document.getElementById("thesisCloseBtn");
    if (thesisSaveBtn) {
      thesisSaveBtn.addEventListener("click", async () => {
        const text = document.getElementById("thesisTextarea")?.value || "";
        if (thesisTickerTarget) await saveThesis(thesisTickerTarget, text);
        thesisOverlay?.classList.remove("active");
        thesisTickerTarget = null;
      });
    }
    if (thesisCloseBtn) {
      thesisCloseBtn.addEventListener("click", () => {
        thesisOverlay?.classList.remove("active");
        thesisTickerTarget = null;
      });
    }
    thesisOverlay?.addEventListener("click", (e) => {
      if (e.target === thesisOverlay) {
        thesisOverlay.classList.remove("active");
        thesisTickerTarget = null;
      }
    });

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
    renderPortfolioAnalysis,
    showToast,
    clear,
    openThesisModal,
    saveThesis,
    get portfolioStocks() { return portfolioStocks; },
  };
})();
