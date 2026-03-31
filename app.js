/**
 * StockInsight Pro — Main Application
 * =====================================
 * Renders the entire dashboard using data from the MCP Agent Server (api.js).
 * Falls back to static data (data.js) when the server is offline.
 *
 * Flow:
 *   1. Show loader
 *   2. Call StockAPI.getDashboard() → tries MCP server → fallback
 *   3. Render: hero, ticker, sectors, charts, AI analysis
 *   4. Hook up interactions (tabs, search, modal, theme)
 */

(function () {
  "use strict";

  // ─── STATE ────────────────────────────────────────────────────────────────
  let DATA = null;
  let currentSector = "technology";
  let currentFramework = "ai";        // ai | buffett | cathie | momentum
  let sectorChart = null;
  let allocationChart = null;
  const miniCharts = {};

  function themeColor(varName, fallback = "#e5e7eb") {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue(varName);
      return val && val.trim() ? val.trim() : fallback;
    } catch {
      return fallback;
    }
  }

  // ─── COLOR PALETTE FOR STOCK LOGOS ────────────────────────────────────────
  const LOGO_COLORS = {
    NVDA: "#76b900", MSFT: "#00a4ef", AVGO: "#cc0000", AAPL: "#555555",
    GOOGL: "#4285f4", PLTR: "#101010", AMD: "#ed1c24", MRVL: "#b7312c",
    XOM: "#ed1b2d", CVX: "#0055a2", COP: "#c1272d", SHEL: "#dd1d21",
    SLB: "#0072c6", BHP: "#f26522", FCX: "#003d6b", NEM: "#c69c2d",
    RIO: "#002f62", VALE: "#008542",
    GLD: "#fbbf24", SLV: "#e5e7eb",
    LLY: "#c52b2b", UNH: "#002677",
    AZN: "#870052", ABBV: "#071d49", JNJ: "#d51b30", JPM: "#003087",
    "BRK-B": "#4a2d87", V: "#1a1f71", MA: "#ff5f00", GS: "#6e9ecf",
    VOO: "#820029", SPY: "#3c8c2e", QQQ: "#009ddb", SMH: "#003399",
    XLE: "#ff6600",
    // AI Ecosystem & Storage
    DELL: "#007db8", WDC: "#0066cc", STX: "#00833e", NTAP: "#0067c5", PSTG: "#fa6400",
    // AI Power & Clean Energy
    NEE: "#00a8e0", VST: "#ff6600", CEG: "#004990", AES: "#008751", ETR: "#5a2d81",
  };

  // ─── UTILITIES ────────────────────────────────────────────────────────────
  function fmt(n, decimals = 2) {
    if (n == null) return "—";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  function fmtCompact(n) {
    if (n == null) return "—";
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${fmt(n)}`;
  }
  function sign(n) {
    if (n == null) return "";
    return n >= 0 ? "+" : "";
  }
  function cls(n) {
    if (n == null) return "";
    return n >= 0 ? "up" : "down";
  }
  function posneg(n) {
    return n >= 0 ? "positive" : "negative";
  }

  // ─── BOOT ─────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    // Set today's date in header
    const d = new Date();
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const el = document.getElementById("marketDate");
    if (el) el.textContent = `Market Data · ${dateStr}`;

    // Load from localStorage cache or static fallback — NO server call on startup
    DATA = await StockAPI.getCachedOrFallback();
    if (!DATA) {
      console.error("[App] No data available at all");
      hideLoader();
      return;
    }

    // Expose dashboard data globally so portfolio.js can read live prices
    window.APP_DATA = DATA;

    // Update API status bar
    updateApiStatus();

    // Render everything
    renderHero();
    renderTicker();
    renderSector(currentSector);
    renderCharts();
    renderAnalysis();

    // Hook up interactions
    hookTabs();
    hookChartButtons();
    hookSearch();
    hookTheme();
    hookModal();
    hookApiBar();
    hookFrameworkTabs();
    hookPortfolioModeTabs();
    if (window.Insights) {
      Insights.hookTabs();
      Insights.renderMacroAlerts(DATA.market);
    }

    // Done — hide loader
    setTimeout(hideLoader, 600);
  }

  function hideLoader() {
    const loader = document.getElementById("loader");
    const app = document.getElementById("app");
    if (loader) loader.classList.add("fade-out");
    if (app) app.classList.remove("hidden");
    setTimeout(() => { if (loader) loader.style.display = "none"; }, 600);
  }

  // ─── API STATUS BAR ──────────────────────────────────────────────────────
  function updateApiStatus() {
    const dot = document.querySelector("#apiStatus .status-dot");
    const text = document.getElementById("apiStatusText");
    if (!dot || !text) return;

    if (StockAPI.isLive) {
      dot.className = "status-dot live";
      const t = StockAPI.lastFetched
        ? StockAPI.lastFetched.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "";
      text.textContent = `Live from MCP Agent Server · Updated ${t}`;
    } else if (StockAPI.lastFetched) {
      dot.className = "status-dot cached";
      const mins = Math.round((Date.now() - StockAPI.lastFetched.getTime()) / 60000);
      text.textContent = `Cached data · ${mins} min ago · Start MCP server for live prices`;
    } else {
      dot.className = "status-dot offline";
      text.textContent = "Showing cached / demo data · Click Refresh to fetch live prices";
    }
  }

  function hookApiBar() {
    // Refresh btn
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.classList.add("spinning");
        refreshBtn.disabled = true;
        try {
          DATA = await StockAPI.forceRefresh();
          window.APP_DATA = DATA;
          updateApiStatus();
          renderHero();
          renderTicker();
          renderSector(currentSector);
          renderCharts();
          renderAnalysis();
          // Re-render portfolio with fresh prices and check alerts
          if (window.Portfolio) {
            Portfolio.renderPortfolio();
            Portfolio.checkAlerts(DATA);
          }
          if (window.Insights) {
            Insights.renderMacroAlerts(DATA.market);
            Insights.renderDiversification(Portfolio.portfolioStocks, DATA);
          }
        } catch {
          alert("Refresh failed. Make sure the MCP Agent Server is running:\npython3 stock_agent_server.py");
        }
        refreshBtn.classList.remove("spinning");
        refreshBtn.disabled = false;
      });
    }
    // API key modal (for Finnhub — future feature)
    const cfgBtn = document.getElementById("apiConfigBtn");
    const overlay = document.getElementById("apikeyOverlay");
    const saveBtn = document.getElementById("apikeySave");
    const cancelBtn = document.getElementById("apikeyCancel");
    if (cfgBtn && overlay) {
      cfgBtn.addEventListener("click", () => overlay.classList.add("active"));
      cancelBtn.addEventListener("click", () => overlay.classList.remove("active"));
      saveBtn.addEventListener("click", () => {
        const key = document.getElementById("apikeyInput").value.trim();
        if (key) localStorage.setItem("finnhub_api_key", key);
        overlay.classList.remove("active");
      });
    }
  }

  // ─── FRAMEWORK SCORE ENGINE ───────────────────────────────────────────────

  const FRAMEWORK_META = {
    ai:       { label: "🤖 AI Score",     desc: "Composite 100-pt score: Valuation · Growth · Balance Sheet · Analyst Consensus" },
    buffett:  { label: "💰 Buffett Value", desc: "Classic value: low P/E, low debt, high ROE, strong free cash flow" },
    cathie:   { label: "🚀 Growth Mode",  desc: "Disruptive growth focus: high revenue growth, AI score, analyst upside" },
    momentum: { label: "📈 Momentum",     desc: "Price momentum + analyst conviction + target upside" },
  };

  function computeFrameworkScore(s, fw) {
    if (fw === "ai") return s.aiScore || 0;

    if (fw === "buffett") {
      const peScore  = s.pe == null ? 50 : s.pe < 10 ? 100 : s.pe < 18 ? 80 : s.pe < 28 ? 55 : s.pe < 45 ? 30 : 10;
      const deScore  = s.debtToEquity == null ? 50 : s.debtToEquity < 0.3 ? 100 : s.debtToEquity < 0.7 ? 75 : s.debtToEquity < 1.5 ? 45 : 15;
      const roeScore = s.returnOnEquity == null ? 50 : s.returnOnEquity > 25 ? 100 : s.returnOnEquity > 15 ? 75 : s.returnOnEquity > 8 ? 50 : 20;
      const fcfScore = s.freeCashflow == null ? 50 : s.freeCashflow > 1e10 ? 100 : s.freeCashflow > 1e9 ? 75 : s.freeCashflow > 0 ? 50 : 10;
      return Math.round(peScore * 0.35 + deScore * 0.25 + roeScore * 0.25 + fcfScore * 0.15);
    }

    if (fw === "cathie") {
      const growthScore = s.revenueGrowth == null ? 40 : s.revenueGrowth > 50 ? 100 : s.revenueGrowth > 25 ? 80 : s.revenueGrowth > 10 ? 55 : s.revenueGrowth > 0 ? 30 : 10;
      const aiScore     = s.aiScore || 40;
      const upsideScore = (s.targetPrice && s.price)
        ? Math.min(100, Math.max(0, ((s.targetPrice - s.price) / s.price) * 200))
        : 50;
      return Math.round(growthScore * 0.45 + aiScore * 0.35 + upsideScore * 0.2);
    }

    if (fw === "momentum") {
      const chgScore    = s.changePercent == null ? 50 : s.changePercent > 3 ? 100 : s.changePercent > 1 ? 75 : s.changePercent > 0 ? 55 : s.changePercent > -2 ? 35 : 10;
      const analystScore = s.analystCount == null ? 50 : s.analystCount > 30 ? 90 : s.analystCount > 15 ? 70 : s.analystCount > 5 ? 50 : 30;
      const upsideScore = (s.targetPrice && s.price)
        ? Math.min(100, Math.max(0, ((s.targetPrice - s.price) / s.price) * 250))
        : 50;
      return Math.round(chgScore * 0.4 + analystScore * 0.25 + upsideScore * 0.35);
    }

    return s.aiScore || 0;
  }

  function getFrameworkRating(score) {
    if (score >= 80) return "Strong Buy";
    if (score >= 65) return "Buy";
    if (score >= 50) return "Hold";
    return "Underperform";
  }

  function hookFrameworkTabs() {
    document.querySelectorAll(".ftab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".ftab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        currentFramework = tab.dataset.fw;
        const descEl = document.getElementById("frameworkDesc");
        if (descEl) descEl.textContent = FRAMEWORK_META[currentFramework]?.desc || "";
        renderAnalysis();
      });
    });
  }

  function hookPortfolioModeTabs() {
    const tabContentMap = {
      holdings: "holdingsContent",
      paper:    "paperTradeContent",
      analysis: "portfolioAnalysisContent",
    };

    // On load: hide non-default tabs with display:none
    Object.entries(tabContentMap).forEach(([tab, id]) => {
      const el = document.getElementById(id);
      if (el && tab !== "holdings") el.style.display = "none";
    });

    document.querySelectorAll(".pmtab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".pmtab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const tabId = tab.dataset.tab;

        // Show only the active tab's content, hide others with display:none
        Object.entries(tabContentMap).forEach(([key, id]) => {
          const el = document.getElementById(id);
          if (el) el.style.display = key === tabId ? "" : "none";
        });

        if (tabId === "analysis" && window.Portfolio) {
          Portfolio.renderPortfolioAnalysis();
        }
      });
    });
  }

  // ─── HERO SECTION ─────────────────────────────────────────────────────────
  function renderHero() {
    const m = DATA.market;
    if (!m) return;

    const mapping = [
      { key: "sp500",  valId: "heroSP500Val",  chgId: "heroSP500Chg",  prefix: "" },
      { key: "nasdaq", valId: "heroNasdaqVal", chgId: "heroNasdaqChg", prefix: "" },
      { key: "oil",    valId: "heroOilVal",    chgId: "heroOilChg",    prefix: "$" },
      { key: "gold",   valId: "heroGoldVal",   chgId: "heroGoldChg",   prefix: "$" },
      { key: "vix",    valId: "heroVixVal",    chgId: "heroVixChg",    prefix: "" },
    ];

    mapping.forEach(({ key, valId, chgId, prefix }) => {
      const d = m[key];
      if (!d) return;
      const valEl = document.getElementById(valId);
      const chgEl = document.getElementById(chgId);
      if (valEl) valEl.textContent = prefix + fmt(d.price);
      if (chgEl) {
        const arrow = d.changePercent >= 0 ? "▲" : "▼";
        if (key === "vix" && d.price > 20) {
          chgEl.textContent = `${arrow} ${Math.abs(d.changePercent).toFixed(1)}% · Elevated`;
          chgEl.className = "hero-change negative";
        } else {
          chgEl.textContent = `${arrow} ${Math.abs(d.changePercent).toFixed(1)}%`;
          chgEl.className = `hero-change ${posneg(d.changePercent)}`;
        }
      }
    });
  }

  function renderMiniChart(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (miniCharts[canvasId]) miniCharts[canvasId].destroy();
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, color + "40");
    grad.addColorStop(1, color + "05");
    miniCharts[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data, fill: true, backgroundColor: grad,
          borderColor: color, borderWidth: 1.5,
          pointRadius: 0, tension: 0.4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 800 },
      },
    });
  }

  // ─── TICKER STRIP ─────────────────────────────────────────────────────────
  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    // Gather all stocks across sectors (unique)
    const seen = new Set();
    const items = [];
    Object.values(DATA.sectors).forEach((sec) => {
      sec.stocks.forEach((s) => {
        if (!seen.has(s.ticker) && s.price != null) {
          seen.add(s.ticker);
          items.push(s);
        }
      });
    });
    // Duplicate for infinite scroll
    const html = [...items, ...items]
      .map(
        (s) => `
      <span class="ticker-item">
        <span class="symbol">${s.ticker}</span>
        <span class="price">$${fmt(s.price)}</span>
        <span class="change ${cls(s.changePercent)}">${sign(s.changePercent)}${fmt(s.changePercent, 1)}%</span>
      </span>`
      )
      .join("");
    track.innerHTML = html;
  }

  // ─── SECTOR TABS & STOCK CARDS ────────────────────────────────────────────
  function hookTabs() {
    const tabs = document.querySelectorAll(".sector-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        currentSector = tab.dataset.sector;
        renderSector(currentSector);
        renderCharts();
        renderAnalysis();
      });
    });
  }

  function renderSector(sectorKey) {
    const grid = document.getElementById("stocksGrid");
    if (!grid || !DATA.sectors[sectorKey]) return;
    const stocks = DATA.sectors[sectorKey].stocks;
    grid.innerHTML = stocks.map((s, i) => stockCardHTML(s, i)).join("");
    // Clickable cards → open detail modal
    grid.querySelectorAll(".stock-card").forEach((card) => {
      card.addEventListener("click", () => {
        const ticker = card.dataset.ticker;
        const stock = stocks.find((s) => s.ticker === ticker);
        if (stock) openModal(stock);
      });
    });
    // Add-to-portfolio buttons (event delegation prevents modal from opening)
    grid.querySelectorAll(".add-to-portfolio-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const { ticker, name, price } = btn.dataset;
        if (window.Portfolio) {
          Portfolio.addToPortfolio(ticker, name, price ? parseFloat(price) : null);
        } else {
          window.Auth?.openAuthModal();
        }
      });
    });
  }

  function stockCardHTML(s, i) {
    const bg = LOGO_COLORS[s.ticker] || "#6366f1";
    const ratingCls = (s.aiRating || "").toLowerCase().includes("strong") ? "strong-buy" : "buy";
    const isETF = currentSector === "etfs";
    return `
      <div class="stock-card" data-ticker="${s.ticker}" style="animation-delay:${i * 0.06}s">
        <span class="stock-rank">${s.rank}</span>
        <div class="stock-header">
          <div class="stock-logo" style="background:${bg}">${s.ticker.slice(0, 3)}</div>
          <div class="stock-info">
            <div class="stock-ticker">${s.ticker}</div>
            <div class="stock-name">${s.name}</div>
          </div>
        </div>
        <div class="stock-price-row">
          <span class="stock-price">$${fmt(s.price)}</span>
          <span class="stock-change ${cls(s.changePercent)}">${sign(s.changePercent)}${fmt(s.changePercent, 1)}%</span>
        </div>
        <div class="stock-metrics">
          ${s.pe != null ? `<div class="metric"><span class="metric-label">PE Ratio</span><span class="metric-value">${fmt(s.pe, 1)}</span></div>` : ""}
          <div class="metric"><span class="metric-label">${isETF ? "AUM" : "Mkt Cap"}</span><span class="metric-value">${fmtCompact(s.marketCap)}</span></div>
          ${s.revenueGrowth != null ? `<div class="metric"><span class="metric-label">Rev Growth</span><span class="metric-value ${(s.revenueGrowth || 0) > 0 ? "up" : ""}">${sign(s.revenueGrowth)}${s.revenueGrowth}%</span></div>` : ""}
          ${s.dividendYield != null ? `<div class="metric"><span class="metric-label">Div Yield</span><span class="metric-value">${s.dividendYield}%</span></div>` : ""}
          ${s.returnOnEquity != null ? `<div class="metric"><span class="metric-label">ROE</span><span class="metric-value">${s.returnOnEquity}%</span></div>` : ""}
          ${s.debtToEquity != null ? `<div class="metric"><span class="metric-label">D/E</span><span class="metric-value">${s.debtToEquity}</span></div>` : ""}
        </div>
        <div class="stock-rating ${ratingCls}">
          <span class="rating-dot"></span>
          ${s.aiRating || "Buy"} · Score ${s.aiScore || "—"}/100
        </div>
        <div class="stock-card-footer">
          <span class="stock-card-hint">Click for chart &amp; details</span>
          <button class="add-to-portfolio-btn"
            data-ticker="${s.ticker}"
            data-name="${(s.name || "").replace(/"/g, "&quot;")}"
            data-price="${s.price || ""}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Portfolio
          </button>
        </div>
      </div>`;
  }

  // ─── CHARTS ───────────────────────────────────────────────────────────────
  function renderCharts() {
    renderSectorChart("pe");
    renderAllocationChart();
  }

  function hookChartButtons() {
    document.querySelectorAll(".chart-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderSectorChart(btn.dataset.chart);
      });
    });
  }

  function renderSectorChart(type) {
    const sec = DATA.sectors[currentSector];
    if (!sec) return;
    const stocks = sec.stocks;
    const labels = stocks.map((s) => s.ticker);
    let dataArr, title, bgColors;

    const palette = ["#818cf8", "#6366f1", "#4f46e5", "#22d3ee", "#06b6d4"];

    if (type === "pe") {
      title = `${sec.name} — PE Ratios`;
      dataArr = stocks.map((s) => s.pe || 0);
      bgColors = palette;
    } else if (type === "mcap") {
      title = `${sec.name} — Market Cap ($B)`;
      dataArr = stocks.map((s) => (s.marketCap || 0) / 1e9);
      bgColors = palette;
    } else {
      title = `${sec.name} — AI Composite Score`;
      dataArr = stocks.map((s) => s.aiScore || 0);
      bgColors = stocks.map((s) =>
        (s.aiScore || 0) >= 80 ? "#34d399" : (s.aiScore || 0) >= 65 ? "#22d3ee" : "#fbbf24"
      );
    }

    document.getElementById("chartTitle").textContent = title;
    const canvas = document.getElementById("sectorChart");
    if (sectorChart) sectorChart.destroy();

    sectorChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: dataArr,
          backgroundColor: bgColors,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17,24,39,0.95)",
            titleColor: "#f1f5f9",
            bodyColor: "#94a3b8",
            cornerRadius: 8,
            padding: 12,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: themeColor("--text-secondary"), font: { family: "'JetBrains Mono'", weight: 600 } },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: themeColor("--text-tertiary") },
          },
        },
        animation: { duration: 600 },
      },
    });
  }

  function renderAllocationChart() {
    const sec = DATA.sectors[currentSector];
    if (!sec) return;
    const stocks = sec.stocks;
    const labels = stocks.map((s) => s.ticker);
    const data = stocks.map((s) => (s.marketCap || 1) / 1e9);
    const palette = ["#818cf8", "#6366f1", "#22d3ee", "#34d399", "#fbbf24"];

    const canvas = document.getElementById("allocationChart");
    if (allocationChart) allocationChart.destroy();

    allocationChart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette,
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: themeColor("--text-secondary"),
              padding: 12,
              usePointStyle: true,
              font: { size: 11, family: "'Inter'" },
            },
          },
          tooltip: {
            backgroundColor: "rgba(17,24,39,0.95)",
            titleColor: "#f1f5f9",
            bodyColor: "#e2e8f0",
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `${ctx.label}: $${ctx.parsed.toFixed(0)}B`,
            },
          },
        },
        animation: { duration: 800 },
      },
    });
  }

  // ─── AI ANALYSIS SECTION ──────────────────────────────────────────────────
  function renderAnalysis() {
    const grid = document.getElementById("analysisGrid");
    if (!grid) return;
    const sec = DATA.sectors[currentSector];
    if (!sec) return;

    // Sort by current framework score
    const scored = sec.stocks.map((s) => ({
      ...s,
      fwScore:  computeFrameworkScore(s, currentFramework),
      fwRating: getFrameworkRating(computeFrameworkScore(s, currentFramework)),
    })).sort((a, b) => b.fwScore - a.fwScore);

    const fw = currentFramework;

    grid.innerHTML = scored.map((s) => {
      const bg = LOGO_COLORS[s.ticker] || "#6366f1";

      let fwPoints = [];
      if (fw === "buffett") {
        if (s.pe != null)             fwPoints.push(`P/E of ${s.pe} — ${s.pe < 18 ? "value territory" : s.pe < 28 ? "fair value" : "growth premium"}`);
        if (s.debtToEquity != null)   fwPoints.push(`D/E ${s.debtToEquity} — ${s.debtToEquity < 0.5 ? "fortress balance sheet" : "manageable leverage"}`);
        if (s.returnOnEquity != null) fwPoints.push(`ROE ${s.returnOnEquity}% — ${s.returnOnEquity > 20 ? "exceptional capital returns" : "solid returns"}`);
        if (s.freeCashflow != null)   fwPoints.push(`FCF ${fmtCompact(s.freeCashflow)} — ${s.freeCashflow > 0 ? "positive cash generation" : "cash burn concern"}`);
      } else if (fw === "cathie") {
        if (s.revenueGrowth != null)  fwPoints.push(`Revenue growing ${s.revenueGrowth > 0 ? "+" : ""}${s.revenueGrowth}% — ${s.revenueGrowth > 25 ? "hypergrowth" : "steady expansion"}`);
        fwPoints.push(`AI disruption score: ${s.aiScore}/100`);
        if (s.targetPrice && s.price) {
          const up = (((s.targetPrice - s.price) / s.price) * 100).toFixed(0);
          fwPoints.push(`Analyst target $${s.targetPrice} — ${up > 0 ? "+" : ""}${up}% upside`);
        }
      } else if (fw === "momentum") {
        if (s.changePercent != null)  fwPoints.push(`${s.changePercent >= 0 ? "▲" : "▼"} ${Math.abs(s.changePercent).toFixed(2)}% today — ${s.changePercent >= 0 ? "positive momentum" : "downward pressure"}`);
        if (s.analystCount)           fwPoints.push(`${s.analystCount} Wall Street analysts covering this stock`);
        if (s.targetPrice && s.price) {
          const up = (((s.targetPrice - s.price) / s.price) * 100).toFixed(0);
          fwPoints.push(`Consensus target $${s.targetPrice} (${up > 0 ? "+" : ""}${up}% from here)`);
        }
        fwPoints.push(`Recommendation: ${s.recommendation || s.aiRating || "Buy"}`);
      } else {
        fwPoints = s.aiReasons || [];
      }

      return `
        <div class="analysis-card">
          <div class="analysis-card-header">
            <div class="analysis-card-logo" style="background:${bg}">${s.ticker.slice(0, 3)}</div>
            <div>
              <div class="analysis-card-title">${s.ticker} — ${s.fwRating} (${s.fwScore}/100)</div>
              <div class="analysis-card-subtitle">${s.name}</div>
            </div>
          </div>
          <div class="analysis-body">
            <div class="analysis-text">
              ${fwPoints.map((r) => `• ${r}`).join("<br>")}
            </div>
            <div class="analysis-chips">
              ${s.pe != null ? `<span class="chip blue">PE ${s.pe}</span>` : ""}
              ${s.revenueGrowth != null ? `<span class="chip green">Rev +${s.revenueGrowth}%</span>` : ""}
              ${s.returnOnEquity != null ? `<span class="chip cyan">ROE ${s.returnOnEquity}%</span>` : ""}
              ${s.debtToEquity != null ? `<span class="chip orange">D/E ${s.debtToEquity}</span>` : ""}
              ${s.freeCashflow != null ? `<span class="chip green">FCF ${fmtCompact(s.freeCashflow)}</span>` : ""}
              ${s.targetPrice != null ? `<span class="chip blue">Target $${s.targetPrice}</span>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // ─── SEARCH ───────────────────────────────────────────────────────────────
  function hookSearch() {
    const input = document.getElementById("searchInput");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toUpperCase();
      if (!q) {
        renderSector(currentSector);
        return;
      }
      // Search across all sectors
      let found = [];
      Object.values(DATA.sectors).forEach((sec) => {
        sec.stocks.forEach((s) => {
          if (
            s.ticker.includes(q) ||
            s.name.toUpperCase().includes(q)
          ) {
            found.push(s);
          }
        });
      });
      // Dedupe
      const seen = new Set();
      found = found.filter((s) => {
        if (seen.has(s.ticker)) return false;
        seen.add(s.ticker);
        return true;
      });
      const grid = document.getElementById("stocksGrid");
      if (grid) {
        grid.innerHTML = found.length
          ? found.map((s, i) => stockCardHTML(s, i)).join("")
          : `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-tertiary)">No stocks found for "${input.value}"</div>`;
        // Re-render mini charts for found
        found.forEach((s, i) => {
          const cid = `stockMini_${s.ticker}_${i}`;
          if (s.history5d && s.history5d.length) {
            renderMiniChart(cid, s.history5d, (s.changePercent || 0) >= 0 ? "#34d399" : "#f87171");
          }
        });
        // Re-hook clicks
        grid.querySelectorAll(".stock-card").forEach((card) => {
          card.addEventListener("click", () => {
            const ticker = card.dataset.ticker;
            const stock = found.find((s) => s.ticker === ticker);
            if (stock) openModal(stock);
          });
        });
      }
    });
  }

  // ─── THEME TOGGLE ─────────────────────────────────────────────────────────
  function hookTheme() {
    const btn = document.getElementById("themeToggle");
    const stored = localStorage.getItem("stockinsight_theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    if (btn) {
      btn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("stockinsight_theme", next);
      });
    }
  }

  // ─── STOCK DETAIL MODAL ───────────────────────────────────────────────────
  function hookModal() {
    const overlay = document.getElementById("modalOverlay");
    const closeBtn = document.getElementById("modalClose");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("active");
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay) overlay.classList.remove("active");
    });
  }

  function openModal(s) {
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;

    const bg = LOGO_COLORS[s.ticker] || "#6366f1";
    const upside = s.targetPrice && s.price ? (((s.targetPrice - s.price) / s.price) * 100).toFixed(0) : null;

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
        <div class="analysis-card-logo" style="background:${bg};width:48px;height:48px;font-size:0.8rem">${s.ticker.slice(0, 3)}</div>
        <div>
          <div class="modal-heading">${s.ticker}</div>
          <div class="modal-subhead">${s.name} ${s.sector ? `· ${s.sector}` : ""} ${s.industry ? `· ${s.industry}` : ""}</div>
        </div>
      </div>
      <div class="stock-price-row" style="margin-bottom:16px">
        <span class="stock-price" style="font-size:1.8rem">$${fmt(s.price)}</span>
        <span class="stock-change ${cls(s.changePercent)}" style="font-size:1rem">${sign(s.changePercent)}${fmt(s.changePercent, 1)}%</span>
      </div>
      <div class="modal-metrics">
        ${s.pe != null ? `<div class="modal-metric"><div class="label">PE Ratio</div><div class="value">${fmt(s.pe, 1)}</div></div>` : ""}
        <div class="modal-metric"><div class="label">${currentSector === "etfs" ? "AUM" : "Mkt Cap"}</div><div class="value">${fmtCompact(s.marketCap)}</div></div>
        <div class="modal-metric"><div class="label">AI Score</div><div class="value" style="color:${(s.aiScore || 0) >= 80 ? "var(--green)" : "var(--cyan)"}">${s.aiScore || "—"}/100</div></div>
        ${s.revenueGrowth != null ? `<div class="modal-metric"><div class="label">Rev Growth</div><div class="value">${sign(s.revenueGrowth)}${s.revenueGrowth}%</div></div>` : ""}
        ${s.profitMargin != null ? `<div class="modal-metric"><div class="label">Profit Margin</div><div class="value">${s.profitMargin}%</div></div>` : ""}
        ${s.returnOnEquity != null ? `<div class="modal-metric"><div class="label">ROE</div><div class="value">${s.returnOnEquity}%</div></div>` : ""}
        ${s.debtToEquity != null ? `<div class="modal-metric"><div class="label">Debt/Equity</div><div class="value">${s.debtToEquity}</div></div>` : ""}
        ${s.freeCashflow != null ? `<div class="modal-metric"><div class="label">Free Cash Flow</div><div class="value">${fmtCompact(s.freeCashflow)}</div></div>` : ""}
        ${s.beta != null ? `<div class="modal-metric"><div class="label">Beta</div><div class="value">${s.beta}</div></div>` : ""}
        ${s.dividendYield != null ? `<div class="modal-metric"><div class="label">Div Yield</div><div class="value">${s.dividendYield}%</div></div>` : ""}
        ${s.targetPrice != null ? `<div class="modal-metric"><div class="label">Analyst Target</div><div class="value">$${s.targetPrice}${upside ? ` (+${upside}%)` : ""}</div></div>` : ""}
        ${s.analystCount ? `<div class="modal-metric"><div class="label">Analysts</div><div class="value">${s.analystCount}</div></div>` : ""}
      </div>
      <canvas id="modalChart" class="modal-chart"></canvas>
      <div class="modal-analysis">
        <h4 style="color:var(--accent-1);margin-bottom:8px">🤖 AI Agent Analysis — ${s.aiRating || "Buy"}</h4>
        <ul>
          ${(s.aiReasons || []).map((r) => `<li>${r}</li>`).join("")}
        </ul>
        ${s.fiftyTwoWeekHigh ? `<p style="margin-top:10px">52-week range: <strong>$${s.fiftyTwoWeekLow || "—"}</strong> — <strong>$${s.fiftyTwoWeekHigh}</strong></p>` : ""}
      </div>
    `;

    // Modal chart
    if (s.history5d && s.history5d.length) {
      const color = (s.changePercent || 0) >= 0 ? "#34d399" : "#f87171";
      const mCanvas = document.getElementById("modalChart");
      const ctx = mCanvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 0, mCanvas.height);
      grad.addColorStop(0, color + "30");
      grad.addColorStop(1, color + "05");
      new Chart(ctx, {
        type: "line",
        data: {
          labels: s.history5d.map((_, i) => `Day ${i + 1}`),
          datasets: [{
            label: s.ticker, data: s.history5d, fill: true,
            backgroundColor: grad, borderColor: color, borderWidth: 2,
            pointRadius: 4, pointBackgroundColor: color, tension: 0.3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(17,24,39,0.95)",
              titleColor: "#f1f5f9",
              bodyColor: "#e2e8f0",
              cornerRadius: 8,
              padding: 10,
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: themeColor("--text-tertiary") } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: themeColor("--text-tertiary") } },
          },
        },
      });
    }

    overlay.classList.add("active");
  }

  // ─── EXPOSE UTILITIES FOR OTHER MODULES ──────────────────────────────────
  window.AppUtils = { computeFrameworkScore, getFrameworkRating, FRAMEWORK_META, fmtCompact };

})();
