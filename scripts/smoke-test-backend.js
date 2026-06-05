#!/usr/bin/env node
/**
 * End-to-end backend smoke tests. Run with server already up, or auto-start on PORT.
 * Usage:
 *   node scripts/smoke-test-backend.js
 *   BASE_URL=https://qrhtc5kg79.us-east-1.awsapprunner.com node scripts/smoke-test-backend.js
 */
require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3099').replace(/\/$/, '');
const API = `${BASE}/v1`;
const PHONE = process.env.SMOKE_PHONE || '08031234567';
const DEVICE = 'smoke-test-device-001';

const results = [];
let token = null;
let zoneId = null;
let child = null;

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, path, body, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
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

async function waitForServer(ms = 45000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startLocalServer() {
  if (process.env.BASE_URL) return;
  const port = new URL(BASE).port || '3099';
  const childEnv = { ...process.env, PORT: port, NODE_ENV: process.env.SMOKE_NODE_ENV || 'production' };
  delete childEnv.DEV_FIXED_OTP;
  childEnv.USE_MEMORY_DB = process.env.SMOKE_USE_MEMORY || 'false';
  childEnv.EXPOSE_SANDBOX_OTP = childEnv.EXPOSE_SANDBOX_OTP || 'true';
  childEnv.LOCATION_MIN_INTERVAL_SEC = childEnv.SMOKE_LOCATION_INTERVAL_SEC || '1';

  child = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = await waitForServer();
  if (!ok) throw new Error(`Server did not start on ${BASE}`);
  console.log(`Server ready at ${BASE}\n`);
}

async function testHealth() {
  const { status, data } = await req('GET', '/health');
  if (status !== 200) return fail('GET /health', `HTTP ${status}`);
  if (!data.firestore_ok) return fail('GET /health', 'firestore_ok=false');
  const fcmOk = data.fcm_web_configured !== false && data.fcm_web_configured !== undefined
    ? data.fcm_web_configured
    : !!(await req('GET', '/config/public')).data?.firebase?.apiKey;
  if (!fcmOk) return fail('GET /health', 'FCM web not configured');
  pass('GET /health', `db=${data.database} sandbox_otp=${data.sandbox_otp_in_api}`);
}

async function testPublicData() {
  for (const [name, path] of [
    ['GET /zones', '/zones'],
    ['GET /routes', '/routes'],
    ['GET /settings', '/settings'],
    ['GET /stats', '/stats'],
    ['GET /groups', '/groups'],
    ['GET /resources', '/resources'],
    ['GET /config/public', '/config/public'],
  ]) {
    const { status, data } = await req('GET', path);
    if (status !== 200) {
      fail(name, `HTTP ${status} ${data?.error || ''}`);
      continue;
    }
    if (path === '/settings' && !(data.settings?.incident_types?.length)) {
      fail(name, 'no incident_types');
      continue;
    }
    if (path === '/config/public' && !data.firebase?.apiKey) {
      fail(name, 'no firebase config');
      continue;
    }
    pass(name);
  }
}

async function testAuth() {
  const { status: s1, data: d1 } = await req('POST', '/auth/request-otp', { phone: PHONE });
  if (s1 !== 200 || !d1.success) {
    return fail('POST /auth/request-otp', d1?.error || `HTTP ${s1}`);
  }
  const otp = d1.sandbox_otp || (process.env.BASE_URL ? null : process.env.DEV_FIXED_OTP);
  if (!otp) {
    return fail(
      'POST /auth/request-otp',
      d1.sandbox_otp === undefined
        ? 'no sandbox_otp — set EXPOSE_SANDBOX_OTP=true on server'
        : 'no OTP in response'
    );
  }
  pass('POST /auth/request-otp', `otp received`);

  const { status: s2, data: d2 } = await req('POST', '/auth/verify-otp', { phone: PHONE, otp });
  if (s2 !== 200 || !d2.token) {
    return fail('POST /auth/verify-otp', d2?.error || `HTTP ${s2}`);
  }
  token = d2.token;
  pass('POST /auth/verify-otp', 'JWT ok');
}

async function testAuthenticated() {
  const tests = [
    ['GET /user/profile', 'GET', '/user/profile'],
    ['GET /user/preferences', 'GET', '/user/preferences'],
    ['GET /user/circle', 'GET', '/user/circle'],
    ['PUT /user/preferences', 'PUT', '/user/preferences', { help_nearby_enabled: true, help_nearby_radius_km: 5 }],
    ['PUT /user/fcm-token', 'PUT', '/user/fcm-token', { token: 'smoke-fcm-token-placeholder' }],
    ['PUT /user/location', 'PUT', '/user/location', { lat: 9.082, lng: 8.6753 }],
    ['GET /check-in/active', 'GET', '/check-in/active'],
    ['GET /responders/nearby', 'GET', '/responders/nearby?lat=9.08&lng=8.67&radius_km=10'],
    ['GET /panic/nearby', 'GET', '/panic/nearby?lat=9.08&lng=8.67&radius_km=10'],
    ['GET /resources/nearby', 'GET', '/resources/nearby?lat=9.08&lng=8.67&radius_km=50'],
  ];

  for (const t of tests) {
    const [, method, path, body] = t;
    const { status, data } = await req(method, path, body, true);
    if (status >= 400) {
      fail(t[0], `HTTP ${status} ${data?.error || ''}`);
    } else {
      pass(t[0]);
    }
  }
}

async function testZoneReport() {
  const types = (await req('GET', '/settings')).data?.settings?.incident_types || ['suspicious'];
  const { status, data } = await req('POST', '/zones', {
    lat: 9.082,
    lng: 8.6753,
    type: types[0],
    description: 'Smoke test zone',
    device_id: DEVICE,
  });
  if (status !== 201 || !data.zone?.id) {
    return fail('POST /zones', data?.error || `HTTP ${status}`);
  }
  zoneId = data.zone.id;
  pass('POST /zones', zoneId);

  const { status: s2 } = await req('GET', `/zones/${zoneId}`);
  if (s2 !== 200) fail('GET /zones/:id', `HTTP ${s2}`);
  else pass('GET /zones/:id');
}

async function testJourneyAndCheckIn() {
  const { status: js, data: jd } = await req('POST', '/journey/start', { lat: 9.08, lng: 8.67 }, true);
  if (js !== 200) fail('POST /journey/start', jd?.error || `HTTP ${js}`);
  else pass('POST /journey/start');

  const active = await req('GET', '/check-in/active', null, true);
  if (active.data?.check_in?.id) {
    await req('POST', `/check-in/${active.data.check_in.id}/confirm`, {}, true);
  }

  const due = new Date(Date.now() + 3600000).toISOString();
  const { status: cs, data: cd } = await req(
    'POST',
    '/check-in',
    { due_at: due, notify_circle: false },
    true
  );
  if (cs !== 201 && cs !== 200) fail('POST /check-in', cd?.error || `HTTP ${cs}`);
  else pass('POST /check-in');

  const { status: je } = await req('POST', '/journey/end', {}, true);
  if (je !== 200) fail('POST /journey/end', `HTTP ${je}`);
  else pass('POST /journey/end');
}

async function testRoutesCheck() {
  const { status, data } = await req('GET', '/routes/check?from=Lagos&to=Abuja');
  if (status !== 200 && status !== 404) {
    fail('GET /routes/check', `HTTP ${status}`);
  } else {
    pass('GET /routes/check', status === 404 ? 'no route (ok)' : data.route?.from);
  }
}

async function main() {
  console.log(`\nSafeAlert backend smoke tests → ${API}\n`);

  try {
    await startLocalServer();
    await testHealth();
    await testPublicData();
    await testAuth();
    await testAuthenticated();
    await testZoneReport();
    await testJourneyAndCheckIn();
    await testRoutesCheck();
  } catch (e) {
    fail('smoke runner', e.message);
  } finally {
    if (child) child.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log('\nAll smoke tests passed.\n');
}

main();
