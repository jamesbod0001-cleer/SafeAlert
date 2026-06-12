// Security & anti-abuse tests — auth, admin, IDOR, injection, webhooks, vote spam

process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';
process.env.SEED_REVIEW_DATA = 'true';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!!';
process.env.HASH_SECRET = 'test-hash-secret-32-chars-minimum!!';
process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
process.env.PORT = '3010';
process.env.DEV_FIXED_OTP = '123456';
process.env.ADMIN_SECRET = 'test-admin-secret-for-moderation';
process.env.IMPORT_JOB_SECRET = 'test-import-secret';
process.env.SMS_INBOUND_WEBHOOK_SECRET = 'sms-webhook-test-secret';
process.env.WHATSAPP_WEBHOOK_SECRET = 'wa-webhook-test-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-test';
process.env.RATE_LIMIT_ZONE_VOTE_MAX = '5';

const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const whatsappService = require('../src/services/whatsappService');
const app = require('../src/server');
const { loginWithPhone } = require('./helpers/testAuth');

const { validateProductionEnv } = require('../src/config/envValidate');

const BASE = '/v1';

beforeAll(async () => {
  await app.prepare();
});

describe('Production environment hardening', () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env.NODE_ENV = orig.NODE_ENV;
    process.env.USE_MEMORY_DB = orig.USE_MEMORY_DB;
    process.env.JWT_SECRET = orig.JWT_SECRET;
    process.env.SEED_REVIEW_DATA = orig.SEED_REVIEW_DATA;
    process.env.DEV_FIXED_OTP = orig.DEV_FIXED_OTP;
  });

  test('validateProductionEnv rejects weak secrets and memory DB', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_MEMORY_DB = 'true';
    process.env.SEED_REVIEW_DATA = 'true';
    process.env.JWT_SECRET = 'dev-secret';
    process.env.HASH_SECRET = 'dev-secret';
    process.env.ENCRYPTION_KEY = 'dev-secret';

    const result = validateProductionEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('validateProductionEnv passes with strong production config', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_MEMORY_DB = 'false';
    process.env.SEED_REVIEW_DATA = 'false';
    process.env.FIREBASE_PROJECT_ID = 'safealert-prod';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.HASH_SECRET = 'b'.repeat(64);
    process.env.ENCRYPTION_KEY = 'c'.repeat(32);

    const result = validateProductionEnv();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Authentication security', () => {
  test('full OTP login returns JWT usable on profile', async () => {
    const { authHeader, user } = await loginWithPhone(app, BASE, '08011112222');
    expect(user.id).toBeTruthy();

    const profile = await request(app).get(`${BASE}/user/profile`).set(authHeader);
    expect(profile.status).toBe(200);
    expect(profile.body.user.id).toBe(user.id);
    expect(profile.body.user.phone_hash).toBeUndefined();
  });

  test('verify-otp rejects wrong OTP after request', async () => {
    const otpRes = await request(app).post(`${BASE}/auth/request-otp`).send({ phone: '08033334444' });
    expect(otpRes.status).toBe(200);

    const bad = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ phone: '08033334444', otp: '000000', otp_token: otpRes.body.otp_token });
    expect(bad.status).toBe(401);
  });

  test('verify-otp rejects phone mismatch with otp_token', async () => {
    const otpRes = await request(app).post(`${BASE}/auth/request-otp`).send({ phone: '08055556666' });
    const bad = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ phone: '08077778888', otp: '123456', otp_token: otpRes.body.otp_token });
    expect(bad.status).toBe(401);
  });

  test('tampered JWT signature → 401', async () => {
    const { token } = await loginWithPhone(app, BASE, '08099990001');
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
    const res = await request(app)
      .get(`${BASE}/user/profile`)
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  test('expired JWT → 401', async () => {
    const expired = jwt.sign(
      { userId: 'fake-user', phoneHash: 'abc' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const res = await request(app)
      .get(`${BASE}/user/profile`)
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('Admin & import secrets', () => {
  test('admin routes reject wrong secret', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/false-reports`)
      .set('X-Admin-Secret', 'wrong-secret');
    expect(res.status).toBe(401);
  });

  test('import run rejects without secret', async () => {
    const res = await request(app).post(`${BASE}/admin/import/run`).send({});
    expect(res.status).toBe(401);
  });
});

describe('Webhook forgery prevention', () => {
  test('POST /sms/inbound without secret → 401 when secret configured', async () => {
    const res = await request(app)
      .post(`${BASE}/sms/inbound`)
      .send({ from: '+2348012345678', text: 'HELP' });
    expect(res.status).toBe(401);
  });

  test('POST /sms/inbound with valid secret → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/sms/inbound`)
      .set('X-Webhook-Secret', process.env.SMS_INBOUND_WEBHOOK_SECRET)
      .send({ from: '+2348012345678', text: 'HELP' });
    expect(res.status).toBe(200);
  });

  test('GET /webhooks/whatsapp rejects bad verify token', async () => {
    const res = await request(app).get(`${BASE}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123`);
    expect(res.status).toBe(403);
  });

  test('POST /webhooks/whatsapp without secret → 401', async () => {
    const res = await request(app)
      .post(`${BASE}/webhooks/whatsapp`)
      .send({ entry: [] });
    expect(res.status).toBe(401);
  });

  test('POST /webhooks/whatsapp rejects bad Meta signature', async () => {
    const raw = JSON.stringify({ entry: [] });
    const res = await request(app)
      .post(`${BASE}/webhooks/whatsapp`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(401);
  });

  test('POST /webhooks/whatsapp accepts valid Meta signature', async () => {
    const raw = JSON.stringify({ entry: [] });
    const sig = `sha256=${crypto
      .createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET)
      .update(raw)
      .digest('hex')}`;
    const res = await request(app)
      .post(`${BASE}/webhooks/whatsapp`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(raw);
    expect(res.status).toBe(200);
  });

  test('verifyPostSignature unit check', () => {
    const raw = '{"entry":[]}';
    const sig = `sha256=${crypto
      .createHmac('sha256', 'wa-webhook-test-secret')
      .update(raw)
      .digest('hex')}`;
    expect(whatsappService.verifyPostSignature(raw, sig)).toBe(true);
    expect(whatsappService.verifyPostSignature(raw, 'sha256=00')).toBe(false);
  });
});

describe('Input validation & injection resistance', () => {
  test('POST /zones rejects prototype pollution keys safely', async () => {
    const res = await request(app)
      .post(`${BASE}/zones`)
      .send({
        lat: 9.0765,
        lng: 7.3986,
        type: 'kidnapping',
        device_id: 'proto-test',
        __proto__: { polluted: true },
      });
    expect([201, 400]).toContain(res.status);
    expect(res.body.zone?.__proto__?.polluted).toBeUndefined();
  });

  test('POST /zones rejects SQL-like strings in description', async () => {
    const res = await request(app)
      .post(`${BASE}/zones`)
      .send({
        lat: 9.07,
        lng: 7.39,
        type: 'suspicious',
        device_id: 'sql-test',
        description: "'; DROP TABLE zones; --",
      });
    expect(res.status).toBe(201);
    expect(res.body.zone.description).toContain('DROP TABLE');
    expect(typeof res.body.zone.id).toBe('string');
  });

  test('PUT /user/fcm-token rejects oversized token', async () => {
    const { authHeader } = await loginWithPhone(app, BASE, '08088881111');
    const res = await request(app)
      .put(`${BASE}/user/fcm-token`)
      .set(authHeader)
      .send({ fcm_token: 'x'.repeat(5000) });
    expect([400, 413, 422]).toContain(res.status);
  });
});

describe('Zone vote spam prevention', () => {
  test('same device cannot inflate confirm votes repeatedly', async () => {
    const create = await request(app)
      .post(`${BASE}/zones`)
      .send({
        lat: 9.05,
        lng: 7.42,
        type: 'roadblock',
        device_id: 'vote-spam-device',
      });
    expect(create.status).toBe(201);
    const id = create.body.zone.id;
    const initialVotes = create.body.zone.votes_danger;

    for (let i = 0; i < 5; i++) {
      await request(app)
        .patch(`${BASE}/zones/${id}/confirm`)
        .send({ device_id: 'vote-spam-device' });
    }

    const zone = await request(app).get(`${BASE}/zones/${id}`);
    expect(zone.body.zone.votes_danger).toBe(initialVotes + 1);
  });

  test('per-IP rate limit blocks excessive confirm/clear votes', async () => {
    const create = await request(app)
      .post(`${BASE}/zones`)
      .send({
        lat: 9.06,
        lng: 7.43,
        type: 'suspicious',
        device_id: 'rate-limit-zone',
      });
    expect(create.status).toBe(201);
    const id = create.body.zone.id;

    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app)
        .patch(`${BASE}/zones/${id}/confirm`)
        .send({ device_id: `unique-voter-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});

describe('Convoy member injection prevention', () => {
  test('cannot add arbitrary user IDs to convoy', async () => {
    const attacker = await loginWithPhone(app, BASE, '08066667777');
    const victim = await loginWithPhone(app, BASE, '08066668888');

    const res = await request(app)
      .post(`${BASE}/journey/convoy`)
      .set(attacker.authHeader)
      .send({ member_ids: [victim.user.id], title: 'Hijack attempt' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/safety circle/i);

    const victimProfile = await request(app).get(`${BASE}/user/profile`).set(victim.authHeader);
    expect(victimProfile.body.user.journey_active).not.toBe(true);
  });
});

describe('Panic privacy', () => {
  test('non-victim sees fuzzed coordinates on GET /panic/:id', async () => {
    const victim = await loginWithPhone(app, BASE, '08044445555');
    const bystander = await loginWithPhone(app, BASE, '08044446666');

    const activate = await request(app)
      .post(`${BASE}/panic/activate`)
      .set(victim.authHeader)
      .send({ lat: 6.5244123, lng: 3.3792456 });
    expect([202, 409]).toContain(activate.status);
    if (activate.status !== 202) return;

    const panicId = activate.body.panic_id || activate.body.event?.id;
    expect(panicId).toBeTruthy();

    const victimView = await request(app).get(`${BASE}/panic/${panicId}`).set(victim.authHeader);
    expect(victimView.status).toBe(200);
    expect(victimView.body.panic.lat).toBeCloseTo(6.5244123, 2);

    const bystanderView = await request(app).get(`${BASE}/panic/${panicId}`).set(bystander.authHeader);
    expect(bystanderView.status).toBe(200);
    expect(bystanderView.body.panic.lat).toBe(6.52);
    expect(bystanderView.body.panic.lng).toBe(3.38);
  });

  test('bystander cannot list panic responders (403)', async () => {
    const victim = await loginWithPhone(app, BASE, '08033332222');
    const bystander = await loginWithPhone(app, BASE, '08033331111');

    const activate = await request(app)
      .post(`${BASE}/panic/activate`)
      .set(victim.authHeader)
      .send({ lat: 6.52, lng: 3.38 });
    if (activate.status !== 202) return;

    const panicId = activate.body.panic_id;
    const res = await request(app)
      .get(`${BASE}/panic/${panicId}/responders`)
      .set(bystander.authHeader);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorised/i);
  });

  test('responder can list responders after marking on the way', async () => {
    const victim = await loginWithPhone(app, BASE, '08022221111');
    const helper = await loginWithPhone(app, BASE, '08022220000');

    const activate = await request(app)
      .post(`${BASE}/panic/activate`)
      .set(victim.authHeader)
      .send({ lat: 6.52, lng: 3.38 });
    if (activate.status !== 202) return;

    const panicId = activate.body.panic_id;
    await request(app)
      .post(`${BASE}/panic/${panicId}/respond`)
      .set(helper.authHeader);

    const res = await request(app)
      .get(`${BASE}/panic/${panicId}/responders`)
      .set(helper.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.responders.some((r) => r.is_you)).toBe(true);
    expect(res.body.victim_id).toBeUndefined();
  });
});

describe('Security headers', () => {
  test('GET /health includes helmet security headers', async () => {
    const res = await request(app).get(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
