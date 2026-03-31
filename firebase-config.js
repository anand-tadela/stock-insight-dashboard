/**
 * StockInsight Pro — Firebase Configuration
 * ==========================================
 * 1. Go to https://console.firebase.google.com
 * 2. Create or open your project
 * 3. Enable Authentication → Phone (SMS)
 * 4. Enable Firestore Database
 * 5. Go to Project Settings → General → Your apps → Add web app
 * 6. Copy the firebaseConfig object here
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyABVYkeX7eFhJkno0T5GrQJmhTrl9CPhhU",
  authDomain:        "stock-insight-dashboard.firebaseapp.com",
  projectId:         "stock-insight-dashboard",
  storageBucket:     "stock-insight-dashboard.firebasestorage.app",
  messagingSenderId: "363496493288",
  appId:             "1:363496493288:web:33176337631a1d4bef395d",
};

// Initialize Firebase (compat SDK)
firebase.initializeApp(FIREBASE_CONFIG);

window.fbAuth      = firebase.auth();
window.fbDB        = firebase.firestore();
window.fbMessaging = firebase.messaging();

// Enable Firestore offline persistence
window.fbDB.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("[Firestore] Persistence failed: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("[Firestore] Persistence not supported in this browser");
  }
});

console.log("[Firebase] Initialized ✅");
