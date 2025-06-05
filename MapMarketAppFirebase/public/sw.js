self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('mapmarket-cache-v1').then(cache => cache.addAll([
      '/',
      '/index.html',
      '/styles.css',
      '/style-modern.css',
      '/manifest.json'
    ]))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
