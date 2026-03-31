# StockInsight Pro — AI-Powered Market Intelligence Dashboard

A full-stack stock market dashboard featuring an AI agent backend (Python/Flask) that fetches **live data** from Yahoo Finance, scores stocks using a composite fundamental analysis algorithm, and serves it all to a sleek browser-based frontend — with phone authentication, personal portfolio tracking, and real-time price alerts via push notifications.

**Live:** https://stock-insight-dashboard.web.app

## Features

### Core Dashboard
- **Live stock prices** — fetched via Yahoo Finance (`yfinance`)
- **AI Composite Scoring** — 100-point algorithm across Valuation, Growth, Balance Sheet & Analyst Consensus
- **7 Sectors** — Technology, AI, Energy, Commodities, Healthcare, Financial, ETFs
- **Market Hero** — Real-time S&P 500, NASDAQ-100, Crude Oil, Gold, VIX
- **Interactive Charts** — PE ratios, Market Cap, AI Score bar charts + sector donut
- **Stock Detail Modal** — Full fundamental data + 5-day sparkline
- **Light/Dark Theme** — Persisted to localStorage
- **Search** — Filter stocks across all sectors in real-time
- **Graceful Fallback** — Static data when the server is offline

### Authentication
- **Phone Number Auth** — Sign in with mobile number + SMS OTP (Firebase Phone Auth)
- **Persistent Sessions** — Stays signed in across browser sessions

### Personal Portfolio
- **Add any stock** — Search any ticker (TSLA, BTC-USD, NVDA, etc.), not just listed ones
- **Real-time lookup** — Resolves company name and current price via Cloud Run backend
- **Portfolio overview** — Track all your holdings in one place

### Price Alerts & Push Notifications
- **Custom alerts** — Set above/below price targets on any stock in your portfolio
- **Background monitoring** — Cloud Function runs every 10 minutes during market hours (Mon–Fri, 9:25am–4:05pm ET)
- **Push notifications** — Receive alerts on your device even when the browser is closed (via Firebase Cloud Messaging)
- **In-app toasts** — Foreground alerts shown instantly when the tab is open

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

**Local Development:**
```bash
python3 stock_agent_server.py
```

The server will start on **http://localhost:5050** and immediately begin fetching live data from Yahoo Finance. The first run takes ~30–60 seconds while it fetches prices and fundamentals for all 33 tickers.

**Production Deployment (Google Cloud Run):**

For production deployment with zero cost (within free tier), see [CLOUD_RUN_DEPLOYMENT.md](CLOUD_RUN_DEPLOYMENT.md)

Quick deploy:
```bash
./deploy-cloudrun.sh
```

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

---

## Architecture

```
Browser (index.html)
    │
    ├── styles.css               — Design system & component styles
    ├── app.js                   — Dashboard rendering & interactions
    ├── api.js                   — API client (Cloud Run → cache → fallback)
    ├── data.js                  — Static fallback data (used if server offline)
    ├── firebase-config.js       — Firebase initialization (Auth, Firestore, Messaging)
    ├── auth.js                  — Phone OTP authentication & user state
    ├── portfolio.js             — Portfolio management & price alerts UI
    └── fcm.js                   — FCM token registration & foreground message handler
          │
          ▼
    Cloud Run Backend (stock_agent_server.py)       Firebase (Blaze plan)
          │                                               │
          ├── fetch_live_prices()                    ├── Firebase Auth (Phone OTP)
          ├── analyze_fundamentals()                 ├── Firestore (portfolio & alerts)
          ├── generate_ai_ratings()                  ├── Cloud Messaging (FCM push)
          └── get_market_context()                   └── Cloud Functions (cron alerts)
                │                                               │
                └── cache/  (4hr TTL)              checkPriceAlerts  ← every 10 min
                                                   Mon–Fri 9:25am–4:05pm ET
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard` | Full dashboard data (prices, fundamentals, ratings) |
| `GET` | `/api/dashboard?force=true` | Force-refresh, bypass cache |
| `GET` | `/api/stock/:ticker` | Single stock detail (used for portfolio ticker lookup) |
| `POST` | `/api/refresh` | Force-refresh all data |
| `GET` | `/api/health` | Server health check |

## Firestore Data Model

```
users/{uid}/
    portfolio/{ticker}
        name        — Company name
        ticker      — Stock symbol
        addedAt     — Timestamp

    alerts/{alertId}
        ticker      — Stock symbol
        targetPrice — Price threshold
        direction   — "above" | "below"
        active      — true until triggered
        triggeredAt — Timestamp (set when fired)
        triggeredPrice — Price at trigger time

    fcmTokens/{token}
        token       — FCM registration token
        createdAt   — Timestamp
```

## Cloud Function — `checkPriceAlerts`

- **Schedule**: every 10 minutes, Mon–Fri, 9:25am–4:05pm America/New_York
- **Runtime**: Node 20, Cloud Functions v2 (us-central1)
- **Library**: `yahoo-finance2` for live price lookup
- **Flow**:
  1. Queries all `active: true` alerts across all users
  2. Fetches current price for each unique ticker
  3. Checks if target is breached
  4. Marks triggered alerts as `active: false`
  5. Sends FCM multicast push notification to user's devices
  6. Prunes stale/invalid FCM tokens automatically



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

**Notification permission denied**
→ Go to browser site settings for `stock-insight-dashboard.web.app` and allow Notifications, then sign out and back in

**Push notifications not arriving**
→ Ensure you allowed notification permission when prompted after sign-in. Background alerts only fire during market hours (Mon–Fri, 9:25am–4:05pm ET).

**Data looks stale**
→ Click the **Refresh** button in the top bar, or delete the `cache/` folder and restart the server

## Disclaimer

This dashboard is for **educational and informational purposes only**. Data sourced from Yahoo Finance. This is **not investment advice**.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**Anand Tadela** © 2026

- GitHub: [@anand-tadela](https://github.com/anand-tadela)
- Live Demo: https://stock-insight-dashboard.web.app
