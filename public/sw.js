const CACHE_NAME = 'swordsman-v5-play-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './mobile.html',
  './styles.css',
  './mobile.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './dist/main.js',
  './dist/audio/adlibSynth.js',
  './dist/content/gameData.js',
  './dist/engine/cutscenePlayer.js',
  './dist/engine/isoMath.js',
  './dist/engine/pixelSprites.js',
  './dist/engine/sceneRenderer.js',
  './dist/engine/tileAtlas.js',
  './dist/systems/combatMath.js',
  './dist/systems/gameWorld.js',
  './dist/systems/saveManager.js',
  './dist/systems/types.js',
  './dist/ui/hudController.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((res) => {
            if (res.ok) return cache.put(url, res);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
