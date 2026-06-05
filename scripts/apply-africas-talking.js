#!/usr/bin/env node
/**
 * Set Africa's Talking credentials in .env
 * Usage:
 *   AT_USERNAME=xxx AT_API_KEY=yyy node scripts/apply-africas-talking.js
 * Or pass as args: node scripts/apply-africas-talking.js <username> <apiKey>
 */
const fs = require('fs');
const path = require('path');

const username = process.argv[2] || process.env.AT_USERNAME;
const apiKey = process.argv[3] || process.env.AT_API_KEY;
const isSandbox = (username || '').trim().toLowerCase() === 'sandbox';
const senderId = isSandbox ? '' : (process.env.AT_SENDER_ID || '').trim();
const shortcode = process.env.AT_SHORTCODE || '';

if (!username || !apiKey) {
  console.error('Provide AT_USERNAME and AT_API_KEY (env or CLI args).');
  process.exit(1);
}

const envPath = path.join(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');

function setEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

env = setEnvLine(env, 'AT_USERNAME', username);
env = setEnvLine(env, 'AT_API_KEY', apiKey);
env = setEnvLine(env, 'AT_SENDER_ID', senderId);
if (shortcode) env = setEnvLine(env, 'AT_SHORTCODE', shortcode);
env = setEnvLine(env, 'PANIC_SMS_ENABLED', 'true');
env = setEnvLine(env, 'PUSH_NOTIFICATIONS_ENABLED', 'true');

fs.writeFileSync(envPath, env);
console.log('[ok] Africa\'s Talking credentials saved to .env');
if (isSandbox) {
  console.log('[sandbox] AT_SENDER_ID cleared. Whitelist test phones: AT dashboard → Sandbox → Phone numbers');
} else if (!senderId) {
  console.log('[production] Request Sender ID in dashboard → Product Request before OTP will work.');
}
