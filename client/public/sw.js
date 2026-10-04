// Frontier Alpha service worker. Keep /sw.js stable so installed clients upgrade.
const STATIC_CACHE = 'frontier-static-v2';
const DYNAMIC_CACHE = 'frontier-dynamic-v2';
const API_CACHE = 'frontier-api-v1';
// Only obsolete response caches are disposable. Pending portfolio actions are not.
const OBSOLETE_CACHES = ['frontier-static-v1', 'frontier-dynamic-v1'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch('/index.html', { cache: 'reload' });
      if (isHtml(response)) await saveResponse(STATIC_CACHE, '/index.html', response);
    } catch { /* An offline install may still replace a poisoned old worker. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all(OBSOLETE_CACHES.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE, true));
  }
});

function isHtml(response) {
  return response && response.ok && response.headers.get('content-type')?.includes('text/html');
}

function isValidAsset(request, response) {
  if (!response || !response.ok) return false;
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const pathname = new URL(request.url).pathname;
  if (/\.m?js$/i.test(pathname)) return /^(application|text)\/(javascript|x-javascript|ecmascript)$/.test(type);
  if (/\.css$/i.test(pathname)) return type === 'text/css';
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(pathname)) return type.startsWith('image/');
  return type.startsWith('font/') || /^(application\/(font|x-font)[-a-z0-9]*|application\/(octet-stream|vnd.ms-fontobject))$/.test(type);
}

async function saveResponse(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch { /* Storage restrictions must not prevent a successful network load. */ }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (isValidAsset(request, cached)) return cached;
  if (cached) await cache.delete(request);

  try {
    let response = await fetch(request);
    // A missing deployment chunk can receive the SPA HTML fallback with 200.
    // Retry past the browser HTTP cache, and never store or execute that HTML.
    if (!isValidAsset(request, response)) response = await fetch(request, { cache: 'reload' });
    if (!isValidAsset(request, response)) return new Response('Asset unavailable', { status: 502, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    await saveResponse(STATIC_CACHE, request, response);
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, navigation = false) {
  try {
    const response = await fetch(request);
    if (response.ok && (!navigation || isHtml(response))) await saveResponse(cacheName, request, response);
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached && (!navigation || isHtml(cached))) return cached;
    if (navigation) {
      const shell = await (await caches.open(STATIC_CACHE)).match('/index.html');
      if (isHtml(shell)) return shell;
    }
    return new Response('Offline', { status: 503 });
  }
}

function isStaticAsset(pathname) {
  return /\.(m?js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot)$/i.test(pathname);
}

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = { title: 'Frontier Alpha', body: 'You have a new notification' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'frontier-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }

        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-portfolio') {
    event.waitUntil(syncPortfolio());
  }
});

async function syncPortfolio() {
  // Sync any pending portfolio changes when back online
  const cache = await caches.open('frontier-pending-actions');
  const requests = await cache.keys();

  for (const request of requests) {
    try {
      const response = await fetch(request.clone());
      if (response.ok) {
        await cache.delete(request);
      }
    } catch (error) {
      console.log('[SW] Sync failed for:', request.url);
    }
  }
}

console.log('[SW] Service worker loaded');
