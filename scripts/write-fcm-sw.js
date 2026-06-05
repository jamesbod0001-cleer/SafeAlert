#!/usr/bin/env node
/**
 * Writes public/firebase-messaging-sw.js from .env Firebase web config.
 * Run: node scripts/write-fcm-sw.js
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const cfg = {
  apiKey: process.env.FIREBASE_WEB_API_KEY || '',
  authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_WEB_APP_ID || '',
};

const out = path.join(__dirname, '../public/firebase-messaging-sw.js');
const body = `/* Auto-generated — run: node scripts/write-fcm-sw.js */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(cfg)});

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
`;

fs.writeFileSync(out, body);
console.log('[write-fcm-sw] Wrote', out);
