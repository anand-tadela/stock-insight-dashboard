#!/usr/bin/env bash
# ============================================================
#  StockInsight Pro — One-click startup script
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   StockInsight Pro — Starting up...             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 is required but not found. Install from https://www.python.org"
  exit 1
fi

# 2. Ensure uv is available (install if missing)
if ! command -v uv &>/dev/null; then
  # Try sourcing uv env first (already installed but not on PATH)
  [ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env"
fi
if ! command -v uv &>/dev/null; then
  echo "⬇️   Installing uv package manager..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  source "$HOME/.local/bin/env"
fi

# 3. Install/upgrade dependencies via uv (much faster than pip)
echo "📦  Installing Python dependencies with uv..."
uv pip install -r requirements.txt --system -q
echo "✅  Dependencies ready."
echo ""

# 3. Start the MCP Agent server (Flask) in background on port 5050
echo "🚀  Starting AI Agent MCP Server on http://localhost:5050 ..."
python3 stock_agent_server.py &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"
echo ""

# 4. Start static frontend server on port 8000
echo "🛰  Starting static frontend on http://localhost:8000 ..."
python3 -m http.server 8000 &
FRONT_PID=$!
echo "   Frontend PID: $FRONT_PID"
echo ""

# 5. Wait briefly so servers can start
sleep 2

# 6. Open the dashboard in the default browser
echo "🌐  Opening dashboard in your browser..."
if command -v open &>/dev/null; then          # macOS
  open "http://localhost:8000"
elif command -v xdg-open &>/dev/null; then    # Linux
  xdg-open "http://localhost:8000"
elif command -v start &>/dev/null; then       # Windows (Git Bash)
  start "http://localhost:8000"
else
  echo "   Open http://localhost:8000 manually in your browser."
fi

echo ""
echo "📊  Dashboard is running!"
echo "   API Server: http://localhost:5050/api/health"
echo "   Frontend : http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Keep script alive so Ctrl+C kills both servers
trap "echo ''; echo '🛑  Shutting down servers...'; kill $SERVER_PID $FRONT_PID 2>/dev/null; echo 'Goodbye!'" EXIT INT TERM
wait $SERVER_PID $FRONT_PID
