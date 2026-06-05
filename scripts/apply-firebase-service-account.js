#!/usr/bin/env node
/**
 * Merge Firebase Admin service account JSON into .env
 * Usage: node scripts/apply-firebase-service-account.js path/to/serviceAccountKey.json
 */
const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/apply-firebase-service-account.js <serviceAccountKey.json>');
  process.exit(1);
}

const abs = path.resolve(jsonPath);
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs);
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(abs, 'utf8'));
const envPath = path.join(__dirname, '../.env');
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const privateKey = (sa.private_key || '').replace(/\n/g, '\\n');
const updates = {
  FIREBASE_PROJECT_ID: sa.project_id,
  FIREBASE_CLIENT_EMAIL: sa.client_email,
  FIREBASE_PRIVATE_KEY: `"${privateKey}"`,
  USE_MEMORY_DB: 'false',
};

function setEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

for (const [key, value] of Object.entries(updates)) {
  env = setEnvLine(env, key, value);
}

fs.writeFileSync(envPath, env);
console.log('[ok] Updated .env with Firebase Admin credentials from', path.basename(abs));
console.log('     FIREBASE_PROJECT_ID=', sa.project_id);
console.log('Next: add FIREBASE_WEB_* from Firebase Console → Project settings → Your apps (Web)');
