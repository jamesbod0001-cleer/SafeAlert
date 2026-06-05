/* Auto-generated — run: node scripts/write-fcm-sw.js */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({"apiKey":"AIzaSyCHnQOuvZmuaBezAf4cKxTsKUdk1ytFpCE","authDomain":"safealert-ng-3abbb.firebaseapp.com","projectId":"safealert-ng-3abbb","messagingSenderId":"554251714305","appId":"1:554251714305:web:64f7f0c1c46c8d7436e500"});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || 'SafeAlert NG';
  const body = payload.notification?.body || 'New safety alert';
  const tag = data.short_id || data.panic_id || data.type || 'safealert';
  const isUrgent =
    data.type === 'NEARBY_PANIC' ||
    data.type === 'CIRCLE_PANIC' ||
    data.type === 'PANIC_RESPONDER' ||
    data.type === 'CRITICAL_ZONE';
  self.registration.showNotification(title, {
    body,
    icon: '/app/icons/icon-192.webp',
    badge: '/app/icons/icon-192.webp',
    tag: String(tag).slice(0, 32),
    requireInteraction: isUrgent,
    data,
  });
});
