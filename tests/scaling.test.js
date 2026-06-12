// Scaling & throughput smoke tests (in-process, no k6 required)

process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';
process.env.SEED_REVIEW_DATA = 'true';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!!';
process.env.PORT = '3011';
process.env.DEV_FIXED_OTP = '123456';
process.env.RATE_LIMIT_MAX = '500';
process.env.ZONES_MAX_PER_QUERY = '300';

const request = require('supertest');
const app = require('../src/server');
const { loginWithPhone } = require('./helpers/testAuth');

const BASE = '/v1';

beforeAll(async () => {
  await app.prepare();
});

describe('Query bounds under load', () => {
  test('GET /zones respects max limit cap', async () => {
    const res = await request(app).get(`${BASE}/zones?limit=9999`);
    expect(res.status).toBe(200);
    expect(res.body.zones.length).toBeLessThanOrEqual(300);
  });

  test('parallel zone reads complete within timeout', async () => {
    const started = Date.now();
    const batch = Array.from({ length: 50 }, () =>
      request(app).get(`${BASE}/zones?state=Lagos&limit=50`)
    );
    const results = await Promise.all(batch);
    const elapsed = Date.now() - started;

    results.forEach((r) => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(15000);
  });
});

describe('Stats & public endpoints', () => {
  test('GET /stats returns cached shape quickly', async () => {
    const started = Date.now();
    const res = await request(app).get(`${BASE}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveProperty('total_active_zones');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('concurrent /health checks stay fast', async () => {
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => request(app).get(`${BASE}/health`))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(Date.now() - started).toBeLessThan(8000);
  });
});

describe('Authenticated write throughput', () => {
  test('parallel zone reports from unique devices succeed', async () => {
    const batch = Array.from({ length: 20 }, (_, i) =>
      request(app)
        .post(`${BASE}/zones`)
        .send({
          lat: 9.07 + i * 0.001,
          lng: 7.39 + i * 0.001,
          type: 'suspicious',
          device_id: `scale-device-${i}-${Date.now()}`,
          description: `Scale test ${i}`,
        })
    );
    const results = await Promise.all(batch);
    const ok = results.filter((r) => r.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(15);
  });

  test('panic activate returns 202 or cooldown 429 under burst', async () => {
    const { authHeader } = await loginWithPhone(app, BASE, '08022223333');
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app)
          .post(`${BASE}/panic/activate`)
          .set(authHeader)
          .send({ lat: 6.52, lng: 3.38 })
      )
    );
    const statuses = attempts.map((r) => r.status);
    expect(statuses.some((s) => [202, 409, 429].includes(s))).toBe(true);
    expect(statuses.filter((s) => s === 202).length).toBeLessThanOrEqual(1);
  });
});

describe('Memory stability', () => {
  test('repeated auth OTP requests do not crash server', async () => {
    for (let i = 0; i < 25; i++) {
      const phone = `0803${String(1000000 + i).slice(-7)}`;
      const res = await request(app).post(`${BASE}/auth/request-otp`).send({ phone });
      expect([200, 429]).toContain(res.status);
    }
    const health = await request(app).get(`${BASE}/health`);
    expect(health.status).toBe(200);
  });
});
