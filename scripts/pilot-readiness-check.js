#!/usr/bin/env node
/**
 * Pilot + production readiness (Workstreams A & D).
 * Usage: node scripts/pilot-readiness-check.js [baseUrl]
 */
require('dotenv').config();

const BASE = (process.argv[2] || process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`)
  .replace(/\/$/, '');
const API = `${BASE}/v1`;
const PILOT_STATE = process.env.PILOT_STATE || 'Lagos';
const MIN_PILOT_ZONES = parseInt(process.env.PILOT_MIN_ZONES || '50', 10);

const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function warn(name, detail) {
  results.push({ ok: true, warn: true, name, detail });
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`SafeAlert NG — pilot readiness (${PILOT_STATE})\n`);

  if (process.env.DEV_FIXED_OTP) {
    warn('DEV_FIXED_OTP', 'set — unset on production App Runner (deploy script unsets it)');
  } else {
    pass('DEV_FIXED_OTP', 'unset');
  }

  if (process.env.ADMIN_SECRET || process.env.IMPORT_JOB_SECRET) {
    pass('ADMIN_SECRET', 'configured');
  } else {
    fail('ADMIN_SECRET', 'missing — admin UI returns 503');
  }

  const atUser = (process.env.AT_USERNAME || '').trim().toLowerCase();
  if (atUser === 'sandbox') {
    warn('AT_USERNAME', 'sandbox — apply for production + AT_SENDER_ID for real circle SMS');
  } else if (!process.env.AT_SENDER_ID?.trim()) {
    warn('AT_SENDER_ID', 'empty — production SMS may fail');
  } else {
    pass('Africa\'s Talking', `production user=${atUser}`);
  }

  const fcmOk = !!(
    process.env.FIREBASE_WEB_API_KEY &&
    process.env.FIREBASE_WEB_VAPID_KEY &&
    process.env.FIREBASE_PROJECT_ID
  );
  if (fcmOk) pass('FCM web config', 'env keys present');
  else warn('FCM web config', 'incomplete — push may mock');

  try {
    const res = await fetch(`${API}/health`);
    const h = await res.json();
    if (h.database === 'firestore') pass('Health database', 'firestore');
    else warn('Health database', h.database || 'unknown');

    if (h.fcm_admin_configured) pass('FCM admin', 'Firebase messaging initialized');
    else warn('FCM admin', 'not configured — push logs mock');

    if (h.proximity_alerts) pass('Proximity alerts', 'enabled');
  } catch {
    warn('Health endpoint', `no server at ${API}/health — start npm run dev`);
  }

  try {
    const res = await fetch(`${API}/zones?state=${encodeURIComponent(PILOT_STATE)}&limit=500`);
    const data = await res.json();
    const n = data.zones?.length ?? 0;
    if (n >= MIN_PILOT_ZONES) pass(`${PILOT_STATE} zones`, `${n} active (≥${MIN_PILOT_ZONES})`);
    else warn(`${PILOT_STATE} zones`, `${n} active — target ≥${MIN_PILOT_ZONES}; run npm run launch:pipeline`);
  } catch {
    warn(`${PILOT_STATE} zones`, 'could not query API');
  }

  const flutterGs = require('fs').existsSync(
    require('path').join(__dirname, '../flutter_app/android/app/google-services.json')
  );
  if (flutterGs) pass('Flutter google-services.json', 'present');
  else warn('Flutter google-services.json', 'missing — see flutter_app/README.md');

  console.log('');
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`NOT READY — ${failed.length} blocker(s)`);
    process.exit(1);
  }
  console.log('READY for pilot (resolve WARN items before production SMS)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
