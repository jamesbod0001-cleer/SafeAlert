#!/usr/bin/env node
/**
 * Merge Firebase web app config (from Firebase Console) into .env
 * Usage: node scripts/apply-firebase-web-config.js path/to/firebase-web-config.json
 *
 * JSON shape (from Firebase Console):
 * {
 *   "apiKey": "...",
 *   "authDomain": "...",
 *   "projectId": "...",
 *   "storageBucket": "...",
 *   "messagingSenderId": "...",
 *   "appId": "...",
 *   "vapidKey": "..."   // optional, from Cloud Messaging → Web Push certificates
 * }
 */
const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/apply-firebase-web-config.js <firebase-web-config.json>');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
const envPath = path.join(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');

const map = {
  FIREBASE_WEB_API_KEY: cfg.apiKey,
  FIREBASE_WEB_AUTH_DOMAIN:
    cfg.authDomain || (cfg.projectId ? `${cfg.projectId}.firebaseapp.com` : ''),
  FIREBASE_WEB_MESSAGING_SENDER_ID: cfg.messagingSenderId,
  FIREBASE_WEB_APP_ID: cfg.appId,
  FIREBASE_WEB_VAPID_KEY: cfg.vapidKey || cfg.vapid_key || '',
};

function setEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

for (const [key, value] of Object.entries(map)) {
  if (value) env = setEnvLine(env, key, value);
}

fs.writeFileSync(envPath, env);
console.log('[ok] FIREBASE_WEB_* updated in .env');
