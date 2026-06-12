#!/usr/bin/env node
/**
 * Live investor demo — API walkthrough matching docs/fundraise/demo-script.md
 * Usage: node scripts/run-investor-demo.js [baseUrl]
 * Requires: server running (npm run dev)
 */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/v1`;
const APP = `${BASE}/app/`;

const TEST_PHONE = '08012345678';
const DEV_OTP = process.env.DEV_FIXED_OTP || '123456';
const DEVICE_ID = 'investor-demo-device-01';
const LAGOS = { lat: 6.5244, lng: 3.3792 };

function say(text) {
  console.log(`\n▶ ${text}`);
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function step(label, r, expect = (s) => s >= 200 && s < 300) {
  const pass = expect(r.status);
  console.log(`  ${pass ? '✓' : '✗'} ${label} → HTTP ${r.status}`);
  if (!pass) console.log('    ', JSON.stringify(r.data).slice(0, 300));
  return pass;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SafeAlert NG — Investor Demo (automated walkthrough)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  App UI:  ${APP}`);
  console.log(`  API:     ${API}`);
  console.log('═══════════════════════════════════════════════════\n');

  say('0:00 — Hook: citizen-first safety for 220M Nigerians');
  await pause(400);

  say('0:30 — Safety map: load zones near Lagos');
  const zones = await req('GET', `/zones?lat=${LAGOS.lat}&lng=${LAGOS.lng}&radius=50`);
  step('GET /zones (Lagos radius)', zones);
  const existing = zones.data?.zones?.[0];
  if (existing) {
    console.log(`    Sample zone: ${existing.type} · ${existing.severity} · ${existing.state || 'Nigeria'}`);
  }
  await pause(500);

  say('1:00 — Sign in (sandbox OTP for demo)');
  await req('POST', '/auth/request-otp', { phone: TEST_PHONE });
  const auth = await req('POST', '/auth/verify-otp', { phone: TEST_PHONE, otp: DEV_OTP });
  step('POST /auth/verify-otp', auth);
  const token = auth.data?.token;
  if (!token) {
    console.error('\n✗ Demo stopped — no token. Set DEV_FIXED_OTP=123456 in .env and restart server.\n');
    process.exit(1);
  }
  console.log(`    OTP used: ${DEV_OTP} | Phone: ${TEST_PHONE}`);

  await req(
    'PUT',
    '/user/circle',
    { circle: [{ name: 'Demo Contact', phone: '+2348098765432', relation: 'friend' }] },
    token
  );
  step('PUT /user/circle (1 contact for panic SMS)', { status: 200, data: {} });
  await pause(400);

  say('1:15 — Report a zone in Lagos (community alert)');
  const report = await req('POST', '/zones', {
    lat: LAGOS.lat,
    lng: LAGOS.lng,
    type: 'armed_robbery',
    description: 'Demo report for investor walkthrough — safe to ignore.',
    device_id: DEVICE_ID,
  }, token);
  step('POST /zones', report, (s) => s === 201);
  const newZoneId = report.data?.zone?.id;
  if (report.data?.first_in_state) {
    console.log('    🏅 First reporter in state badge awarded');
  }
  console.log(`    State: ${report.data?.zone?.state || 'Lagos'} · severity: ${report.data?.zone?.severity}`);
  await pause(500);

  say('2:15 — Community confirm (Still dangerous)');
  if (newZoneId) {
    const confirm = await req('PATCH', `/zones/${newZoneId}/confirm`, { device_id: 'demo-confirmer-02' });
    step(`PATCH /zones/${newZoneId.slice(0, 8)}…/confirm`, confirm);
    console.log(`    votes_danger: ${confirm.data?.zone?.votes_danger} · verified: ${confirm.data?.zone?.verified}`);
  }
  await pause(500);

  say('2:45 — Panic SOS (async 202 — circle + nearby helpers)');
  console.log('    Disclaimer: "SafeAlert alerts your circle and nearby helpers. Not police/ambulance. Call 112."');
  const panic = await req('POST', '/panic/activate', {
    lat: LAGOS.lat,
    lng: LAGOS.lng,
    message: 'Investor demo panic — safe to ignore',
  }, token);
  step('POST /panic/activate', panic, (s) => s === 202);
  console.log(`    panic_id: ${panic.data?.panic_id || '—'} · circle_queued: ${panic.data?.circle_queued ?? '—'}`);
  await pause(800);

  say('3:30 — Deactivate panic (demo cleanup)');
  step('POST /panic/deactivate', await req('POST', '/panic/deactivate', {}, token));
  await pause(400);

  say('4:00 — Transparency (investor metrics)');
  const transparency = await req('GET', '/transparency');
  step('GET /transparency', transparency);
  const r = transparency.data?.report;
  if (r) {
    console.log(`    active_zones: ${r.zones?.active ?? '—'} · leaders: ${r.community?.verified_leaders ?? '—'}`);
    console.log(`    privacy: ${(r.privacy?.note || '').slice(0, 80)}…`);
  }
  await pause(400);

  say('4:45 — Close: map · report · confirm · panic · transparency — all live');
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Demo API walkthrough complete.');
  console.log(`  Open the UI: ${APP}`);
  console.log(`  Transparency: ${BASE}/app/transparency.html`);
  console.log(`  Admin: ${BASE}/app/admin/`);
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
