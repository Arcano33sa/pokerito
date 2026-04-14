/* Pokerito SW — offline mínimo (cache core) — v0.1.48 pwa-manual-update-stage2 */
const CACHE_NAME = 'pokerito-v0.1.48-pwa-manual-update-stage2';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-128.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-152.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-512.png',
  './assets/cards/juego.svg',
  './assets/cards/configuracion.svg',
  './assets/cards/admin.svg',
  './assets/cards/soporte.svg',
  './assets/cards/archivo.svg',
  './assets/hero/juego.svg',
  './assets/hero/configuracion.svg',
  './assets/hero/admin.svg',
  './assets/hero/soporte.svg',
  './assets/hero/archivo.svg',
  './assets/hero/hero_juego.webp',
  './assets/hero/hero_config.webp',
  './assets/hero/hero_soporte.webp',
  './assets/hero/hero_admin.png',
  './assets/hero/hero_archivo.png'
];
const RUNTIME_ASSET_RE = /\.(?:js|css|svg|png|webp|jpg|jpeg)$/i;

async function notifyClients(payload){
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => {
    try{ client.postMessage(payload); }catch(e){}
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return Promise.resolve();
    }));

    await self.clients.claim();
    await notifyClients({
      type: 'POKERITO_SW_ACTIVATED',
      cacheName: CACHE_NAME,
      scriptURL: self.location.href,
    });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        const url = new URL(req.url);
        if (url.origin === location.origin && RUNTIME_ASSET_RE.test(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});


self.addEventListener('message', (event) => {
  const data = event && event.data ? event.data : {};
  if (data.type === 'POKERITO_SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});
