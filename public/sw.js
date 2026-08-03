/* Daily Impact Devotional — Service Worker
 *
 * Strategy:
 *  - PRECACHE the app shell (root + manifest + icons) at install time so the
 *    installed app boots instantly, even offline.
 *  - Static same-origin assets (JS/CSS/images): cache-first, background refresh
 *    (stale-while-revalidate) so the app stays fast and updates in place.
 *  - Navigation requests: network-first with the cached shell as offline
 *    fallback — the installed app keeps working with no connection.
 *  - /backend/* API and /uploads/* : NEVER cached (fresh data always).
 *
 * Bump CACHE_VERSION whenever the bundle changes so old caches are purged.
 */
const CACHE_VERSION = 'v5';
const CACHE_NAME = `dailyimpact-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/logo-white.png',
  '/assets/images/dailyimpact.png',
];

/* ── Install: precache the app shell ─────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

/* ── Activate: drop old cache versions, take control immediately ─────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch ───────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or uploaded-media traffic — always hit the network.
  if (url.pathname.startsWith('/backend/') || url.pathname.startsWith('/uploads/')) return;

  // Navigations (page loads): network-first, cached shell fallback offline.
  // The response is stored under '/' itself so the precached shell and the
  // runtime write collide harmlessly — one key, no indirection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});
