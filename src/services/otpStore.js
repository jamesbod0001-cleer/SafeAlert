const { db } = require('../config/db');
const { randomUUID: uuidv4 } = require('crypto');

const memoryFallback = new Map();
const OTP_STORE_TIMEOUT_MS = parseInt(process.env.OTP_STORE_TIMEOUT_MS || '2500', 10);

function withStoreTimeout(promise, label = 'OTP store') {
  if (!Number.isFinite(OTP_STORE_TIMEOUT_MS) || OTP_STORE_TIMEOUT_MS <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), OTP_STORE_TIMEOUT_MS);
    }),
  ]);
}

async function saveOtp(phoneHash, otp, ttlMs = 10 * 60 * 1000) {
  const record = {
    otp,
    expires: Date.now() + ttlMs,
    attempts: 0,
    created_at: new Date().toISOString(),
  };
  memoryFallback.set(phoneHash, record);

  try {
    await withStoreTimeout(
      db().collection('otps').doc(phoneHash).set(record),
      'saveOtp'
    );
  } catch {
    /* memoryFallback already set */
  }
}

async function getOtp(phoneHash) {
  try {
    const snap = await db().collection('otps').doc(phoneHash).get();
    if (!snap.exists) return memoryFallback.get(phoneHash) || null;
    return snap.data();
  } catch {
    return memoryFallback.get(phoneHash) || null;
  }
}

async function deleteOtp(phoneHash) {
  memoryFallback.delete(phoneHash);
  try {
    await db().collection('otps').doc(phoneHash).delete();
  } catch {
    /* ignore */
  }
}

async function incrementAttempts(phoneHash, record) {
  record.attempts = (record.attempts || 0) + 1;
  try {
    await db().collection('otps').doc(phoneHash).update({ attempts: record.attempts });
  } catch {
    memoryFallback.set(phoneHash, record);
  }
  return record;
}

module.exports = { saveOtp, getOtp, deleteOtp, incrementAttempts };
