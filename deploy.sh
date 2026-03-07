#!/usr/bin/env bash
# ============================================================
#  StockInsight Pro — Firebase Hosting Deploy Script
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   StockInsight Pro — Firebase Deploy            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. Check Firebase CLI
if ! command -v firebase &>/dev/null; then
  echo "📦  Installing Firebase CLI..."
  npm install -g firebase-tools
fi

# 2. Login check
echo "🔐  Checking Firebase login..."
firebase login --reauth 2>/dev/null || firebase login

# 3. If no project is configured, run init
if grep -q "YOUR_FIREBASE_PROJECT_ID" .firebaserc 2>/dev/null; then
  echo ""
  echo "⚙️   No project configured. Running Firebase init..."
  echo "    → Select 'Hosting: Configure files for Firebase Hosting'"
  echo "    → Use an EXISTING project (or create one at console.firebase.google.com)"
  echo "    → Public directory: . (just press Enter — already set in firebase.json)"
  echo "    → Single-page app: NO"
  echo "    → Don't overwrite existing index.html"
  echo ""
  firebase init hosting
fi

# 4. Deploy
echo ""
echo "🚀  Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo ""
echo "✅  Deploy complete!"
echo "    Your app is live at: https://$(firebase use 2>/dev/null | tail -1).web.app"
