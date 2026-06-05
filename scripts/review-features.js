#!/usr/bin/env node
/**
 * Walk through API features against a running server (placeholder / review mode).
 * Usage: node scripts/review-features.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000/v1';

const TEST_PHONE = '08012345678';
const DEV_OTP = process.env.DEV_FIXED_OTP || '123456';
const DEVICE_ID = 'review-device-test-99';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
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

function ok(label, r, expect = (s) => s >= 200 && s < 300) {
  const pass = expect(r.status);
  console.log(`${pass ? '✓' : '✗'} ${label} → ${r.status}`);
  if (!pass) console.log('  ', JSON.stringify(r.data).slice(0, 200));
  return pass;
}

async function main() {
  console.log(`\nSafeAlert NG — feature review @ ${BASE}\n`);

  const healthRes = await fetch('http://localhost:3000/health');
  ok('GET /health', { status: healthRes.status, data: await healthRes.json() });

  ok('GET /settings', await req('GET', '/settings'));
  ok('GET /zones', await req('GET', '/zones'));
  ok('GET /routes', await req('GET', '/routes'));
  ok('GET /routes/check Lagos→Abuja', await req('GET', '/routes/check?from=Lagos&to=Abuja'));
  ok('GET /stats', await req('GET', '/stats'));
  ok('GET /groups', await req('GET', '/groups'));

  ok('POST /auth/request-otp', await req('POST', '/auth/request-otp', { phone: TEST_PHONE }));
  const auth = await req('POST', '/auth/verify-otp', { phone: TEST_PHONE, otp: DEV_OTP });
  ok('POST /auth/verify-otp', auth);
  const token = auth.data?.token;
  if (!token) {
    console.log('\n⚠ No token — set DEV_FIXED_OTP=123456 in .env and restart server.\n');
    process.exit(1);
  }

  ok('GET /user/profile', await req('GET', '/user/profile', null, token));
  ok('PUT /user/profile', await req('PUT', '/user/profile', { display_name: 'Review User', state: 'Lagos' }, token));
  ok(
    'PUT /user/circle',
    await req(
      'PUT',
      '/user/circle',
      {
        circle: [{ name: 'Ada', phone: '+2348098765432', relation: 'sister' }],
      },
      token
    )
  );
  ok(
    'PUT /user/location',
    await req('PUT', '/user/location', { lat: 6.5244, lng: 3.3792, accuracy: 10 }, token)
  );
  ok('POST /journey/start', await req('POST', '/journey/start', {}, token));
  ok('POST /journey/end', await req('POST', '/journey/end', {}, token));

  const zones = await req('GET', '/zones');
  const zoneId = zones.data?.zones?.[0]?.id;
  if (zoneId) {
    ok('GET /zones/:id', await req('GET', `/zones/${zoneId}`));
    ok('PATCH /zones/:id/confirm', await req('PATCH', `/zones/${zoneId}/confirm`, { device_id: DEVICE_ID }));
  }

  ok(
    'POST /zones (new report)',
    await req('POST', '/zones', {
      lat: 9.0765,
      lng: 7.3986,
      type: 'suspicious',
      description: 'Review test report',
      device_id: DEVICE_ID,
    })
  );

  ok(
    'POST /panic/activate',
    await req('POST', '/panic/activate', { lat: 6.5244, lng: 3.3792 }, token)
  );
  ok('POST /panic/deactivate', await req('POST', '/panic/deactivate', {}, token));

  const ussdMain = await req('POST', '/ussd', {
    sessionId: 'review-1',
    serviceCode: '*384*911#',
    phoneNumber: '+2348012345678',
    text: '',
  });
  ok('POST /ussd (main menu)', ussdMain, (s) => s === 200);
  console.log('  USSD preview:', String(ussdMain.data).split('\n').slice(0, 4).join(' | '));

  const ussdRoute = await req('POST', '/ussd', {
    sessionId: 'review-1',
    serviceCode: '*384*911#',
    phoneNumber: '+2348012345678',
    text: '2*1',
  });
  ok('POST /ussd (route check)', ussdRoute);

  console.log('\nReview complete. Open http://localhost:3000/health in a browser.\n');
  console.log('Test OTP:', DEV_OTP, '| Phone:', TEST_PHONE);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
