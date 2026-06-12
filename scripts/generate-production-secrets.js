#!/usr/bin/env node
/**
 * Generate strong secrets in .env (or create from .env.example if missing).
 * Usage: npm run setup:secrets
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const examplePath = path.join(__dirname, '../.env.example');

let env = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8')
  : fs.readFileSync(examplePath, 'utf8');

const updates = {
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  HASH_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(16).toString('hex'),
  ADMIN_SECRET: crypto.randomBytes(32).toString('hex'),
  IMPORT_JOB_SECRET: crypto.randomBytes(32).toString('hex'),
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
console.log('[ok] Generated secrets in .env:');
console.log('     JWT_SECRET, HASH_SECRET, ENCRYPTION_KEY, ADMIN_SECRET, IMPORT_JOB_SECRET');
console.log('     Redeploy App Runner after changing production secrets.');
