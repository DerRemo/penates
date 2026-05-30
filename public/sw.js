// Service Worker für Claude Code Hub — Web Push
//
// Zeigt native Push-Notifications, auch wenn der Browser-Tab geschlossen ist.
// Registriert vom Frontend beim App-Start; Scope ist '/' (ganzer Hub).

const APP_NAME = 'Claude Code Hub';

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  if (data.type === 'approval') {
    event.waitUntil(self.registration.showNotification(data.title ?? APP_NAME, {
      body: data.body ?? 'Claude braucht eine Freigabe.',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: 'approval-' + (data.approvalId || ''),
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'allow', title: 'Zulassen' },
        { action: 'deny', title: 'Ablehnen' },
      ],
      data: { type: 'approval', approvalId: data.approvalId, otp: data.otp, name: data.name },
    }));
    return;
  }

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
  const d = event.notification.data || {};

  if (d.type === 'approval' && (event.action === 'allow' || event.action === 'deny')) {
    event.waitUntil(fetch('/api/approvals/' + encodeURIComponent(d.approvalId) + '?token=' + encodeURIComponent(d.otp || ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: event.action }),
    }).catch(() => {}));
    return;
  }

  const name = d.name ?? '';
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
