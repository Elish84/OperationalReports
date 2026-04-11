const CACHE_NAME = '8109-v4';
const ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './reports.html',
  './ai.html',
  './assets/style.css',
  './js/firebase-init.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/ui.js',
  './js/form.js',
  './js/dashboard.js',
  './js/reports.js',
  './js/ai-insights.js',
  './js/pwa-manager.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Helper to sanitize redirected responses before caching
async function getSanitizedResponse(response) {
  if (!response.redirected) return response;
  // Re-fetch with redirect: 'follow' (default) but manually handle the body 
  // to avoid opaque redirect issues in some browsers.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching App Shell (v2)');
      // Use individual add for better reliability with redirects
      for (const url of ASSETS) {
        try {
          const response = await fetch(url);
          const sanitized = await getSanitizedResponse(response);
          if (sanitized.ok) {
            await cache.put(url, sanitized);
          }
        } catch (err) {
          console.warn(`[SW] Failed to cache: ${url}`, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (!url.origin.includes(location.origin)) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then(async (networkResponse) => {
        // Don't cache redirects, but return them to the browser
        if (networkResponse.redirected) return networkResponse;

        if (networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          const sanitized = await getSanitizedResponse(networkResponse.clone());
          cache.put(event.request, sanitized);
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
