/* Service worker de Firebase Cloud Messaging (opcional). */
importScripts('/firebase-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const cfg = self.QUILLABUS_FIREBASE || {};
if (cfg.config && cfg.config.apiKey) {
  firebase.initializeApp(cfg.config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const n = payload.notification || {};
    self.registration.showNotification(n.title || 'QuillaBus', {
      body: n.body || 'Tu bus está por llegar.',
      tag: 'quillabus-llegada',
      data: payload.data || {}
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus();
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
