# StockInsight Pro — AI-Powered Market Intelligence Dashboard

A full-stack stock market dashboard featuring an AI agent backend (Python/Flask) that fetches **live data** from Yahoo Finance, scores stocks using a composite fundamental analysis algorithm, and serves it all to a sleek browser-based frontend.

## Features

- **Live stock prices** — fetched via Yahoo Finance (`yfinance`)
- **AI Composite Scoring** — 100-point algorithm across Valuation, Growth, Balance Sheet & Analyst Consensus
- **7 Sectors** — Technology, AI, Energy, Commodities, Healthcare, Financial, ETFs
- **Market Hero** — Real-time S&P 500, NASDAQ-100, Crude Oil, Gold, VIX
- **Interactive Charts** — PE ratios, Market Cap, AI Score bar charts + sector donut
- **Stock Detail Modal** — Full fundamental data + 5-day sparkline
- **Light/Dark Theme** — Persisted to localStorage
- **Search** — Filter stocks across all sectors in real-time
- **Graceful Fallback** — Static data when the server is offline

---

## Quick Start

### 1. Prerequisites

- Python 3.9+
- A modern browser (Chrome, Firefox, Safari, Edge)

### 2. Install Python Dependencies

Using **uv** (recommended — 10–100× faster than pip):

```bash
cd stock-insight-dashboard
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# Install dependencies
uv pip install -r requirements.txt --system
```

Or with plain pip:

```bash
pip install -r requirements.txt
```

### 3. Start the AI Agent MCP Server

```bash
python3 stock_agent_server.py
```

The server will start on **http://localhost:5000** and immediately begin fetching live data from Yahoo Finance. The first run takes ~30–60 seconds while it fetches prices and fundamentals for all 33 tickers.

### 4. Open the Dashboard

Open `index.html` directly in your browser:

```bash
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

Or serve it from a local HTTP server for best results:

```bash
# Python built-in server
python3 -m http.server 8080
# Then open http://localhost:8080
```

---

## Architecture

```
Browser (index.html)
    │
    ├── styles.css          — Design system & component styles
    ├── app.js              — Dashboard rendering & interactions
    ├── api.js              — API client (MCP server → cache → fallback)
    └── data.js             — Static fallback data (used if server offline)
          │
          ▼
    MCP Agent Server (stock_agent_server.py)
          │
          ├── Tool 1: fetch_live_prices()     — Yahoo Finance real-time quotes
          ├── Tool 2: analyze_fundamentals()  — PE, D/E, FCF, ROE, revenue growth
          ├── Tool 3: generate_ai_ratings()   — 100-pt composite scoring
          └── Tool 4: get_market_context()    — Index prices (S&P500, VIX, etc.)
                │
                └── cache/   — Server-side JSON cache (4-hour TTL)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard` | Full dashboard data (prices, fundamentals, ratings) |
| `GET` | `/api/dashboard?force=true` | Force-refresh, bypass cache |
| `GET` | `/api/stock/:ticker` | Single stock detail |
| `POST` | `/api/refresh` | Force-refresh all data |
| `GET` | `/api/health` | Server health check |

## AI Scoring Algorithm

Each stock is scored **0–100** across four pillars (25 pts each):

| Pillar | Signals |
|--------|---------|
| **Valuation** | PE Ratio, Price-to-Book |
| **Growth** | Revenue Growth %, Earnings Growth % |
| **Balance Sheet** | Debt/Equity, Free Cash Flow, ROE, Profit Margin |
| **Analyst Consensus** | Recommendation key, Analyst count, Price target upside |

Ratings:
- **Strong Buy** → Score ≥ 80
- **Buy** → Score ≥ 65
- **Hold** → Score ≥ 50
- **Underperform** → Score < 50

## Sectors & Tickers

| Sector | Tickers |
|--------|---------|
| Technology | NVDA, MSFT, AVGO, AAPL, GOOGL |
| AI | NVDA, AVGO, PLTR, AMD, MRVL |
| Energy | XOM, CVX, COP, SHEL, SLB |
| Commodities | GLD, SLV, BHP, FCX, NEM |
| Healthcare | LLY, UNH, AZN, ABBV, JNJ |
| Financial | JPM, BRK-B, V, MA, GS |
| ETFs | VOO, SPY, QQQ, SMH, XLE |

## Cache

- Server-side cache stored in `cache/` directory (auto-created)
- Default TTL: **4 hours**
- Browser also caches in `localStorage` as secondary fallback
- Force refresh: click the **Refresh** button in the dashboard or `POST /api/refresh`

## Troubleshooting

**Dashboard shows static/cached data**
→ Make sure the Python server is running: `python3 stock_agent_server.py`

**`ModuleNotFoundError: No module named 'yfinance'`**
→ Run `pip install -r requirements.txt`

**CORS errors in browser console**
→ Ensure `flask-cors` is installed and the server is running on port 5000

**Data looks stale**
→ Click the **Refresh** button in the top bar, or delete the `cache/` folder and restart the server

## Disclaimer

This dashboard is for **educational and informational purposes only**. Data sourced from Yahoo Finance. This is **not investment advice**.
