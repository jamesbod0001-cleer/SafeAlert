import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN;

const CITIES = [
  { name: 'Lagos', state: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { name: 'Kano', state: 'Kano', lat: 12.0022, lng: 8.592 },
  { name: 'Port Harcourt', state: 'Rivers', lat: 4.8156, lng: 7.0498 },
];

export const options = {
  vus: 500,
  duration: '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error('TOKEN env var required — see scripts/load-test/README.md');
  }
}

export default function () {
  const city = CITIES[__ITER % CITIES.length];
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  const zonesRes = http.get(`${API}/v1/zones?state=${encodeURIComponent(city.state)}`, {
    headers,
    tags: { endpoint: 'zones' },
  });
  check(zonesRes, {
    'zones 200': (r) => r.status === 200,
    'zones has array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).zones);
      } catch {
        return false;
      }
    },
  });

  const panicRes = http.post(
    `${API}/v1/panic/activate`,
    JSON.stringify({ lat: city.lat, lng: city.lng }),
    {
      headers,
      tags: { endpoint: 'panic' },
      responseCallback: http.expectedStatuses(202, 409, 429),
    }
  );
  check(panicRes, {
    'panic accepted': (r) => [202, 409, 429].includes(r.status),
  });

  sleep(0.5 + Math.random() * 0.5);
}
