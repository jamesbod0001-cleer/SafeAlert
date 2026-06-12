process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';
process.env.SEED_REVIEW_DATA = 'true';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!!';
process.env.PORT = '3002';
process.env.ADMIN_SECRET = 'test-admin-secret-for-moderation';

const request = require('supertest');
const app = require('../src/server');

const BASE = '/v1/admin';
const SECRET = process.env.ADMIN_SECRET;

beforeAll(async () => {
  await app.prepare();
});

describe('Admin moderation API', () => {
  test('GET /admin/false-reports without secret → 401', async () => {
    const res = await request(app).get(`${BASE}/false-reports`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/admin secret/i);
  });

  test('GET /admin/false-reports with ADMIN_SECRET header → 200', async () => {
    const res = await request(app)
      .get(`${BASE}/false-reports`)
      .set('X-Admin-Secret', SECRET);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.flags)).toBe(true);
  });

  test('PUT /admin/settings/proximity updates runtime health flag', async () => {
    const off = await request(app)
      .put(`${BASE}/settings/proximity`)
      .set('X-Admin-Secret', SECRET)
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.proximity_alerts_enabled).toBe(false);

    const healthOff = await request(app).get('/v1/health');
    expect(healthOff.body.proximity_alerts).toBe(false);

    const on = await request(app)
      .put(`${BASE}/settings/proximity`)
      .set('X-Admin-Secret', SECRET)
      .send({ enabled: true });
    expect(on.status).toBe(200);

    const healthOn = await request(app).get('/v1/health');
    expect(healthOn.body.proximity_alerts).toBe(true);
  });
});
