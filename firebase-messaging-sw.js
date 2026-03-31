// Firebase Messaging Service Worker
// Handles background push notifications when the app tab is not focused
// Place this file at the root of your site so Firebase can find it

importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyABVYkeX7eFhJkno0T5GrQJmhTrl9CPhhU",
  authDomain:        "stock-insight-dashboard.firebaseapp.com",
  projectId:         "stock-insight-dashboard",
  storageBucket:     "stock-insight-dashboard.firebasestorage.app",
  messagingSenderId: "363496493288",
  appId:             "1:363496493288:web:33176337631a1d4bef395d",
});

const messaging = firebase.messaging();

// Handle background messages (app is in background or closed)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "StockInsight Pro", {
    body:             body || "Price alert triggered",
    icon:             icon || "/assets/favicon.svg",
    badge:            "/assets/favicon.svg",
    requireInteraction: true,
    tag:              "stockinsight-alert",
  });
});
