#!/usr/bin/env node
require('dotenv').config();

const required = [
  ['FIREBASE_PROJECT_ID', 'Firebase Admin'],
  ['FIREBASE_CLIENT_EMAIL', 'Firebase Admin'],
  ['FIREBASE_PRIVATE_KEY', 'Firebase Admin'],
  ['FIREBASE_WEB_API_KEY', 'FCM web'],
  ['FIREBASE_WEB_AUTH_DOMAIN', 'FCM web'],
  ['FIREBASE_WEB_MESSAGING_SENDER_ID', 'FCM web'],
  ['FIREBASE_WEB_APP_ID', 'FCM web'],
  ['FIREBASE_WEB_VAPID_KEY', 'FCM web (optional but recommended)'],
  ['AT_USERNAME', "Africa's Talking"],
  ['AT_API_KEY', "Africa's Talking"],
];

let missing = 0;
console.log('\n.env credential check:\n');
for (const [key, label] of required) {
  const ok = !!process.env[key] && process.env[key].length > 0;
  if (!ok) missing++;
  console.log(ok ? '✅' : '❌', key, `(${label})`);
}
const atUser = (process.env.AT_USERNAME || '').trim();
const atSender = (process.env.AT_SENDER_ID || '').trim();
if (atUser && atUser.toLowerCase() !== 'sandbox' && !atSender) {
  console.log('⚠️  AT_SENDER_ID — required for production OTP (request in AT → Product Request → Sender ID)');
}

console.log(missing ? `\n${missing} missing — see docs/SETUP_CREDENTIALS_NOW.md\n` : '\nAll set.\n');
process.exit(missing ? 1 : 0);
