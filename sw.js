// Service Worker — Hamdi & Yossr 💍

// ===== FCM Push (notif w l app msakra) =====
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDT2Qb4FAQzM0jwompq7FZQCLFUM4VMaYs",
  authDomain: "hamdi-yossr.firebaseapp.com",
  projectId: "hamdi-yossr",
  storageBucket: "hamdi-yossr.firebasestorage.app",
  messagingSenderId: "850872869440",
  appId: "1:850872869440:web:5aedd5c8b1dc7e9d4f35a5"
});

firebase.messaging().onBackgroundMessage(payload => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || "Hamdi & Yossr 💍", {
    body: n.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png"
  });
});

// Ki to89oz 3al notif → te7el l app
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./index.html"));
});

const CACHE_NAME = "hamdi-yossr-v3";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Install: cache les fichiers essentiels
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn("Cache install partial:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: nettoie les anciens caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stratégie "network-first" pour HTML, "cache-first" pour le reste
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Ne JAMAIS intercepter les requêtes Firebase / Firestore / APIs externes
  const url = new URL(req.url);
  if (
    url.hostname.includes("firestore") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("firebaseio") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("nominatim") ||
    url.hostname.includes("tile.openstreetmap")
  ) {
    return; // laisse passer normalement
  }

  // HTML → network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Autres ressources → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
