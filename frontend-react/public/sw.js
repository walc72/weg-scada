// Service worker mínimo: shell offline + assets cache-first. Datos en vivo
// (/api, /mqtt) SIEMPRE van a la red (no se cachean).
const CACHE = 'mb-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/agriplus.png', '/ico.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // otros orígenes: red directa
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/mqtt')) return; // tiempo real
  if (req.mode === 'navigate') {                                    // navegación: red, fallback shell
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // assets (js/css/img): cache-first con revalidación en segundo plano
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
