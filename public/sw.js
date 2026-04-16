// Service Worker für Claude Code Hub — Web Push
//
// Zeigt native Push-Notifications, auch wenn der Browser-Tab geschlossen ist.
// Registriert vom Frontend beim App-Start; Scope ist '/' (ganzer Hub).

const APP_NAME = 'Claude Code Hub';

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  const title   = data.title  ?? APP_NAME;
  const body    = data.body   ?? 'Eine Session braucht deine Aufmerksamkeit.';
  const name    = data.name   ?? '';
  const activity = data.activity ?? '';

  // Tag = Session-Name: Browser dedupliziert Notifications pro Tag.
  // renotify: true = auch bei Duplicate-Tag spielt der Browser den Sound.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: name || 'cchub',
      renotify: true,
      data: { name, activity },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const name = event.notification.data?.name ?? '';
  // Hub öffnen und — falls Session-Name bekannt — direkt in die Terminal-View navigieren.
  const url = name ? `/?session=${encodeURIComponent(name)}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
