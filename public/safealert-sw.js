/* SafeAlert — cache static app shell & vendor; network-first for API */
const CACHE = 'safealert-v2';

const PRECACHE = [
  '/app/vendor/leaflet/leaflet.min.js',
  '/app/vendor/leaflet/leaflet.min.css',
  '/app/vendor/leaflet/marker-icon.png',
  '/app/vendor/leaflet/marker-icon-2x.png',
  '/app/vendor/leaflet/marker-shadow.png',
  '/app/js/data-saver.js',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/v1/')) {
    return;
  }
  if (
    url.pathname.startsWith('/app/vendor/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('/app/js/data-saver.js')
  ) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
    );
  }
});
