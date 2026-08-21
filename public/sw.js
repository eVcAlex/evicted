// Minimal service worker: push notifications only, no offline caching. This
// app is live data, not offline-first, so there's nothing worth caching —
// a full PWA toolkit (next-pwa/serwist) would just add machinery this app
// has no use for.

self.addEventListener('push', (event) => {
  let payload = { title: 'Evicted', body: 'Someone finished bottom this week.' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Malformed payload: fall back to the generic message above rather than
    // showing nothing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
