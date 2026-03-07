#!/usr/bin/env python3
"""
StockInsight Pro — AI Agent MCP Server
=======================================
An agentic Python server that acts as an MCP (Model Context Protocol) tool server.
It fetches LIVE stock data, runs fundamental analysis, scores & ranks stocks,
and serves everything via REST API to the frontend dashboard.

Architecture:
  - Tool 1: fetch_live_prices()      → Yahoo Finance real-time quotes
  - Tool 2: analyze_fundamentals()   → PE, PB, debt/equity, FCF, revenue growth
  - Tool 3: generate_ai_ratings()    → Composite scoring algorithm
  - Tool 4: get_market_context()     → Index prices + macro signals
  - Cache: server-side JSON + daily refresh logic

Run:  python3 stock_agent_server.py
API:  http://localhost:5000/api/...
"""

import json
import os
import time
import traceback
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import yfinance as yf
from flask import Flask, jsonify, request
from flask_cors import CORS

# ─── CONFIG ────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_TTL_HOURS = 4  # Refresh every 4 hours during market hours

# ─── SECTOR DEFINITIONS ───────────────────────────────────────────────────────
SECTORS = {
    "technology": {
        "name": "Technology",
        "tickers": ["NVDA", "MSFT", "AVGO", "AAPL", "GOOGL"],
    },
    "ai": {
        "name": "Artificial Intelligence",
        "tickers": ["NVDA", "AVGO", "PLTR", "AMD", "MRVL"],
    },
    "energy": {
        "name": "Energy",
        "tickers": ["XOM", "CVX", "COP", "SHEL", "SLB"],
    },
    "commodities": {
        "name": "Commodities",
        "tickers": ["GLD", "SLV", "BHP", "FCX", "NEM"],
    },
    "healthcare": {
        "name": "Healthcare",
        "tickers": ["LLY", "UNH", "AZN", "ABBV", "JNJ"],
    },
    "financial": {
        "name": "Financial Services",
        "tickers": ["JPM", "BRK-B", "V", "MA", "GS"],
    },
    "etfs": {
        "name": "ETFs",
        "tickers": ["VOO", "SPY", "QQQ", "SMH", "XLE"],
    },
    "ai_ecosystem": {
        "name": "AI Ecosystem & Storage",
        "tickers": ["DELL", "WDC", "STX", "NTAP", "PSTG"],
    },
    "ai_power": {
        "name": "AI Power & Clean Energy",
        "tickers": ["NEE", "VST", "CEG", "AES", "ETR"],
    },
}

# Market indices for hero section
MARKET_INDICES = {
    "sp500":  {"symbol": "^GSPC",  "name": "S&P 500"},
    "nasdaq": {"symbol": "^IXIC",  "name": "NASDAQ Composite"},
    "oil":    {"symbol": "CL=F",   "name": "Crude Oil (WTI)"},
    "gold":   {"symbol": "GC=F",   "name": "Gold"},
    "vix":    {"symbol": "^VIX",   "name": "VIX"},
}

# All unique tickers across all sectors (for batch fetching)
ALL_TICKERS = sorted(set(
    t for s in SECTORS.values() for t in s["tickers"]
))


# ─── CACHE HELPERS ─────────────────────────────────────────────────────────────
def cache_path(key):
    return CACHE_DIR / f"{key}.json"


def read_cache(key):
    """Read from cache if fresh (within TTL)."""
    fp = cache_path(key)
    if fp.exists():
        data = json.loads(fp.read_text())
        cached_at = datetime.fromisoformat(data.get("_cached_at", "2000-01-01"))
        if datetime.now() - cached_at < timedelta(hours=CACHE_TTL_HOURS):
            return data
    return None


def write_cache(key, data):
    """Write data to cache with timestamp."""
    data["_cached_at"] = datetime.now().isoformat()
    cache_path(key).write_text(json.dumps(data, default=str))


# ─── MCP TOOL 1: FETCH LIVE PRICES ────────────────────────────────────────────
def fetch_live_prices(tickers):
    """
    AI Agent Tool: Fetch real-time stock quotes from Yahoo Finance.
    Returns dict of ticker → {price, change, changePercent, volume, ...}
    """
    print(f"[Agent] 🔄 Tool 1: fetch_live_prices({len(tickers)} tickers)")
    results = {}

    try:
        # Batch download for efficiency
        data = yf.download(tickers, period="5d", interval="1d", group_by="ticker", progress=False)

        for ticker in tickers:
            try:
                if len(tickers) == 1:
                    df = data
                else:
                    df = data[ticker] if ticker in data.columns.get_level_values(0) else None

                if df is None or df.empty:
                    continue

                # Get last close and previous close
                closes = df["Close"].dropna().values
                if len(closes) >= 2:
                    price = float(closes[-1])
                    prev = float(closes[-2])
                    change = price - prev
                    change_pct = (change / prev) * 100
                elif len(closes) == 1:
                    price = float(closes[-1])
                    change = 0
                    change_pct = 0
                else:
                    continue

                # 5-day price history for sparkline
                history = [float(c) for c in closes]

                results[ticker] = {
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_pct, 2),
                    "history5d": history,
                }
            except Exception:
                continue

    except Exception as e:
        print(f"[Agent] ⚠️ Batch download error: {e}")

    # Fill in any missing tickers with individual calls
    missing = [t for t in tickers if t not in results]
    for ticker in missing:
        try:
            tk = yf.Ticker(ticker)
            hist = tk.history(period="5d")
            if hist.empty:
                continue
            closes = hist["Close"].dropna().values
            if len(closes) >= 2:
                price = float(closes[-1])
                prev = float(closes[-2])
                change = price - prev
                change_pct = (change / prev) * 100
            elif len(closes) == 1:
                price = float(closes[-1])
                change = 0
                change_pct = 0
            else:
                continue
            results[ticker] = {
                "price": round(price, 2),
                "change": round(change, 2),
                "changePercent": round(change_pct, 2),
                "history5d": [float(c) for c in closes],
            }
        except Exception:
            continue

    print(f"[Agent] ✅ Fetched prices for {len(results)}/{len(tickers)} tickers")
    return results


# ─── MCP TOOL 2: ANALYZE FUNDAMENTALS ─────────────────────────────────────────
def analyze_fundamentals(tickers):
    """
    AI Agent Tool: Deep fundamental analysis — PE, PB, debt/equity, FCF,
    revenue growth, profit margin, market cap, beta, dividend yield.
    """
    print(f"[Agent] 🔄 Tool 2: analyze_fundamentals({len(tickers)} tickers)")
    results = {}

    for ticker in tickers:
        try:
            tk = yf.Ticker(ticker)
            info = tk.info or {}

            pe = info.get("trailingPE") or info.get("forwardPE")
            pb = info.get("priceToBook")
            mcap = info.get("marketCap")
            beta = info.get("beta")
            div_yield = info.get("dividendYield")
            profit_margin = info.get("profitMargins")
            revenue_growth = info.get("revenueGrowth")
            debt_equity = info.get("debtToEquity")
            fcf = info.get("freeCashflow")
            total_cash = info.get("totalCash")
            total_debt = info.get("totalDebt")
            roe = info.get("returnOnEquity")
            short_name = info.get("shortName", ticker)
            sector = info.get("sector", "")
            industry = info.get("industry", "")
            recommendation = info.get("recommendationKey", "")
            target_price = info.get("targetMeanPrice")
            current_price = info.get("currentPrice") or info.get("regularMarketPrice")
            analyst_count = info.get("numberOfAnalystOpinions", 0)
            fifty_two_high = info.get("fiftyTwoWeekHigh")
            fifty_two_low = info.get("fiftyTwoWeekLow")
            earnings_growth = info.get("earningsGrowth")

            results[ticker] = {
                "name": short_name,
                "sector": sector,
                "industry": industry,
                "pe": round(pe, 2) if pe else None,
                "pb": round(pb, 2) if pb else None,
                "marketCap": mcap,
                "beta": round(beta, 2) if beta else None,
                "dividendYield": round(div_yield * 100, 2) if div_yield else None,
                "profitMargin": round(profit_margin * 100, 2) if profit_margin else None,
                "revenueGrowth": round(revenue_growth * 100, 2) if revenue_growth else None,
                "earningsGrowth": round(earnings_growth * 100, 2) if earnings_growth else None,
                "debtToEquity": round(debt_equity, 2) if debt_equity else None,
                "freeCashflow": fcf,
                "totalCash": total_cash,
                "totalDebt": total_debt,
                "returnOnEquity": round(roe * 100, 2) if roe else None,
                "recommendation": recommendation,
                "targetPrice": round(target_price, 2) if target_price else None,
                "currentPrice": round(current_price, 2) if current_price else None,
                "analystCount": analyst_count,
                "fiftyTwoWeekHigh": round(fifty_two_high, 2) if fifty_two_high else None,
                "fiftyTwoWeekLow": round(fifty_two_low, 2) if fifty_two_low else None,
            }
        except Exception as e:
            print(f"[Agent] ⚠️ Fundamentals error for {ticker}: {e}")
            continue

    print(f"[Agent] ✅ Analyzed fundamentals for {len(results)}/{len(tickers)} tickers")
    return results


# ─── MCP TOOL 3: AI RATING & SCORING ──────────────────────────────────────────
def generate_ai_ratings(prices, fundamentals):
    """
    AI Agent Tool: Composite scoring algorithm.
    Scores stocks 0-100 based on:
      - Valuation (PE, PB)          → 25 pts
      - Growth (revenue, earnings)  → 25 pts
      - Balance Sheet (D/E, FCF)    → 25 pts
      - Analyst consensus           → 25 pts
    Returns ticker → {score, rating, reasons[]}
    """
    print(f"[Agent] 🔄 Tool 3: generate_ai_ratings()")

    RECOMMENDATION_SCORES = {
        "strong_buy": 25, "buy": 20, "hold": 12,
        "sell": 5, "strong_sell": 0
    }

    results = {}

    for ticker, fund in fundamentals.items():
        score = 0
        reasons = []

        # ── Valuation Score (25 pts) ──
        pe = fund.get("pe")
        pb = fund.get("pb")
        val_score = 0
        if pe is not None:
            if pe < 15:
                val_score += 13
                reasons.append(f"Attractively valued with PE of {pe}")
            elif pe < 25:
                val_score += 10
                reasons.append(f"Reasonable valuation with PE of {pe}")
            elif pe < 40:
                val_score += 7
                reasons.append(f"Moderate PE of {pe} — growth premium")
            else:
                val_score += 3
                reasons.append(f"High PE of {pe} — priced for hyper-growth")
        if pb is not None:
            if pb < 3:
                val_score += 12
            elif pb < 8:
                val_score += 8
            else:
                val_score += 4
        else:
            val_score += 6  # neutral if unknown
        score += min(val_score, 25)

        # ── Growth Score (25 pts) ──
        rev_g = fund.get("revenueGrowth")
        earn_g = fund.get("earningsGrowth")
        growth_score = 0
        if rev_g is not None:
            if rev_g > 30:
                growth_score += 13
                reasons.append(f"Exceptional revenue growth of {rev_g}%")
            elif rev_g > 15:
                growth_score += 10
                reasons.append(f"Strong revenue growth of {rev_g}%")
            elif rev_g > 5:
                growth_score += 7
                reasons.append(f"Steady revenue growth of {rev_g}%")
            else:
                growth_score += 3
        else:
            growth_score += 5
        if earn_g is not None:
            if earn_g > 25:
                growth_score += 12
                reasons.append(f"Robust earnings growth of {earn_g}%")
            elif earn_g > 10:
                growth_score += 9
            else:
                growth_score += 4
        else:
            growth_score += 5
        score += min(growth_score, 25)

        # ── Balance Sheet Score (25 pts) ──
        de = fund.get("debtToEquity")
        fcf = fund.get("freeCashflow")
        roe = fund.get("returnOnEquity")
        pm = fund.get("profitMargin")
        bs_score = 0
        if de is not None:
            if de < 50:
                bs_score += 8
                reasons.append(f"Strong balance sheet — D/E ratio of {de}")
            elif de < 100:
                bs_score += 6
                reasons.append(f"Manageable debt — D/E ratio of {de}")
            elif de < 200:
                bs_score += 4
            else:
                bs_score += 2
        else:
            bs_score += 4
        if fcf and fcf > 0:
            bs_score += 6
            reasons.append(f"Positive free cash flow: ${fcf/1e9:.1f}B")
        elif fcf:
            bs_score += 1
        else:
            bs_score += 3
        if roe is not None and roe > 15:
            bs_score += 6
            reasons.append(f"High return on equity: {roe}%")
        elif roe is not None:
            bs_score += 3
        else:
            bs_score += 3
        if pm is not None and pm > 20:
            bs_score += 5
        elif pm is not None:
            bs_score += 3
        else:
            bs_score += 2
        score += min(bs_score, 25)

        # ── Analyst Consensus Score (25 pts) ──
        rec = fund.get("recommendation", "")
        analyst_score = RECOMMENDATION_SCORES.get(rec, 10)
        target = fund.get("targetPrice")
        current = fund.get("currentPrice")
        if target and current and current > 0:
            upside = ((target - current) / current) * 100
            if upside > 30:
                analyst_score = min(analyst_score + 5, 25)
                reasons.append(f"Analysts see {upside:.0f}% upside to ${target}")
            elif upside > 15:
                analyst_score = min(analyst_score + 3, 25)
                reasons.append(f"Analyst target implies {upside:.0f}% upside")
        count = fund.get("analystCount", 0)
        if count and count >= 20:
            reasons.append(f"Strong consensus from {count} analysts")
        score += min(analyst_score, 25)

        # Final score
        score = min(score, 100)
        if score >= 80:
            rating = "Strong Buy"
        elif score >= 65:
            rating = "Buy"
        elif score >= 50:
            rating = "Hold"
        else:
            rating = "Underperform"

        results[ticker] = {
            "score": score,
            "rating": rating,
            "reasons": reasons[:5],  # Top 5 reasons
        }

    print(f"[Agent] ✅ Generated AI ratings for {len(results)} tickers")
    return results


# ─── MCP TOOL 4: MARKET CONTEXT ───────────────────────────────────────────────
def get_market_context():
    """
    AI Agent Tool: Fetch market index prices for hero section.
    Returns index data with price, change, 5-day history.
    """
    print(f"[Agent] 🔄 Tool 4: get_market_context()")
    results = {}

    for key, cfg in MARKET_INDICES.items():
        try:
            tk = yf.Ticker(cfg["symbol"])
            hist = tk.history(period="5d")
            if hist.empty:
                continue
            closes = hist["Close"].dropna().values
            if len(closes) >= 2:
                price = float(closes[-1])
                prev = float(closes[-2])
                change = price - prev
                change_pct = (change / prev) * 100
            elif len(closes) == 1:
                price = float(closes[-1])
                change = 0
                change_pct = 0
            else:
                continue

            results[key] = {
                "name": cfg["name"],
                "symbol": cfg["symbol"],
                "price": round(price, 2),
                "change": round(change, 2),
                "changePercent": round(change_pct, 2),
                "history5d": [round(float(c), 2) for c in closes],
            }
        except Exception as e:
            print(f"[Agent] ⚠️ Index error for {key}: {e}")

    print(f"[Agent] ✅ Market context: {len(results)} indices")
    return results


# ─── ORCHESTRATOR: RUNS ALL TOOLS ─────────────────────────────────────────────
def run_full_agent_pipeline():
    """
    The AI Agent Orchestrator — runs all tools in sequence,
    assembles the complete data payload, caches it.
    """
    print("\n" + "=" * 60)
    print("  🤖 StockInsight Pro — AI Agent Pipeline Starting")
    print("=" * 60)
    start = time.time()

    # Check cache first
    cached = read_cache("full_dashboard")
    if cached:
        age_mins = (datetime.now() - datetime.fromisoformat(cached["_cached_at"])).total_seconds() / 60
        print(f"[Agent] 📦 Using cached data ({age_mins:.0f} min old)")
        return cached

    print("[Agent] 🆕 Cache expired or missing — running full pipeline\n")

    # Step 1: Market context (indices)
    market = get_market_context()

    # Step 2: Fetch live prices for all stock tickers
    prices = fetch_live_prices(ALL_TICKERS)

    # Step 3: Analyze fundamentals
    fundamentals = analyze_fundamentals(ALL_TICKERS)

    # Step 4: Generate AI ratings
    ratings = generate_ai_ratings(prices, fundamentals)

    # Assemble sectors
    sectors = {}
    for sector_key, sector_cfg in SECTORS.items():
        stocks = []
        for i, ticker in enumerate(sector_cfg["tickers"]):
            p = prices.get(ticker, {})
            f = fundamentals.get(ticker, {})
            r = ratings.get(ticker, {})
            stocks.append({
                "rank": i + 1,
                "ticker": ticker,
                "name": f.get("name", ticker),
                "price": p.get("price"),
                "change": p.get("change"),
                "changePercent": p.get("changePercent"),
                "history5d": p.get("history5d", []),
                "pe": f.get("pe"),
                "pb": f.get("pb"),
                "marketCap": f.get("marketCap"),
                "beta": f.get("beta"),
                "dividendYield": f.get("dividendYield"),
                "profitMargin": f.get("profitMargin"),
                "revenueGrowth": f.get("revenueGrowth"),
                "earningsGrowth": f.get("earningsGrowth"),
                "debtToEquity": f.get("debtToEquity"),
                "freeCashflow": f.get("freeCashflow"),
                "totalCash": f.get("totalCash"),
                "totalDebt": f.get("totalDebt"),
                "returnOnEquity": f.get("returnOnEquity"),
                "recommendation": f.get("recommendation"),
                "targetPrice": f.get("targetPrice"),
                "analystCount": f.get("analystCount"),
                "fiftyTwoWeekHigh": f.get("fiftyTwoWeekHigh"),
                "fiftyTwoWeekLow": f.get("fiftyTwoWeekLow"),
                "sector": f.get("sector", ""),
                "industry": f.get("industry", ""),
                "aiScore": r.get("score"),
                "aiRating": r.get("rating"),
                "aiReasons": r.get("reasons", []),
            })
        sectors[sector_key] = {
            "name": sector_cfg["name"],
            "stocks": stocks,
        }

    payload = {
        "market": market,
        "sectors": sectors,
        "fetchedAt": datetime.now().isoformat(),
        "tickerCount": len(ALL_TICKERS),
        "source": "yahoo_finance_live",
    }

    elapsed = time.time() - start
    print(f"\n[Agent] 🏁 Pipeline complete in {elapsed:.1f}s")
    print(f"[Agent] 📊 {len(prices)} prices, {len(fundamentals)} fundamentals, {len(ratings)} ratings")

    write_cache("full_dashboard", payload)
    return payload


# ─── API ROUTES ────────────────────────────────────────────────────────────────
@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    """Main endpoint — returns everything the frontend needs."""
    try:
        force = request.args.get("force", "false").lower() == "true"
        if force:
            # Clear cache to force refresh
            fp = cache_path("full_dashboard")
            if fp.exists():
                fp.unlink()

        data = run_full_agent_pipeline()
        return jsonify({"status": "ok", "data": data})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/stock/<ticker>", methods=["GET"])
def api_stock_detail(ticker):
    """Fetch detailed data for a single stock on-demand."""
    try:
        prices = fetch_live_prices([ticker.upper()])
        fundamentals = analyze_fundamentals([ticker.upper()])
        ratings = generate_ai_ratings(prices, fundamentals)
        return jsonify({
            "status": "ok",
            "data": {
                "prices": prices.get(ticker.upper()),
                "fundamentals": fundamentals.get(ticker.upper()),
                "rating": ratings.get(ticker.upper()),
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """Force refresh all data."""
    fp = cache_path("full_dashboard")
    if fp.exists():
        fp.unlink()
    data = run_full_agent_pipeline()
    return jsonify({"status": "ok", "data": data})


@app.route("/api/health", methods=["GET"])
def api_health():
    """Health check."""
    cache = read_cache("full_dashboard")
    return jsonify({
        "status": "ok",
        "cached": cache is not None,
        "cachedAt": cache.get("_cached_at") if cache else None,
        "server": "StockInsight Pro AI Agent MCP Server",
        "version": "1.0.0",
    })


# ─── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Get port from environment variable (Cloud Run sets this) or default to 5050
    port = int(os.getenv("PORT", 5050))
    
    print("╔══════════════════════════════════════════════════╗")
    print("║  StockInsight Pro — AI Agent MCP Server v1.0    ║")
    print(f"║  http://localhost:{port}                          ║")
    print("║                                                  ║")
    print("║  Endpoints:                                      ║")
    print("║    GET  /api/dashboard   → Full dashboard data   ║")
    print("║    GET  /api/stock/:sym  → Single stock detail   ║")
    print("║    POST /api/refresh     → Force refresh         ║")
    print("║    GET  /api/health      → Server status         ║")
    print("╚══════════════════════════════════════════════════╝\n")
    
    # Use debug=False in production (when PORT is set by Cloud Run)
    is_production = os.getenv("PORT") is not None
    app.run(host="0.0.0.0", port=port, debug=not is_production)
