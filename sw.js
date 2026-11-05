const CACHE = "my-cake-manager-v2";
const APP_BASE = new URL("./", self.registration.scope);
const APP_FILES = [
  new URL("./", APP_BASE).href,
  new URL("index.html", APP_BASE).href,
  new URL("styles.css", APP_BASE).href,
  new URL("manifest.webmanifest", APP_BASE).href
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("my-cake-manager-") && key !== CACHE)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
