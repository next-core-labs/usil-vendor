/*
 * Draws this console's push notifications. The backend sends web tokens
 * data-only messages (usil-backend/server/push/fcm.ts), so this worker is the
 * one place they become visible — the same whether or not a tab is open.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* not JSON: show the fallback title */
  }
  const data = payload.data || {};
  const shown = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(data.title || shown.title || 'يوصل', {
      body: data.body || shown.body || '',
      icon: '/favicon.png',
      badge: '/favicon.png',
      dir: 'rtl',
      lang: 'ar',
      data: { link: data.link || '/' },
    }),
  );
});

// Reuse an open console tab when there is one, else open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const tab = tabs.find((client) => new URL(client.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        tab.postMessage({ type: 'usil-push-open', link: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
