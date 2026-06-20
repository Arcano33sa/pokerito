/* Pokerito SW — offline mínimo (cache core) — v0.1.42 mesa-compacta-desplegable-v1 */
const CACHE_NAME = 'pokerito-v0.1.42-mesa-compacta-desplegable-v1';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return Promise.resolve();
    }));

    await self.clients.claim();
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
