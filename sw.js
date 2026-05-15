// Service Worker — Hamdi & Yossr 💍
const CACHE_NAME = "hamdi-yossr-v1";
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
