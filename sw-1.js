// Scoreboard PWA — Service Worker
// Cache version: bump this string to force cache refresh on deploy
const CACHE_NAME = 'scoreboard-v1';

// Files to pre-cache (app shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  // External CDN resources
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local files strictly; CDN files best-effort
      const localFiles = PRECACHE_URLS.filter(u => !u.startsWith('http'));
      const cdnFiles   = PRECACHE_URLS.filter(u => u.startsWith('http'));

      return cache.addAll(localFiles).then(() =>
        Promise.allSettled(cdnFiles.map(url =>
          fetch(url, { mode: 'cors' })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null)
        ))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first for app shell, Network-first for everything else ───────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  // Cache-first strategy for same-origin and CDN assets
  const isCDN = url.hostname.includes('googleapis.com') ||
                url.hostname.includes('jsdelivr.net') ||
                url.hostname.includes('gstatic.com');
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin || isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;

          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => {
          // Offline fallback — return index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
  // All other requests: network only (don't interfere)
});
