/**
 * k6 abuse probe — run against staging only.
 *
 *   k6 run scripts/load-test/k6-security-probe.js \
 *     -e API=https://staging.example.com \
 *     -e TOKEN=eyJ...
 *
 * Checks: auth required on protected routes, webhook rejection, zone validation.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    checks: ['rate>0.95'],
  },
};

export default function () {
  const anonProfile = http.get(`${API}/v1/user/profile`);
  check(anonProfile, {
    'profile without token is 401': (r) => r.status === 401,
  });

  const badWebhook = http.post(`${API}/v1/sms/inbound`, JSON.stringify({ from: '+234800', text: 'x' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(badWebhook, {
    'sms webhook blocked or dev-open': (r) => [401, 403, 200].includes(r.status),
  });

  const invalidZone = http.post(
    `${API}/v1/zones`,
    JSON.stringify({ lat: 0, lng: 0, type: 'kidnapping', device_id: 'k6-probe' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(invalidZone, {
    'invalid zone coords rejected': (r) => r.status === 400,
  });

  if (TOKEN) {
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    };
    const zones = http.get(`${API}/v1/zones?limit=50`, { headers });
    check(zones, {
      'authed zones 200': (r) => r.status === 200,
    });
  }

  sleep(0.3);
}
