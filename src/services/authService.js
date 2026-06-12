// src/services/authService.js
const crypto = require('crypto');
const { db } = require('../config/db');
const { hashAnonymous } = require('../utils/crypto');
const { sendOTP } = require('./smsService');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const { requireSecret } = require('../config/requireSecret');

const otpStore = require('./otpStore');
const { isProduction } = require('../config/envValidate');
const OTP_TTL_MS = 10 * 60 * 1000;
const AUTH_DB_TIMEOUT_MS = parseInt(process.env.AUTH_DB_TIMEOUT_MS || '4000', 10);

function isSandboxMode() {
  return (process.env.AT_USERNAME || '').trim().toLowerCase() === 'sandbox';
}

/** Africa's Talking sandbox: show OTP in API + skip slow/failing SMS when testing. */
function shouldExposeSandboxOtp() {
  return isSandboxMode() || process.env.EXPOSE_SANDBOX_OTP === 'true';
}

function jwtSecret() {
  return requireSecret('JWT_SECRET');
}

function hashSecret() {
  return process.env.HASH_SECRET || jwtSecret();
}

// Lightweight JWT using built-in crypto (no jsonwebtoken package required)
// Falls back to jsonwebtoken if installed
function signToken(payload) {
  const secret = jwtSecret();
  try {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, secret, { expiresIn: '7d' });
  } catch {
    const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString(
      'base64url'
    );
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }
}

function verifyToken(token) {
  const secret = jwtSecret();
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, secret);
  } catch {
    try {
      const [data, sig] = token.split('.');
      const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
      if (sig !== expected) return null;
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }
}

function getOtpSessionSecret() {
  return hashSecret();
}

function signOtpSession({ phoneHash, otp, expires = Date.now() + OTP_TTL_MS }) {
  const data = Buffer.from(
    JSON.stringify({ kind: 'otp_session', phoneHash, otp, exp: expires })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getOtpSessionSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function readOtpSession(token) {
  if (!token) return null;
  try {
    const [data, sig] = String(token).split('.');
    if (!data || !sig) return null;
    const expected = crypto
      .createHmac('sha256', getOtpSessionSecret())
      .update(data)
      .digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.kind !== 'otp_session') return null;
    if (!payload.phoneHash || !payload.otp || !payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function fallbackUser(phoneHash, userId = `ephemeral_${phoneHash.slice(0, 24)}`) {
  const now = new Date().toISOString();
  return {
    id: userId,
    phone_hash: phoneHash,
    display_name: 'SafeAlert User',
    state: '',
    lga: '',
    fcm_token: null,
    circle: [],
    groups: [],
    estate_ids: [],
    estate_watch_enabled: true,
    journey_active: false,
    panic_active: false,
    help_nearby_enabled: false,
    help_nearby_radius_km: 5,
    notifications_enabled: true,
    last_location_write_at: null,
    created_at: now,
    last_active: now,
    ephemeral_auth: true,
  };
}

function normalisePhone(phone) {
  if (!phone) return null;
  let p = phone.toString().replace(/[\s\-().]/g,'');
  if (p.startsWith('0') && p.length === 11) p = '+234' + p.slice(1);
  else if (p.startsWith('234') && p.length === 13) p = '+' + p;
  else if (/^[789]\d{9}$/.test(p)) p = '+234' + p;
  const valid = /^\+234[789]\d{9}$/.test(p);
  return valid ? p : null;
}

async function requestOTP(phone) {
  const normalised = normalisePhone(phone);
  if (!normalised) return { error:'Invalid phone number' };
  const isSandbox = isSandboxMode();
  const exposeSandboxOtp = shouldExposeSandboxOtp();
  const useFixedOtp =
    process.env.DEV_FIXED_OTP &&
    (!isProduction() || exposeSandboxOtp);
  const otp = useFixedOtp
    ? process.env.DEV_FIXED_OTP.toString().padStart(6, '0').slice(-6)
    : Math.floor(100000 + Math.random() * 900000).toString();
  const phoneHash = hashAnonymous(normalised);
  const otp_token = signOtpSession({ phoneHash, otp });
  const response = { success: true, message: 'OTP sent', expiresIn: 600, otp_token };
  const skipSmsInSandbox =
    !process.env.AT_TRY_SMS_IN_SANDBOX || process.env.AT_TRY_SMS_IN_SANDBOX === 'false';

  // AT sandbox: return code in API immediately; optional SMS try in background (whitelist only).
  if (exposeSandboxOtp) {
    response.sandbox_otp = otp;
    response.at_sandbox = true;
    response.message = useFixedOtp
      ? `Sandbox mode — use code ${otp} (fixed test OTP). Whitelist your number in Africa's Talking sandbox to receive SMS too.`
      : 'Sandbox mode — use the code shown below. Add your phone in Africa\'s Talking → Sandbox → Phone numbers for SMS.';
    logger.info(`[Sandbox OTP] ${normalised}: ${otp}`);
    if (skipSmsInSandbox) {
      otpStore.saveOtp(phoneHash, otp).catch((err) => {
        logger.warn(`[Sandbox OTP] background save failed: ${err.message}`);
      });
      return response;
    }
  }

  await otpStore.saveOtp(phoneHash, otp);

  const smsResult = await sendOTP({
    phone: normalised,
    otp,
    timeoutMs: exposeSandboxOtp ? 3500 : undefined,
  });

  if (!smsResult.success && !smsResult.mock) {
    if (!isProduction() && process.env.DEV_FIXED_OTP) {
      return {
        ...response,
        sandbox_otp: otp,
        at_sandbox: isSandbox,
        message: `OTP ready (SMS failed — use code ${otp})`,
        sms_warning: smsResult.error,
      };
    }
    if (exposeSandboxOtp) {
      logger.info(`[Sandbox OTP] ${normalised}: ${otp} (SMS failed: ${smsResult.error})`);
      return {
        ...response,
        sandbox_otp: otp,
        at_sandbox: true,
        message: 'Sandbox — use the code in the app (SMS did not deliver)',
        sms_warning: smsResult.error,
      };
    }
    return { error: smsResult.error || 'Could not send SMS. Check your phone number and try again.' };
  }

  if (exposeSandboxOtp) {
    response.sandbox_otp = otp;
    response.at_sandbox = true;
  }

  return response;
}

async function verifyOtpFromSession(phone, otp, otpToken) {
  const normalised = normalisePhone(phone);
  if (!normalised) return { error: 'Invalid phone number' };
  if (!otpToken) return null;
  const phoneHash = hashAnonymous(normalised);
  const session = readOtpSession(otpToken);
  if (!session) return { error: 'OTP not found. Request a new one.' };
  if (session.phoneHash !== phoneHash) {
    return { error: 'OTP session mismatch. Request a new code.' };
  }
  if (Date.now() > session.exp) {
    return { error: 'OTP expired.' };
  }
  if (session.otp !== String(otp)) {
    return { error: 'Incorrect OTP' };
  }
  otpStore.deleteOtp(phoneHash).catch(() => {});
  // Even in sandbox mode we should return a persisted user so write endpoints
  // (preferences/location/journey/check-in) work during smoke and manual testing.
  if (isSandboxMode()) return completeOtpSignIn(phoneHash, { forceEphemeral: false });
  return null;
}

async function completeOtpSignIn(phoneHash, options = {}) {
  const { forceEphemeral = false } = options;
  let user;
  if (forceEphemeral) {
    user = fallbackUser(phoneHash);
  } else {
    try {
      user = await withTimeout(findOrCreateUser(phoneHash), AUTH_DB_TIMEOUT_MS, 'User lookup');
    } catch (err) {
      logger.error('[Auth] OTP sign-in failed:', err.message);
      return { error: 'Sign-in temporarily unavailable. Please try again shortly.' };
    }
  }
  let token;
  try {
    token = signToken({ userId: user.id, phoneHash, ephemeral: !!user.ephemeral_auth });
  } catch (err) {
    logger.error('[Auth] JWT sign failed:', err.message);
    return { error: 'Sign-in failed (server configuration). Please try again later.' };
  }
  return { success: true, token, user: sanitiseUser(user) };
}

async function verifyOTP(phone, otp, otpToken) {
  const normalised = normalisePhone(phone);
  if (!normalised) return { error:'Invalid phone number' };
  const phoneHash = hashAnonymous(normalised);
  const session = readOtpSession(otpToken);
  if (session && session.phoneHash !== phoneHash) {
    return { error: 'OTP session mismatch. Request a new code.' };
  }
  const now = Date.now();
  const otpValue = otp.toString();

  const sessionResult = await verifyOtpFromSession(normalised, otpValue, otpToken);
  if (sessionResult) return sessionResult;

  const record = await otpStore.getOtp(phoneHash);
  if (!record) return { error: 'OTP not found. Request a new one.' };
  if (now > record.expires) {
    otpStore.deleteOtp(phoneHash).catch(() => {});
    return { error: 'OTP expired.' };
  }
  if (record.attempts >= 5) {
    otpStore.deleteOtp(phoneHash).catch(() => {});
    return { error: 'Too many attempts.' };
  }
  if (record.otp !== otpValue) {
    await otpStore.incrementAttempts(phoneHash, record);
    return { error: 'Incorrect OTP', attemptsLeft: 5 - record.attempts };
  }
  otpStore.deleteOtp(phoneHash).catch(() => {});
  return completeOtpSignIn(phoneHash, { forceEphemeral: false });
}

async function findOrCreateUser(phoneHash) {
  const database = db();
  const snap = await database.collection('users').where('phone_hash','==',phoneHash).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const user = {
    id,
    phone_hash: phoneHash,
    display_name: `User_${id.slice(0, 6)}`,
    state: '',
    lga: '',
    fcm_token: null,
    circle: [],
    groups: [],
    estate_ids: [],
    estate_watch_enabled: true,
    journey_active: false,
    panic_active: false,
    help_nearby_enabled: false,
    help_nearby_radius_km: 5,
    notifications_enabled: true,
    last_location_write_at: null,
    created_at: now,
    last_active: now,
  };
  await database.collection('users').doc(id).set(user);
  return user;
}

async function validateToken(token) {
  try {
    const decoded = verifyToken(token);
    if (!decoded) return null;
    try {
      const snap = await withTimeout(
        db().collection('users').doc(decoded.userId).get(),
        AUTH_DB_TIMEOUT_MS,
        'Validate token'
      );
      if (snap.exists) return { id: snap.id, ...snap.data() };
    } catch (_) {
      /* fall through to token-based fallback */
    }
    if (decoded.phoneHash) {
      try {
        return await withTimeout(
          findOrCreateUser(decoded.phoneHash),
          AUTH_DB_TIMEOUT_MS,
          'Restore user from token'
        );
      } catch (_) {
        return null;
      }
    }
    return null;
  } catch { return null; }
}

function sanitiseUser(user) {
  const { phone_hash, ...safe } = user;
  return {
    ...safe,
    help_nearby_enabled: !!safe.help_nearby_enabled,
    help_nearby_radius_km: Math.min(15, safe.help_nearby_radius_km || 5),
    notifications_enabled: safe.notifications_enabled !== false,
    medical_ice: safe.medical_ice || {},
  };
}

function getPreferences(user) {
  const prefs = user.preferences || {};
  return {
    help_nearby_enabled: !!user.help_nearby_enabled,
    help_nearby_radius_km: Math.min(
      appConfig.helpNearbyMaxRadiusKm,
      user.help_nearby_radius_km || 5
    ),
    notifications_enabled: user.notifications_enabled !== false,
    estate_watch_enabled: user.estate_watch_enabled !== false,
    night_mode: !!prefs.night_mode,
    women_mode: !!prefs.women_mode,
    women_prefer_female_helpers: prefs.women_prefer_female_helpers !== false,
    women_checkin_nudge: prefs.women_checkin_nudge !== false,
    women_responder_opt_in: !!prefs.women_responder_opt_in,
    language: prefs.language || 'en',
    data_saver: prefs.data_saver === undefined ? true : !!prefs.data_saver,
    responder_skills: user.responder_skills || [],
    responder_available: !!user.responder_available,
    medical_ice: user.medical_ice || {},
  };
}

async function deleteUserAccount(userId) {
  const database = db();
  await database.collection('locations').doc(userId).delete().catch(() => {});

  const activePanics = await database
    .collection('panic_events')
    .where('user_id', '==', userId)
    .where('active', '==', true)
    .get();
  const now = new Date().toISOString();
  for (const doc of activePanics.docs) {
    await doc.ref.update({ active: false, ended_at: now, ended_reason: 'account_deleted' });
  }

  await database.collection('users').doc(userId).delete();
  logger.info(`[Auth] Account deleted: ${userId}`);
  return { success: true };
}

module.exports = {
  requestOTP,
  verifyOTP,
  verifyOtpFromSession,
  validateToken,
  findOrCreateUser,
  sanitiseUser,
  getPreferences,
  normalisePhone,
  deleteUserAccount,
};
