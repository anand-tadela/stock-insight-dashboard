/**
 * StockInsight Pro — Paper Trade Mode
 * =====================================
 * Simulated trading with P&L tracking. No real money involved.
 * Firestore: users/{uid}/paperTrades/{id}
 */

(function () {
  "use strict";

  const API_BASE = "https://stockinsight-pro-306494317452.us-central1.run.app";

  let currentUserId = null;
  let paperTrades   = [];

  // ─── LOAD ──────────────────────────────────────────────────────────────────

  async function loadPaperTrades(uid) {
    currentUserId = uid;
    try {
      const snap = await fbDB
        .collection("users").doc(uid)
        .collection("paperTrades")
        .orderBy("buyDate", "desc")
        .get();
      paperTrades = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("[PaperTrade] Load error:", err);
      paperTrades = [];
    }
    renderPaperTrades();
  }

  // ─── ADD ───────────────────────────────────────────────────────────────────

  async function addPaperTrade(rawTicker, shares, buyPrice) {
    if (!currentUserId) return;
    const ticker = rawTicker.toUpperCase().trim();

    // Try to resolve name
    let name = ticker;
    if (window.APP_DATA?.sectors) {
      for (const sec of Object.values(window.APP_DATA.sectors)) {
        const found = sec.stocks.find((s) => s.ticker === ticker);
        if (found) { name = found.name; break; }
      }
    }
    if (name === ticker) {
      try {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.name) name = json.data.name;
        }
      } catch { /* keep ticker as name */ }
    }

    const trade = {
      ticker,
      name,
      shares:   parseFloat(shares),
      buyPrice: parseFloat(buyPrice),
      buyDate:  new Date().toISOString(),
    };

    try {
      const docRef = await fbDB
        .collection("users").doc(currentUserId)
        .collection("paperTrades")
        .add(trade);
      paperTrades.unshift({ id: docRef.id, ...trade });
      renderPaperTrades();
      window.Portfolio?.showToast(
        `Paper trade: ${parseFloat(shares)} × ${ticker} @ $${parseFloat(buyPrice).toFixed(2)}`
      );
    } catch (err) {
      console.error("[PaperTrade] Add error:", err);
      window.Portfolio?.showToast("Failed to save paper trade.", "error");
    }
  }

  // ─── REMOVE ────────────────────────────────────────────────────────────────

  async function removePaperTrade(tradeId) {
    if (!currentUserId) return;
    try {
      await fbDB
        .collection("users").doc(currentUserId)
        .collection("paperTrades")
        .doc(tradeId)
        .delete();
      paperTrades = paperTrades.filter((t) => t.id !== tradeId);
      renderPaperTrades();
    } catch (err) {
      console.error("[PaperTrade] Remove error:", err);
    }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  function renderPaperTrades() {
    const grid     = document.getElementById("paperTradeGrid");
    const empty    = document.getElementById("paperTradeEmpty");
    const totalEl  = document.getElementById("paperTradeTotalPnL");
    if (!grid) return;

    if (paperTrades.length === 0) {
      grid.innerHTML = "";
      empty?.classList.remove("hidden");
      if (totalEl) totalEl.innerHTML = "";
      return;
    }
    empty?.classList.add("hidden");

    // Build live price map
    const priceMap = {};
    if (window.APP_DATA?.sectors) {
      Object.values(window.APP_DATA.sectors).forEach((sec) =>
        sec.stocks.forEach((s) => { if (s.price != null) priceMap[s.ticker] = s.price; })
      );
    }

    let totalCost  = 0;
    let totalValue = 0;

    grid.innerHTML = paperTrades.map((t) => {
      const curr      = priceMap[t.ticker] ?? null;
      const cost      = t.shares * t.buyPrice;
      const value     = curr != null ? t.shares * curr : null;
      const pnl       = value != null ? value - cost : null;
      const pnlPct    = pnl  != null ? ((pnl / cost) * 100).toFixed(2) : null;
      const pnlClass  = pnl  == null ? "neutral" : pnl >= 0 ? "up" : "down";
      if (value != null) { totalCost += cost; totalValue += value; }
      const safeId   = t.id.replace(/'/g, "\\'");
      const dateStr  = new Date(t.buyDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return `
<div class="paper-card">
  <div class="paper-card-header">
    <div>
      <div class="paper-ticker">${escHtml(t.ticker)}</div>
      <div class="paper-name">${escHtml(t.name)}</div>
    </div>
    <button class="portfolio-remove" onclick="PaperTrade.removePaperTrade('${safeId}')" title="Remove">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div class="paper-details">
    <div class="paper-metric"><span>Shares</span><strong>${t.shares}</strong></div>
    <div class="paper-metric"><span>Bought @</span><strong>$${parseFloat(t.buyPrice).toFixed(2)}</strong></div>
    <div class="paper-metric"><span>Current</span><strong>${curr != null ? "$" + curr.toFixed(2) : "—"}</strong></div>
    <div class="paper-metric"><span>Cost Basis</span><strong>$${cost.toFixed(0)}</strong></div>
  </div>
  ${pnl != null
    ? `<div class="paper-pnl ${pnlClass}">
         <span>${pnl >= 0 ? "▲" : "▼"} $${Math.abs(pnl).toFixed(2)}</span>
         <span class="paper-pnl-pct">${parseFloat(pnlPct) >= 0 ? "+" : ""}${pnlPct}%</span>
       </div>`
    : `<div class="paper-pnl neutral">Price unavailable</div>`}
  <div class="paper-date">Added ${dateStr}</div>
</div>`;
    }).join("");

    // Total P&L bar
    if (totalEl && totalCost > 0) {
      const totalPnL = totalValue - totalCost;
      const totalPct = ((totalPnL / totalCost) * 100).toFixed(2);
      const cls      = totalPnL >= 0 ? "up" : "down";
      totalEl.innerHTML = `
        <span>Portfolio P&amp;L: </span>
        <strong class="${cls}">${totalPnL >= 0 ? "+" : ""}$${Math.abs(totalPnL).toFixed(2)}
          (${parseFloat(totalPct) >= 0 ? "+" : ""}${totalPct}%)</strong>`;
    }
  }

  // ─── FORM ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("paperTradeForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUserId) { window.Auth?.openAuthModal(); return; }
      const ticker = document.getElementById("ptTicker")?.value.trim();
      const shares = document.getElementById("ptShares")?.value.trim();
      const price  = document.getElementById("ptPrice")?.value.trim();
      if (!ticker || !shares || !price) {
        window.Portfolio?.showToast("Fill in all fields", "error");
        return;
      }
      if (parseFloat(shares) <= 0 || parseFloat(price) <= 0) {
        window.Portfolio?.showToast("Shares and price must be greater than 0", "error");
        return;
      }
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;
      await addPaperTrade(ticker, shares, price);
      form.reset();
      if (btn) btn.disabled = false;
    });
  });

  // ─── CLEAR (on sign-out) ───────────────────────────────────────────────────

  function clear() {
    currentUserId = null;
    paperTrades   = [];
    const grid = document.getElementById("paperTradeGrid");
    if (grid) grid.innerHTML = "";
    document.getElementById("paperTradeEmpty")?.classList.remove("hidden");
    const totalEl = document.getElementById("paperTradeTotalPnL");
    if (totalEl) totalEl.innerHTML = "";
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

  window.PaperTrade = {
    loadPaperTrades,
    addPaperTrade,
    removePaperTrade,
    renderPaperTrades,
    clear,
  };
})();
