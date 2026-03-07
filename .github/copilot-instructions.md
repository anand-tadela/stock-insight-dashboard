# GitHub Copilot Instructions - StockInsight Pro

## Project Overview
StockInsight Pro is an AI-powered stock market dashboard featuring:
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 with Chart.js visualizations
- **Backend**: Python Flask MCP (Model Context Protocol) agent server
- **Data Source**: Yahoo Finance via yfinance library
- **Deployment**: Firebase Hosting (frontend), Local/Railway/Render (backend)
- **Design**: Dark theme with glassmorphism, professional financial UI

## Architecture

### Frontend Files
- `index.html` - Main app shell with semantic HTML5
- `app.js` - Core rendering logic (hero, sectors, charts, modals, search)
- `api.js` - API client with localStorage cache and fallback chain
- `data.js` - Static fallback data for offline/demo mode
- `styles.css` - Complete CSS with CSS custom properties for theming

### Backend Files
- `stock_agent_server.py` - Flask REST API + MCP agent with 4 tools:
  - `fetch_live_prices` - Real-time stock data via yfinance
  - `analyze_fundamentals` - PE, market cap, debt/equity, FCF analysis
  - `generate_ai_ratings` - AI score (0-100) and Buy/Strong Buy ratings
  - `get_market_context` - Macro context (Fed policy, geopolitics, sector trends)

### Key Endpoints
- `GET /api/dashboard` - Full dashboard data (all sectors + hero)
- `GET /api/stock/<ticker>` - Single stock detail
- `POST /api/refresh` - Force cache refresh
- `GET /api/health` - Server status check

## Coding Standards

### JavaScript
- **No frameworks**: Pure vanilla JS, ES6+ syntax
- **IIFE pattern**: Wrap code in `(function() { "use strict"; })();`
- **Naming**: camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants
- **DOM**: Use semantic selectors, cache DOM queries
- **Async**: Use async/await, handle errors gracefully with try/catch
- **Comments**: Brief section headers with `// ─── SECTION ───`

### Python
- **Type hints**: Use when clarity helps (e.g., `def fetch_data(ticker: str) -> dict`)
- **Docstrings**: Google-style for functions
- **Error handling**: Comprehensive try/except with logging
- **MCP pattern**: All agent tools return `{"success": bool, "data": any, "error": str}`
- **Caching**: File-based JSON cache with 4-hour TTL

### CSS
- **CSS Variables**: All colors/spacing in `:root` for dark/light themes
- **BEM-like naming**: `.stock-card`, `.stock-card-header`, `.stock-card-logo`
- **Mobile-first**: Use `@media` for responsive breakpoints
- **Performance**: Hardware acceleration with `transform`, `will-change` sparingly

## Data Structures

### Stock Object (JavaScript)
```javascript
{
  rank: 1,
  ticker: "NVDA",
  name: "NVIDIA Corp",
  price: 820.45,
  change: -12.30,
  changePercent: -1.48,
  pe: 62.5,
  marketCap: 2027000000000,
  aiScore: 88,
  aiRating: "Strong Buy",
  revenueGrowth: 125.0,
  profitMargin: 48.0,
  debtToEquity: 35.0,
  freeCashflow: 28000000000,
  returnOnEquity: 95.0,
  recommendation: "strong_buy",
  targetPrice: 1050,
  analystCount: 45,
  history5d: [840, 835, 830, 825, 820],
  aiReasons: [
    "AI GPU leader — 80% market share",
    "Revenue up 125% YoY",
    // ... 3-5 bullet points
  ]
}
```

### Sector Structure
```javascript
{
  name: "Technology",
  stocks: [/* array of stock objects */]
}
```

## Important Patterns

### Adding a New Sector
1. Add to `SECTORS` dict in `stock_agent_server.py`
2. Add logo colors to `LOGO_COLORS` in `app.js`
3. Add sector tab button in `index.html` with `data-sector="key"`
4. Add fallback data object in `data.js`
5. Clear cache: `rm -f cache/*.json`

### Chart Colors (Dark Theme)
- Use `themeColor("--text-secondary")` helper, NOT raw CSS vars
- Chart.js cannot render `var(--color)` properly — resolves to black
- Tooltip colors: `titleColor: "#f1f5f9"`, `bodyColor: "#e2e8f0"`

### API Call Flow
1. `init()` → `getCachedOrFallback()` (instant load, no server hit)
2. User clicks Refresh → `forceRefresh()` → hits `/api/refresh`
3. Fallback chain: server → localStorage → static data

### Cache Strategy
- **Server-side**: JSON files in `cache/` folder (4hr TTL)
- **Client-side**: localStorage with timestamp
- **Always graceful**: Never error if backend is down

## Common Tasks

### Update Stock Tickers in a Sector
Edit the `"tickers": []` array in `stock_agent_server.py` SECTORS dict, then update fallback data in `data.js` to match.

### Change Theme Colors
Modify CSS custom properties in `styles.css` under `[data-theme="dark"]` or `[data-theme="light"]`.

### Add New Chart Type
1. Create canvas element in HTML
2. Add Chart.js config in `app.js`
3. Use `themeColor()` helper for all text colors
4. Set tooltip colors explicitly

### Fix "Black Text on Dark Background"
Chart.js issue — use `themeColor("--variable-name")` instead of passing raw CSS variables. Example:
```javascript
ticks: { color: themeColor("--text-tertiary") }  // ✅ Works
ticks: { color: "var(--text-tertiary)" }         // ❌ Renders black
```

## Testing Checklist
- [ ] Hard refresh browser (Cmd+Shift+R) after JS/CSS changes
- [ ] Test with backend running (`python3 stock_agent_server.py`)
- [ ] Test with backend OFF (should use fallback data)
- [ ] Click Refresh button (should fetch live data if server is up)
- [ ] Open stock modal (chart should render with light-colored axes)
- [ ] Check all 9 sector tabs load
- [ ] Verify GLD and SLV appear in Commodities sector

## Deployment

### Firebase (Frontend)
```bash
firebase deploy --only hosting
```

### Local Backend
```bash
./start.sh  # Starts both Flask server (5050) and static server (8000)
```

### Production Backend Options
- **Railway**: `railway up` (easiest)
- **Render**: Connect GitHub repo, autodeploy
- **Google Cloud Run**: `gcloud run deploy`

After deploying backend, update `API_BASE` in `api.js`:
```javascript
const API_BASE = "https://your-backend-url.com";  // Production
// const API_BASE = "http://localhost:5050";      // Development
```

## Dependencies
- **Python**: flask>=3.0.0, flask-cors>=4.0.0, yfinance>=0.2.36, numpy>=2.0.0, pandas>=3.0.0
- **JavaScript**: Chart.js 4.4.1 (CDN), no build step
- **Fonts**: Inter (sans), JetBrains Mono (code/numbers)

## Key URLs
- **Live Site**: https://stock-insight-dashboard.web.app
- **GitHub**: https://github.com/anand-tadela/stock-insight-dashboard
- **Local Dev**: http://localhost:8000

## Notes for Copilot
- Prefer vanilla JS over frameworks — this is a zero-dependency frontend
- Always maintain fallback gracefully — app must work offline
- Performance matters: minimize reflows, use CSS animations over JS
- Dark theme is primary — light theme is secondary
- Financial data accuracy is critical — test calculations carefully
- Use semantic HTML (section, article, nav) for accessibility
