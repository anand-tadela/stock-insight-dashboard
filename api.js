/**
 * StockInsight Pro — API Client
 * ==============================
 * Connects to the Python MCP Agent Server (localhost:5000)
 * Falls back to localStorage cache if server is unavailable.
 *
 * Architecture:
 *   Browser → api.js → MCP Agent Server (Python) → Yahoo Finance
 *                   ↘ localStorage fallback cache
 */

const API_BASE = "http://localhost:5050";
const CACHE_KEY = "stockinsight_dashboard_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const StockAPI = {
  /** True if last fetch came from the live MCP server */
  isLive: false,
  /** Timestamp of last successful fetch */
  lastFetched: null,

  /**
   * Main entry — get full dashboard data.
   * Tries MCP Agent Server first, falls back to localStorage cache.
   */
  async getDashboard(forceRefresh = false) {
    // 1. Try the MCP Agent Server
    try {
      const url = forceRefresh
        ? `${API_BASE}/api/dashboard?force=true`
        : `${API_BASE}/api/dashboard`;

      const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.status === "ok" && json.data) {
        this.isLive = true;
        this.lastFetched = new Date();
        // Persist to localStorage as fallback
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: json.data,
          cachedAt: this.lastFetched.toISOString(),
        }));
        console.log("[API] ✅ Live data from MCP Agent Server");
        return json.data;
      }
    } catch (err) {
      console.warn("[API] ⚠️ MCP server unavailable:", err.message);
    }

    // 2. Try localStorage cache
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        const age = Date.now() - new Date(cachedAt).getTime();
        this.isLive = false;
        this.lastFetched = new Date(cachedAt);
        console.log(`[API] 📦 Using cached data (${Math.round(age / 60000)} min old)`);
        return data;
      }
    } catch (e) {
      console.warn("[API] Cache read error:", e);
    }

    // 3. Fall back to static fallback data (data.js)
    console.log("[API] 🔄 Using static fallback data");
    this.isLive = false;
    this.lastFetched = null;
    return window.FALLBACK_DATA || null;
  },

  /**
   * Load from localStorage cache or static fallback ONLY — no server call.
   * Used on page load for instant render.
   */
  getCachedOrFallback() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        this.isLive = false;
        this.lastFetched = new Date(cachedAt);
        console.log("[API] 📦 Loaded from localStorage cache");
        return data;
      }
    } catch (e) {
      console.warn("[API] Cache read error:", e);
    }
    console.log("[API] 🔄 Using static fallback data — click Refresh for live prices");
    this.isLive = false;
    this.lastFetched = null;
    return window.FALLBACK_DATA || null;
  },

  /**
   * Force refresh — clears server cache and re-fetches everything.
   */
  async forceRefresh() {
    try {
      const res = await fetch(`${API_BASE}/api/refresh`, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === "ok" && json.data) {
        this.isLive = true;
        this.lastFetched = new Date();
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: json.data,
          cachedAt: this.lastFetched.toISOString(),
        }));
        return json.data;
      }
    } catch (err) {
      console.error("[API] Refresh failed:", err.message);
      throw err;
    }
  },

  /**
   * Load from localStorage cache or static fallback ONLY.
   * Never contacts the server — used on page load for instant render.
   */
  getCachedOrFallback() {
    // 1. Try localStorage cache
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        this.isLive = false;
        this.lastFetched = new Date(cachedAt);
        console.log("[API] 📦 Loaded from localStorage cache");
        return data;
      }
    } catch (e) {
      console.warn("[API] Cache read error:", e);
    }
    // 2. Static fallback
    console.log("[API] 🔄 Using static fallback data — click Refresh for live prices");
    this.isLive = false;
    this.lastFetched = null;
    return window.FALLBACK_DATA || null;
  },

  /**
   * Get single stock detail.
   */
  async getStockDetail(ticker) {
    try {
      const res = await fetch(`${API_BASE}/api/stock/${ticker}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data;
    } catch (err) {
      console.warn(`[API] Stock detail error for ${ticker}:`, err.message);
      return null;
    }
  },

  /**
   * Health check — is the MCP server running?
   */
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { online: false };
      const json = await res.json();
      return { online: true, ...json };
    } catch {
      return { online: false };
    }
  },
};

// Expose globally
window.StockAPI = StockAPI;
