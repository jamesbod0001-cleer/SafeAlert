// tests/api.test.js
// Full API test suite — runs against in-memory DB (no Firebase needed)

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!!';
process.env.PORT = '3001';

const request = require('supertest');
const app = require('../src/server');

const BASE = '/api/v1';

// ── AUTH TESTS ────────────────────────────────────────────────────────────────
describe('Auth', () => {
  test('GET /health → 200 with status ok', async () => {
    const res = await request(app).get(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('SafeAlert NG API');
  });

  test('POST /auth/request-otp → 200 with valid Nigerian number', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/request-otp`)
      .send({ phone: '08012345678' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expiresIn).toBe(600);
  });

  test('POST /auth/request-otp → 400 with invalid number', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/request-otp`)
      .send({ phone: '1234' });
    expect(res.status).toBe(400);
  });

  test('POST /auth/verify-otp → 401 with wrong OTP', async () => {
    await request(app).post(`${BASE}/auth/request-otp`).send({ phone: '08099887766' });
    const res = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ phone: '08099887766', otp: '000000' });
    expect(res.status).toBe(401);
  });
});

// ── ZONES TESTS ───────────────────────────────────────────────────────────────
describe('Zones', () => {
  test('GET /zones → 200 with seeded zones', async () => {
    const res = await request(app).get(`${BASE}/zones`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.zones)).toBe(true);
    expect(res.body.zones.length).toBeGreaterThan(0);
    expect(res.body.zones[0]).toHaveProperty('lat');
    expect(res.body.zones[0]).toHaveProperty('lng');
    expect(res.body.zones[0]).toHaveProperty('severity');
  });

  test('GET /zones → sorted critical first', async () => {
    const res = await request(app).get(`${BASE}/zones`);
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const zones = res.body.zones;
    for (let i = 0; i < zones.length - 1; i++) {
      expect(sevOrder[zones[i].severity]).toBeLessThanOrEqual(sevOrder[zones[i + 1].severity]);
    }
  });

  test('GET /zones?severity=critical → only critical zones', async () => {
    const res = await request(app).get(`${BASE}/zones?severity=critical`);
    expect(res.status).toBe(200);
    res.body.zones.forEach(z => expect(z.severity).toBe('critical'));
  });

  test('POST /zones → 201 creates new zone', async () => {
    const res = await request(app)
      .post(`${BASE}/zones`)
      .send({
        lat: 9.0765,
        lng: 7.3986,
        type: 'kidnapping',
        description: 'Test report from API test suite',
        device_id: 'test-device-001',
      });
    expect(res.status).toBe(201);
    expect(res.body.zone).toBeDefined();
    expect(res.body.zone.type).toBe('kidnapping');
    expect(res.body.zone.severity).toBe('medium'); // starts at medium
    expect(res.body.zone.verified).toBe(false);    // starts unverified
  });

  test('POST /zones → 400 with coordinates outside Nigeria', async () => {
    const res = await request(app)
      .post(`${BASE}/zones`)
      .send({ lat: 51.5, lng: -0.1, type: 'kidnapping', device_id: 'test-device-002' }); // London
    expect(res.status).toBe(400);
  });

  test('POST /zones → 400 with invalid incident type', async () => {
    const res = await request(app)
      .post(`${BASE}/zones`)
      .send({ lat: 9.0, lng: 7.5, type: 'earthquake', device_id: 'test-device-003' });
    expect(res.status).toBe(400);
  });

  test('GET /zones/:id → 200 for existing zone', async () => {
    const zonesRes = await request(app).get(`${BASE}/zones`);
    const id = zonesRes.body.zones[0].id;
    const res = await request(app).get(`${BASE}/zones/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.zone.id).toBe(id);
  });

  test('GET /zones/:id → 404 for missing zone', async () => {
    const res = await request(app).get(`${BASE}/zones/nonexistent-id-xyz`);
    expect(res.status).toBe(404);
  });

  test('PATCH /zones/:id/confirm → increments votes and reports', async () => {
    const zonesRes = await request(app).get(`${BASE}/zones`);
    const zone = zonesRes.body.zones[0];
    const before = zone.votes_danger;

    const res = await request(app)
      .patch(`${BASE}/zones/${zone.id}/confirm`)
      .send({ device_id: 'confirmer-device-999' });

    expect(res.status).toBe(200);
    expect(res.body.zone.votes_danger).toBe(before + 1);
  });

  test('PATCH /zones/:id/clear → increments cleared votes', async () => {
    const zonesRes = await request(app).get(`${BASE}/zones`);
    const zone = zonesRes.body.zones[0];
    const before = zone.votes_cleared;

    const res = await request(app)
      .patch(`${BASE}/zones/${zone.id}/clear`)
      .send({ device_id: 'clearer-device-999' });

    expect(res.status).toBe(200);
    expect(res.body.zone.votes_cleared).toBe(before + 1);
  });
});

// ── ROUTES TESTS ──────────────────────────────────────────────────────────────
describe('Routes', () => {
  test('GET /routes → 200 with route list', async () => {
    const res = await request(app).get(`${BASE}/routes`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.routes)).toBe(true);
  });

  test('GET /routes/check?from=Lagos&to=Abuja → 200 with safety data', async () => {
    const res = await request(app).get(`${BASE}/routes/check?from=Lagos&to=Abuja`);
    expect(res.status).toBe(200);
    expect(res.body.route).toBeDefined();
    expect(res.body.route.safety_score).toBeGreaterThanOrEqual(0);
    expect(res.body.warning).toBeDefined();
  });

  test('GET /routes/check → 404 for unknown route', async () => {
    const res = await request(app).get(`${BASE}/routes/check?from=Atlantis&to=Wakanda`);
    expect(res.status).toBe(404);
  });

  test('GET /routes/check → 400 without params', async () => {
    const res = await request(app).get(`${BASE}/routes/check`);
    expect(res.status).toBe(400);
  });
});

// ── GROUPS TESTS ──────────────────────────────────────────────────────────────
describe('Groups', () => {
  test('GET /groups → 200 with group list', async () => {
    const res = await request(app).get(`${BASE}/groups`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.groups)).toBe(true);
  });
});

// ── STATS TESTS ───────────────────────────────────────────────────────────────
describe('Stats', () => {
  test('GET /stats → 200 with dashboard numbers', async () => {
    const res = await request(app).get(`${BASE}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.total_active_zones).toBeGreaterThan(0);
    expect(res.body.stats).toHaveProperty('critical_zones');
    expect(res.body.stats).toHaveProperty('total_reports');
    expect(res.body.stats).toHaveProperty('by_type');
  });
});

// ── USSD TESTS ────────────────────────────────────────────────────────────────
describe('USSD', () => {
  test('POST /ussd → main menu on empty text', async () => {
    const res = await request(app)
      .post(`${BASE}/ussd`)
      .send({ sessionId: 'sess-001', serviceCode: '*384*911#', phoneNumber: '+2348012345678', text: '' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toContain('Report Incident');
    expect(res.text).toContain('Check Route');
  });

  test('POST /ussd → incident type menu on "1"', async () => {
    const res = await request(app)
      .post(`${BASE}/ussd`)
      .send({ sessionId: 'sess-002', serviceCode: '*384*911#', phoneNumber: '+2348012345678', text: '1' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Kidnapping');
  });

  test('POST /ussd → END session on report submission', async () => {
    const res = await request(app)
      .post(`${BASE}/ussd`)
      .send({ sessionId: 'sess-003', serviceCode: '*384*911#', phoneNumber: '+2348012345678', text: '1*1' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^END/);
    expect(res.text).toContain('Alert received');
  });

  test('POST /ussd → route check Lagos-Abuja', async () => {
    const res = await request(app)
      .post(`${BASE}/ussd`)
      .send({ sessionId: 'sess-004', serviceCode: '*384*911#', phoneNumber: '+2348012345678', text: '2*1' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lagos');
    expect(res.text).toContain('Abuja');
  });

  test('POST /ussd → circle alert on "3"', async () => {
    const res = await request(app)
      .post(`${BASE}/ussd`)
      .send({ sessionId: 'sess-005', serviceCode: '*384*911#', phoneNumber: '+2348012345678', text: '3' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^END/);
    expect(res.text).toContain('circle');
  });
});

// ── SECURITY TESTS ────────────────────────────────────────────────────────────
describe('Security', () => {
  test('Protected route → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/user/profile`);
    expect(res.status).toBe(401);
  });

  test('Protected route → 401 with invalid token', async () => {
    const res = await request(app)
      .get(`${BASE}/user/profile`)
      .set('Authorization', 'Bearer fake.token.here');
    expect(res.status).toBe(401);
  });

  test('404 for unknown routes', async () => {
    const res = await request(app).get(`${BASE}/nonexistent-endpoint`);
    expect(res.status).toBe(404);
  });
});

// ── UTILITY TESTS ─────────────────────────────────────────────────────────────
describe('Utilities', () => {
  test('hashAnonymous produces consistent hash', () => {
    const { hashAnonymous } = require('../src/utils/crypto');
    const h1 = hashAnonymous('08012345678');
    const h2 = hashAnonymous('08012345678');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  test('hashAnonymous different inputs produce different hashes', () => {
    const { hashAnonymous } = require('../src/utils/crypto');
    expect(hashAnonymous('08012345678')).not.toBe(hashAnonymous('08012345679'));
  });

  test('encryptContact / decryptContact roundtrip', () => {
    const { encryptContact, decryptContact } = require('../src/utils/crypto');
    const phone = '+2348012345678';
    const encrypted = encryptContact(phone);
    expect(encrypted).not.toBe(phone);
    expect(decryptContact(encrypted)).toBe(phone);
  });

  test('distanceKm Lagos to Abuja ~500km', () => {
    const { distanceKm } = require('../src/utils/geo');
    const d = distanceKm(6.5244, 3.3792, 9.0765, 7.3986); // Lagos → Abuja
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(600);
  });

  test('guessState returns Kaduna for Kaduna coordinates', () => {
    const { guessState } = require('../src/utils/geo');
    expect(guessState(10.5221, 7.4378)).toBe('Kaduna');
  });

  test('calcSeverity thresholds correct', () => {
    const { calcSeverity } = require('../src/services/zoneService');
    expect(calcSeverity(1)).toBe('low');
    expect(calcSeverity(3)).toBe('medium');
    expect(calcSeverity(5)).toBe('high');
    expect(calcSeverity(10)).toBe('critical');
    expect(calcSeverity(15)).toBe('critical');
  });
});
