// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// In testing/development, this might not work without real config
// but the skeleton is here to handle background payloads
firebase.initializeApp({
  apiKey: "PLACEHOLDER",
  authDomain: "PLACEHOLDER",
  projectId: "PLACEHOLDER",
  storageBucket: "PLACEHOLDER",
  messagingSenderId: "PLACEHOLDER",
  appId: "PLACEHOLDER"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Background Message:', payload);
  const notificationTitle = payload.notification.title || 'SOS ALERTA';
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40],
    tag: 'emergency-alert',
    data: { url: '/' }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
