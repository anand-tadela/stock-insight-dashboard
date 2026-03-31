/**
 * StockInsight Pro — Portfolio Insights Hub
 * ==========================================
 * Three-panel insights engine:
 *   1. Macro Pulse       — Live VIX / oil / S&P correlation warnings
 *   2. Diversification   — Portfolio sector weights vs S&P 500
 *   3. Earnings Calendar — Upcoming earnings for portfolio stocks
 */

(function () {
  "use strict";

  const API_BASE = "https://stockinsight-pro-306494317452.us-central1.run.app";

  // Standard S&P 500 approximate sector weights (2026)
  const SP500_SECTORS = [
    "Technology", "Financial", "Healthcare", "Consumer Disc.",
    "Comm. Services", "Industrials", "Energy",
    "Utilities", "Real Estate", "Materials", "Commodities",
  ];
  const SP500_WEIGHTS = [31, 13, 11, 10.5, 9, 8.5, 3.5, 2.5, 2.5, 2.5, 2.5];

  // Maps internal sector keys → display names
  const SECTOR_KEY_MAP = {
    technology: "Technology",
    ai:         "Technology",   // AI stocks count as tech
    ai_ecosystem: "Technology",
    ai_power:   "Utilities",
    financial:  "Financial",
    healthcare: "Healthcare",
    energy:     "Energy",
    commodities: "Commodities",
    etfs:       "ETFs",
  };

  let divChart     = null;
  let activeTab    = "macro";
  let lastPortfolio = [];
  let lastMarket    = null;
  let lastDashboard = null;
  let earningsCache = [];

  // ─── MACRO PULSE ───────────────────────────────────────────────────────────

  function renderMacroAlerts(marketData) {
    lastMarket = marketData;
    const panel = document.getElementById("macroPanel");
    if (!panel) return;

    if (!marketData) {
      panel.innerHTML = "<p class='insights-loading'>Waiting for market data…</p>";
      return;
    }

    const vix    = marketData.vix?.price;
    const oil    = marketData.oil?.changePercent;
    const sp500  = marketData.sp500?.changePercent;
    const gold   = marketData.gold?.changePercent;

    const cards = [];

    // ── VIX
    if (vix >= 30) {
      cards.push({
        icon: "🚨", level: "danger",
        title: `Extreme Volatility — VIX ${vix.toFixed(1)}`,
        text:  "Fear is extreme. Historically VIX above 30 marks peak panic — but sharp swings can continue. Consider trimming high-beta positions and staying liquid.",
      });
    } else if (vix >= 20) {
      cards.push({
        icon: "⚠️", level: "warning",
        title: `Elevated Volatility — VIX ${vix.toFixed(1)}`,
        text:  "Markets are uneasy. Elevated VIX suggests uncertainty — review your exposure to rate-sensitive and speculative growth stocks.",
      });
    } else if (vix < 15) {
      cards.push({
        icon: "😌", level: "good",
        title: `Calm Markets — VIX ${vix.toFixed(1)}`,
        text:  "Low volatility often breeds complacency. A good time to review portfolio diversification before the next wave of volatility arrives.",
      });
    } else {
      cards.push({
        icon: "📊", level: "neutral",
        title: `Normal Volatility — VIX ${vix.toFixed(1)}`,
        text:  "No unusual volatility signals. Markets are in a stable regime — continue monitoring your positions as usual.",
      });
    }

    // ── Oil
    if (oil != null && Math.abs(oil) >= 3) {
      if (oil > 0) {
        cards.push({
          icon: "🛢️", level: Math.abs(oil) >= 5 ? "warning" : "info",
          title: `Oil Surging ▲ ${oil.toFixed(1)}% Today`,
          text:  "Rising oil boosts energy sector margins but raises costs for airlines, shipping, and consumer goods companies. Check your energy vs. transportation exposure.",
        });
      } else {
        cards.push({
          icon: "🛢️", level: "info",
          title: `Oil Falling ▼ ${Math.abs(oil).toFixed(1)}% Today`,
          text:  "Falling oil is typically good for consumer discretionary and transportation stocks. Energy sector names may face margin pressure.",
        });
      }
    }

    // ── S&P 500
    if (sp500 != null && sp500 <= -1.5) {
      cards.push({
        icon: "📉", level: "warning",
        title: `Broad Market Selloff — S&P 500 Down ${Math.abs(sp500).toFixed(1)}%`,
        text:  "Heavy selling across equities. High-beta and leveraged positions amplify downside on days like this. Check your thesis — don't panic-sell quality.",
      });
    } else if (sp500 != null && sp500 >= 1.5) {
      cards.push({
        icon: "📈", level: "good",
        title: `Risk-On Rally — S&P 500 Up ${sp500.toFixed(1)}%`,
        text:  "Broad market strength is lifting all boats. Growth and momentum stocks typically outperform on strong up days — watch for sector rotation clues.",
      });
    }

    // ── Gold
    if (gold != null && gold >= 1.5) {
      cards.push({
        icon: "🪙", level: "info",
        title: `Gold Rising ▲ ${gold.toFixed(1)}%`,
        text:  "Gold strength often signals inflation fears or risk-off sentiment. Rising gold alongside falling equities suggests defensive positioning in the market.",
      });
    }

    if (cards.length === 0) {
      cards.push({
        icon: "🟢", level: "neutral",
        title: "No Major Macro Signals Today",
        text:  "Market conditions appear stable. VIX, oil, and equity indices show no unusual readings. Good time to review long-term conviction.",
      });
    }

    panel.innerHTML = `
      <div class="macro-grid">
        ${cards.map((c) => `
          <div class="macro-card macro-${c.level}">
            <div class="macro-icon">${c.icon}</div>
            <div class="macro-body">
              <div class="macro-title">${c.title}</div>
              <div class="macro-text">${c.text}</div>
            </div>
          </div>`).join("")}
      </div>`;
  }

  // ─── DIVERSIFICATION ───────────────────────────────────────────────────────

  function renderDiversification(portfolioStocks, dashboardData) {
    lastPortfolio = portfolioStocks || [];
    lastDashboard = dashboardData;
    const panel = document.getElementById("diversityPanel");
    if (!panel) return;

    if (lastPortfolio.length === 0) {
      panel.innerHTML = `<p class="insights-empty">Add stocks to your portfolio to see your sector diversification vs the S&P 500.</p>`;
      return;
    }

    // Map portfolio tickers → sector
    const sectorCounts = {};
    if (dashboardData?.sectors) {
      for (const [key, sec] of Object.entries(dashboardData.sectors)) {
        sec.stocks.forEach((s) => {
          if (lastPortfolio.find((p) => p.ticker === s.ticker)) {
            const name = SECTOR_KEY_MAP[key] || "Other";
            sectorCounts[name] = (sectorCounts[name] || 0) + 1;
          }
        });
      }
    }
    // Any ticker not found in dashboard → "Other"
    lastPortfolio.forEach((ps) => {
      const inDash = dashboardData?.sectors
        ? Object.values(dashboardData.sectors).some((sec) =>
            sec.stocks.find((s) => s.ticker === ps.ticker)
          )
        : false;
      if (!inDash) sectorCounts["Other"] = (sectorCounts["Other"] || 0) + 1;
    });

    const total = Object.values(sectorCounts).reduce((a, b) => a + b, 0);

    // Portfolio weights for each SP500 sector
    const portfolioW = SP500_SECTORS.map((s) => {
      const count = sectorCounts[s] || 0;
      return parseFloat(((count / total) * 100).toFixed(1));
    });

    panel.innerHTML = `
      <div class="diversity-container">
        <div class="diversity-chart-wrap">
          <canvas id="diversityChart"></canvas>
        </div>
        <div class="diversity-legend">
          <div class="diversity-legend-row header">
            <span>Sector</span><span>Yours</span><span>S&P 500</span><span>Gap</span>
          </div>
          ${SP500_SECTORS.map((s, i) => {
            const yours  = portfolioW[i];
            const market = SP500_WEIGHTS[i];
            const gap    = (yours - market).toFixed(1);
            const gc     = parseFloat(gap) > 5 ? "overweight"
                         : parseFloat(gap) < -5 ? "underweight"
                         : "neutral";
            return `
              <div class="diversity-legend-row">
                <span>${s}</span>
                <span>${yours > 0 ? yours + "%" : "—"}</span>
                <span>${market}%</span>
                <span class="gap-badge ${gc}">${parseFloat(gap) >= 0 ? "+" : ""}${gap}%</span>
              </div>`;
          }).join("")}
        </div>
      </div>`;

    // Draw chart
    const canvas = document.getElementById("diversityChart");
    if (!canvas) return;
    if (divChart) divChart.destroy();

    divChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: SP500_SECTORS,
        datasets: [
          {
            label: "Your Portfolio %",
            data:  portfolioW,
            backgroundColor: "#6366f180",
            borderColor:     "#6366f1",
            borderWidth: 2,
            borderRadius: 4,
          },
          {
            label: "S&P 500 %",
            data:  SP500_WEIGHTS,
            backgroundColor: "#22d3ee30",
            borderColor:     "#22d3ee",
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { color: "#94a3b8", font: { size: 11 }, padding: 12 },
          },
          tooltip: {
            backgroundColor: "rgba(17,24,39,0.95)",
            titleColor: "#f1f5f9",
            bodyColor:  "#94a3b8",
            cornerRadius: 8,
            padding: 10,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#94a3b8", font: { size: 9 } },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: "#94a3b8", callback: (v) => v + "%" },
          },
        },
        animation: { duration: 600 },
      },
    });
  }

  // ─── EARNINGS CALENDAR ─────────────────────────────────────────────────────

  async function loadEarnings(portfolioStocks) {
    const panel = document.getElementById("earningsPanel");
    if (!panel) return;

    if (!portfolioStocks || portfolioStocks.length === 0) {
      panel.innerHTML = `<p class="insights-empty">Add stocks to your portfolio to see upcoming earnings dates.</p>`;
      return;
    }

    panel.innerHTML = `<p class="insights-loading">Fetching earnings dates for your portfolio…</p>`;
    earningsCache = [];

    const results = await Promise.allSettled(
      portfolioStocks.map(async (ps) => {
        try {
          const res = await fetch(`${API_BASE}/api/stock/${ps.ticker}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) return { ticker: ps.ticker, name: ps.name || ps.ticker, date: null };
          const json = await res.json();
          const d = json.data;
          if (!d) return { ticker: ps.ticker, name: ps.name || ps.ticker, date: null };
          // Response is { prices, fundamentals, rating } — earningsDate is in fundamentals
          let rawDate = d.fundamentals?.earningsDate || d.earningsDate || d.earnings_date || null;
          if (Array.isArray(rawDate)) rawDate = rawDate[0];
          if (!rawDate) return { ticker: ps.ticker, name: ps.name || ps.ticker, date: null };
          const date = new Date(rawDate);
          if (isNaN(date.getTime())) return { ticker: ps.ticker, name: ps.name || ps.ticker, date: null };
          return { ticker: ps.ticker, name: ps.name || ps.ticker, date };
        } catch {
          return { ticker: ps.ticker, name: ps.name || ps.ticker, date: null };
        }
      })
    );

    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const allEntries = results
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);

    // Stocks with a known upcoming/recent date
    earningsCache = allEntries
      .filter((e) => e.date && e.date >= cutoff)
      .sort((a, b) => a.date - b.date);

    // Stocks with no date — show as TBD
    const tbdEntries = allEntries.filter((e) => !e.date || e.date < cutoff);

    renderEarnings(portfolioStocks, tbdEntries);
  }

  function renderEarnings(portfolioStocks, tbdEntries) {
    const panel = document.getElementById("earningsPanel");
    if (!panel) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasKnown = earningsCache.length > 0;
    const hasTbd   = tbdEntries && tbdEntries.length > 0;

    if (!hasKnown && !hasTbd) {
      panel.innerHTML = `<p class="insights-empty">Add stocks to your portfolio to see upcoming earnings dates.</p>`;
      return;
    }

    const knownRows = earningsCache.map((e) => {
      const daysUntil  = Math.ceil((e.date - today) / (24 * 3600 * 1000));
      const isToday    = daysUntil === 0;
      const isPast     = daysUntil < 0;
      const label      = isToday ? "🔴 Today" : isPast
        ? `${Math.abs(daysUntil)}d ago`
        : `In ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
      const urgency    = isToday ? "earnings-today"
        : (daysUntil <= 7 && daysUntil >= 0 ? "earnings-soon"
        : isPast ? "earnings-past" : "");
      const safeTicker = e.ticker.replace(/'/g, "\\'");
      return `
        <div class="earnings-row ${urgency}">
          <div class="earnings-ticker-block">
            <span class="earnings-ticker">${escHtml(e.ticker)}</span>
            <span class="earnings-name">${escHtml(e.name)}</span>
          </div>
          <div class="earnings-date-block">
            <span class="earnings-date">${e.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <span class="earnings-countdown ${urgency}">${label}</span>
          </div>
          ${!isPast ? `
            <button class="earnings-alert-btn"
              onclick="Portfolio.openAddAlertForm('${safeTicker}'); Portfolio.showToast('Set a price alert for ${escHtml(e.ticker)} earnings day ↓', 'info')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              Set Alert
            </button>` : ""}
        </div>`;
    }).join("");

    const tbdRows = hasTbd ? tbdEntries.map((e) => `
      <div class="earnings-row earnings-tbd">
        <div class="earnings-ticker-block">
          <span class="earnings-ticker">${escHtml(e.ticker)}</span>
          <span class="earnings-name">${escHtml(e.name)}</span>
        </div>
        <div class="earnings-date-block">
          <span class="earnings-date earnings-tbd-label">Date not yet announced</span>
          <span class="earnings-countdown earnings-tbd-hint">Check back closer to quarter-end</span>
        </div>
      </div>`).join("") : "";

    panel.innerHTML = `
      <div class="earnings-list">
        ${hasKnown ? knownRows : ""}
        ${hasTbd ? `
          ${hasKnown ? `<div class="earnings-divider"><span>No confirmed date yet</span></div>` : ""}
          ${tbdRows}
        ` : ""}
      </div>`;
  }

  // ─── TABS HOOK ─────────────────────────────────────────────────────────────

  function hookTabs() {
    const panels = {
      macro:    document.getElementById("macroPanel"),
      diversity: document.getElementById("diversityPanel"),
      earnings:  document.getElementById("earningsPanel"),
    };
    // Hide non-default panels on load
    panels.diversity && (panels.diversity.style.display = "none");
    panels.earnings  && (panels.earnings.style.display  = "none");

    document.querySelectorAll(".itab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".itab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        activeTab = tab.dataset.tab;
        Object.entries(panels).forEach(([key, el]) => {
          if (el) el.style.display = key === activeTab ? "" : "none";
        });
        // Lazy-load diversification chart when tab is clicked (needs visible canvas)
        if (activeTab === "diversity" && lastPortfolio.length > 0) {
          renderDiversification(lastPortfolio, lastDashboard);
        }
      });
    });
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

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  window.Insights = {
    hookTabs,
    renderMacroAlerts,
    renderDiversification,
    loadEarnings,
  };
})();
