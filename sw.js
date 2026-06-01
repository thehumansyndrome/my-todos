// sw.js — Quiz Certif Service Worker
// Bump CACHE_VERSION to force refresh after updates
const CACHE_VERSION = 'quiz001-v1';

// All assets to pre-cache on install
const PRECACHE = [
  './quiz001.html',
  'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

// Domains we cache but don't pre-fetch (fonts, CDN files fetched on first use)
const CACHE_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
];

// Domains we NEVER cache (Drive API, GIS auth — always need network)
const NEVER_CACHE = [
  'accounts.google.com',
  'googleapis.com',
];

// ── Install: pre-cache core assets ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Cache each asset individually so one failure doesn't block all
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] Pre-cache failed for:', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache Drive API or auth requests — always go to network
  if (NEVER_CACHE.some(d => url.hostname.includes(d))) {
    return; // let browser handle normally
  }

  // Cache-first for CDN assets (xlsx, fonts) — these never change
  if (CACHE_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Network-first for the app HTML itself (get updates when online)
  if (url.pathname.endsWith('quiz001.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default: cache-first for everything else (same origin)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not in cache — return empty 503
    return new Response('Ressource non disponible hors-ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve from cache
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('App non disponible — vérifiez votre connexion', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
