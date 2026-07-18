// NJP Songs — Service Worker (offline support)
// Bump CACHE_VERSION whenever app files change to force an update.
const CACHE_VERSION = 'njp-v29';
const SHELL = [
  './index.html',
  './manifest.json',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './fonts/notosanstamil-tamil.woff2',
  './fonts/notosanstamil-latin.woff2',
  './songs-index.json',
  './js/app.js',
  './js/storage.js',
  './js/navigation.js',
  './js/ui.js',
  './js/songs.js',
  './js/bible.js',
  './js/tracker.js',
  './js/piano.js',
];
const DATA = './songs.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll([...SHELL, DATA])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // songs.json → stale-while-revalidate: serve cached copy instantly,
  // refresh in background when online (so new chords arrive automatically).
  if (url.pathname.endsWith('songs.json')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) cache.put(event.request, resp.clone());
          return resp;
        }).catch(() => null);
        return cached || network;
      })
    );
    return;
  }

  // Everything else → cache-first (app shell), fall back to network.
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request)
    )
  );
});
