const CACHE = 'finance-v2';
const PRECACHE = ['/', '/dashboard', '/transactions', '/trips', '/splits'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Handle Web Share Target POST — extract shared text and redirect to /share?text=...
  if (e.request.method === 'POST' && url.pathname === '/share') {
    e.respondWith((async () => {
      const formData = await e.request.formData();
      const text = formData.get('text') || formData.get('title') || '';
      const target = new URL('/share', self.location.origin);
      target.searchParams.set('text', text.toString());
      return Response.redirect(target.toString(), 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  // Only cache same-origin page navigations; skip API routes
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Push notifications
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const { title, body, url } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url ?? '/dashboard' },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/dashboard';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
