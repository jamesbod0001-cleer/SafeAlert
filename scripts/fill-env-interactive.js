#!/usr/bin/env node
/**
 * Interactive .env filler for Firebase + Africa's Talking.
 * Run: node scripts/fill-env-interactive.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.join(__dirname, '../.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function setEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

async function main() {
  console.log('\n=== SafeAlert — fill missing .env credentials ===\n');
  console.log('Press Enter to skip a field. Guide: docs/CREDENTIALS_SETUP.md\n');

  let env = fs.readFileSync(envPath, 'utf8');

  const saPath = await ask(
    'Path to Firebase serviceAccountKey.json (e.g. credentials/serviceAccountKey.json): '
  );
  if (saPath.trim()) {
    const abs = path.resolve(saPath.trim());
    if (!fs.existsSync(abs)) {
      console.error('File not found:', abs);
      process.exit(1);
    }
    const sa = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const pk = (sa.private_key || '').replace(/\n/g, '\\n');
    env = setEnvLine(env, 'FIREBASE_PROJECT_ID', sa.project_id);
    env = setEnvLine(env, 'FIREBASE_CLIENT_EMAIL', sa.client_email);
    env = setEnvLine(env, 'FIREBASE_PRIVATE_KEY', `"${pk}"`);
    env = setEnvLine(env, 'USE_MEMORY_DB', 'false');
    console.log('  ✓ Firebase Admin from', path.basename(abs));
  } else {
    const pid = await ask('FIREBASE_PROJECT_ID (manual): ');
    const email = await ask('FIREBASE_CLIENT_EMAIL (manual): ');
    if (pid.trim() && email.trim()) {
      env = setEnvLine(env, 'FIREBASE_PROJECT_ID', pid.trim());
      env = setEnvLine(env, 'FIREBASE_CLIENT_EMAIL', email.trim());
      const pkPath = await ask('Path to .pem/private key file (or Enter to paste in .env yourself): ');
      if (pkPath.trim() && fs.existsSync(path.resolve(pkPath.trim()))) {
        const pk = fs.readFileSync(path.resolve(pkPath.trim()), 'utf8').replace(/\n/g, '\\n');
        env = setEnvLine(env, 'FIREBASE_PRIVATE_KEY', `"${pk}"`);
        env = setEnvLine(env, 'USE_MEMORY_DB', 'false');
      }
    }
  }

  const webPath = await ask(
    '\nPath to firebase-web-config.json (e.g. credentials/firebase-web-config.json): '
  );
  if (webPath.trim()) {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(webPath.trim()), 'utf8'));
    if (cfg.apiKey) env = setEnvLine(env, 'FIREBASE_WEB_API_KEY', cfg.apiKey);
    if (cfg.authDomain) env = setEnvLine(env, 'FIREBASE_WEB_AUTH_DOMAIN', cfg.authDomain);
    if (cfg.messagingSenderId) env = setEnvLine(env, 'FIREBASE_WEB_MESSAGING_SENDER_ID', cfg.messagingSenderId);
    if (cfg.appId) env = setEnvLine(env, 'FIREBASE_WEB_APP_ID', cfg.appId);
    const vapid = cfg.vapidKey || cfg.vapid_key;
    if (vapid) env = setEnvLine(env, 'FIREBASE_WEB_VAPID_KEY', vapid);
    console.log('  ✓ Firebase Web config');
  } else {
    const apiKey = await ask('FIREBASE_WEB_API_KEY (manual): ');
    if (apiKey.trim()) {
      env = setEnvLine(env, 'FIREBASE_WEB_API_KEY', apiKey.trim());
      env = setEnvLine(
        env,
        'FIREBASE_WEB_AUTH_DOMAIN',
        (await ask('FIREBASE_WEB_AUTH_DOMAIN: ')).trim()
      );
      env = setEnvLine(
        env,
        'FIREBASE_WEB_MESSAGING_SENDER_ID',
        (await ask('FIREBASE_WEB_MESSAGING_SENDER_ID: ')).trim()
      );
      env = setEnvLine(env, 'FIREBASE_WEB_APP_ID', (await ask('FIREBASE_WEB_APP_ID: ')).trim());
      env = setEnvLine(env, 'FIREBASE_WEB_VAPID_KEY', (await ask('FIREBASE_WEB_VAPID_KEY: ')).trim());
    }
  }

  console.log('\n--- Africa\'s Talking (sandbox username is often "sandbox") ---');
  const atUser = await ask('AT_USERNAME: ');
  const atKey = await ask('AT_API_KEY: ');
  if (atUser.trim() && atKey.trim()) {
    env = setEnvLine(env, 'AT_USERNAME', atUser.trim());
    env = setEnvLine(env, 'AT_API_KEY', atKey.trim());
    const sc = await ask('AT_SHORTCODE (optional): ');
    if (sc.trim()) env = setEnvLine(env, 'AT_SHORTCODE', sc.trim());
    console.log('  ✓ Africa\'s Talking');
  }

  fs.writeFileSync(envPath, env);
  console.log('\n✅ Updated', envPath);
  console.log('Next: NODE_ENV=production npm run validate-env');
  console.log('      ./scripts/aws/deploy-apprunner.sh\n');
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
