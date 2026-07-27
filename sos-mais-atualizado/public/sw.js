// Service Worker for local and custom background notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Alerta de Emergência SOS Mais',
      icon: '/logo192.png',
      badge: '/logo192.png',
      vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40],
      tag: 'emergency-alert',
      requireInteraction: true,
      data: { url: '/' }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'ALERTA SOS', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
