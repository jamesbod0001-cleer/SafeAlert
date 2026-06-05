import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:3000';

const INCIDENT_TYPES = [
  'kidnapping',
  'armed_robbery',
  'banditry',
  'terror',
  'roadblock',
  'suspicious',
  'scam',
  'one_chance',
  'checkpoint',
];

// Nigeria bounding box (matches API validation)
const LAT_MIN = 4.0;
const LAT_MAX = 14.0;
const LNG_MIN = 2.7;
const LNG_MAX = 15.0;

export const options = {
  vus: 200,
  duration: '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

function randomCoord(min, max) {
  return min + Math.random() * (max - min);
}

export default function () {
  const lat = randomCoord(LAT_MIN, LAT_MAX);
  const lng = randomCoord(LNG_MIN, LNG_MAX);
  const type = INCIDENT_TYPES[__ITER % INCIDENT_TYPES.length];
  const deviceId = `load-test-${__VU}-${__ITER}`;

  const res = http.post(
    `${API}/v1/zones`,
    JSON.stringify({
      lat,
      lng,
      type,
      description: `k6 load test report vu=${__VU} iter=${__ITER}`,
      device_id: deviceId,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'zones_post' },
      responseCallback: http.expectedStatuses(201),
    }
  );

  check(res, {
    'zone created': (r) => r.status === 201,
    'zone id present': (r) => {
      try {
        return Boolean(JSON.parse(r.body).zone?.id);
      } catch {
        return false;
      }
    },
  });

  sleep(0.3 + Math.random() * 0.7);
}
