# GitHub Copilot Instructions - StockInsight Pro

## Project Overview
StockInsight Pro is an AI-powered stock market dashboard featuring:
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 with Chart.js visualizations
- **Backend**: Python Flask MCP (Model Context Protocol) agent server
- **Data Source**: Yahoo Finance via yfinance library
- **Deployment**: Firebase Hosting (frontend), Google Cloud Run (backend - serverless containers)
- **Design**: Dark theme with glassmorphism, professional financial UI
- **Production URL**: https://stock-insight-dashboard.web.app
- **Backend API**: https://stockinsight-pro-306494317452.us-central1.run.app

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

### Deployment Files
- `Dockerfile` - Container image definition for Cloud Run
- `.dockerignore` - Docker build exclusions
- `.gcloudignore` - Cloud Build upload exclusions
- `deploy-cloudrun.sh` - Automated deployment script
- `CLOUD_RUN_DEPLOYMENT.md` - Complete deployment guide
- `firebase.json` - Firebase hosting configuration

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
- **Caching**: File-based JSON cache with 4-hour TTL in `cache/` directory
- **Environment**: Read PORT from `os.getenv("PORT", 5050)` for Cloud Run compatibility
- **Production Mode**: Set `debug=False` when PORT env var exists (Cloud Run sets automatically)

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
- [ Local Development

**Backend:**
```bash
python3 stock_agent_server.py
# Server runs on http://localhost:5050
```

**Frontend (for testing):**
```bash
python3 -m http.server 8080
# Dashboard at http://localhost:8080
# Update api.js temporarily to use http://localhost:5050
```

### Google Cloud Run (Production Backend)

**Current Deployment:**
- **Project ID**: `stockinsight-pro-60001`
- **Service**: `stockinsight-pro`
- **Region**: `us-central1`
- **URL**: `https://stockinsight-pro-306494317452.us-central1.run.app`

**Configuration:**
- Memory: 512Mi
- CPU: 1
- Timeout: 60s
- Max instances: 10

### Python (Backend)
```txt
flask==3.1.3
flask-cors==6.0.2
yfinance==1.2.0
pandas==3.0.1
numpy==2.4.2
requests==2.32.5
```

### JavaScript (Frontend - CDN)
- **Chart.js**: 4.4.1 (from cdn.jsdelivr.net)
- **Chart.js Plugin Datalabels**: 2.2.0
- **No build step required** - pure vanilla JS

### Fonts
- **Inter**: Variable font from Google Fonts
- **JetBrains Mono**: Monospace for numbers/code
**Deployment Script:**
```bash
chmod +x deploy-cloudrun.sh
./deploy-cloudrun.sh
```

**Manual Deployment:**
```bash
# Build and push to Artifact Registry
gcloud builds submit --tag us-central1-docker.pkg.dev/stockinsight-pro-60001/stockinsight-repo/stockinsight-pro

# Deploy to Cloud Run
gcloud run deploy stockinsight-pro \
  --image us-central1-docker.pkg.dev/stockinsight-pro-60001/stockinsight-repo/stockinsight-pro \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --port 8080
```

**View Logs:**
```bash
gcloud run services logs read stockinsight-pro --region us-central1 --limit 50
```

### Firebase Hosting (Production Frontend)

```bash
firebase deploy --only hosting
```

**After backend updates**, ensure `api.js` points to production:
```javascript
const API_BASE = "https://stockinsight-pro-306494317452.us-central1.run.app";  // Production
// const API_BASE = "http://localhost:5050";  // Development
```

### Docker (For Testing)

**Build locally:**
```bash
docker build -t stockinsight-pro .
docker run -p 8080:8080 stockinsight-pro
```

**Dockerfile Notes:**
- Base image: `python:3.11-slim`
- Installs gcc for compilation
- Reads PORT from environment (8080 for Cloud Run, 5050 for local)
- CrBackend API**: https://stockinsight-pro-306494317452.us-central1.run.app
- **API Health**: https://stockinsight-pro-306494317452.us-central1.run.app/api/health
- **Cloud Run Console**: https://console.cloud.google.com/run/detail/us-central1/stockinsight-pro/metrics?project=stockinsight-pro-60001
- *Cost & Performance

### Cloud Run Free Tier
- **2 million requests/month** (far exceeds usage)
- **360,000 vCPU-seconds/month**
- **180,000 GiB-seconds memory/month**

### Current Usage
- ~180 requests/month (with 4-hour caching)
- **Estimated cost: $0/month** (within free tier)

### Performance Optimizations
1. **Server-side caching**: 4-hour TTL prevents excessive Yahoo Finance API calls
2. **Scale to zero**: Cloud Run spins down when idle (no base cost)
3. **Client-side cache**: localStorage reduces server requests
4. **CDN delivery**: Firebase Hosting serves static assets globally
5. **Lazy loading**: Charts render only when sector tab is active

## Troubleshooting

### Backend Issues
- **Cold starts**: First request after idle takes 5-10 seconds (normal for Cloud Run)
- **Yahoo Finance errors**: Always have fallback data, never let API failures crash
- **Timeout errors**: Increase Cloud Run timeout if needed: `--timeout 90s`

### Frontend Issues
- **Black text on charts**: Use `themeColor()` helper, NOT raw CSS variables
- **CORS errors**: Verify Flask-CORS installed and API_BASE URL correct
- **Cache issues**: Clear localStorage: `localStorage.removeItem("stockinsight_dashboard_cache")`

### Deployment Issues
- **Build fails**: Check Dockerfile syntax, ensure requirements.txt is complete
- **Permission errors**: Run `gcloud auth login` and verify project billing is enabled
- **Service unreachable**: Check Cloud Run service is deployed and allows unauthenticated access

## Notes for Copilot
- Prefer vanilla JS over frameworks — this is a zero-dependency frontend
- Always maintain fallback gracefully — app must work offline
- Performance matters: minimize reflows, use CSS animations over JS
- Dark theme is primary — light theme is secondary
- Financial data accuracy is critical — test calculations carefully
- Use semantic HTML (section, article, nav) for accessibility
- **Cloud Run specific**: Always read PORT from environment, set debug=False in production
- **Docker best practices**: Keep image small, use .dockerignore to exclude unnecessary files
- **Caching strategy**: Respect 4-hour TTL, never let cache grow unbounded
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
