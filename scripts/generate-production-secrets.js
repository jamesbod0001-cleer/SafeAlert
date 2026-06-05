#!/usr/bin/env node
/**
 * Generate strong JWT_SECRET, HASH_SECRET, ENCRYPTION_KEY in .env
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');

const updates = {
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  HASH_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(16).toString('hex'),
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
console.log('[ok] Generated new secrets in .env (JWT_SECRET, HASH_SECRET, ENCRYPTION_KEY)');
console.log('     Redeploy App Runner after changing production secrets.');
