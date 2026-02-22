/* Pokerito SW — offline mínimo (cache core) */
// Etapa 4: cache bump (fecha automática del día al iniciar)
const CACHE_NAME = 'pokerito-v0.1.13-pdf-global-records-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebaseConfig.js',
  './firebaseInit.js',
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
  './assets/cards/soporte.svg',
  './assets/cards/usuarios.svg',
  './assets/hero/juego.svg',
  './assets/hero/configuracion.svg',
  './assets/hero/soporte.svg',
  './assets/hero/usuarios.svg',
  './assets/hero/hero_juego.webp',
  './assets/hero/hero_config.webp',
  './assets/hero/hero_soporte.webp',
  './assets/hero/hero_usuarios.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        // runtime cache for same-origin assets
        const url = new URL(req.url);
        if (url.origin === location.origin && (
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.svg') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.webp') ||
          url.pathname.endsWith('.jpg') ||
          url.pathname.endsWith('.jpeg')
        )) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline fallback: return cached index for navigations
        if (req.mode === 'navigate') return caches.match('./index.html');
        return cached;
      });
    })
  );
});
