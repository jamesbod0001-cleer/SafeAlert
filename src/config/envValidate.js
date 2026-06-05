const logger = require('../utils/logger');

const WEAK_SECRETS = new Set([
  'dev-secret',
  'change_this_to_a_long_random_string_min_64_chars',
  'local-dev-jwt-secret-min-32-chars!!',
  'another_long_random_secret_for_device_hashing',
  'local_dev_encryption_key_32ch',
]);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function validateProductionEnv() {
  const errors = [];
  const warnings = [];

  if (!isProduction()) {
    return { ok: true, errors, warnings };
  }

  if (process.env.USE_MEMORY_DB === 'true') {
    errors.push('USE_MEMORY_DB must be false in production');
  }
  if (!process.env.FIREBASE_PROJECT_ID) {
    errors.push('FIREBASE_PROJECT_ID is required in production');
  }
  if (process.env.SEED_REVIEW_DATA === 'true') {
    errors.push('SEED_REVIEW_DATA must be false in production');
  }
  if (process.env.DEV_FIXED_OTP && process.env.EXPOSE_SANDBOX_OTP !== 'true') {
    warnings.push('DEV_FIXED_OTP is ignored in production — remove it or use EXPOSE_SANDBOX_OTP=true for sandbox OTP in API');
  }

  for (const key of ['JWT_SECRET', 'HASH_SECRET', 'ENCRYPTION_KEY']) {
    const val = process.env[key];
    if (!val || val.length < 32) {
      errors.push(`${key} must be at least 32 characters in production`);
    } else if (WEAK_SECRETS.has(val)) {
      errors.push(`${key} is a known weak/default value`);
    }
  }

  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length !== 32) {
    warnings.push('ENCRYPTION_KEY should be exactly 32 characters for AES-256');
  }

  if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
    warnings.push('Africa\'s Talking not configured — SMS/OTP will be logged only');
  } else if (
    process.env.AT_USERNAME.trim().toLowerCase() !== 'sandbox' &&
    !(process.env.AT_SENDER_ID || '').trim()
  ) {
    warnings.push('AT_SENDER_ID is empty — production SMS/OTP will fail until a Sender ID is approved');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function assertProductionEnv() {
  const result = validateProductionEnv();
  for (const w of result.warnings) logger.warn(`[Env] ${w}`);
  if (!result.ok) {
    for (const e of result.errors) logger.error(`[Env] ${e}`);
    throw new Error(`Production environment invalid: ${result.errors.join('; ')}`);
  }
}

module.exports = { isProduction, validateProductionEnv, assertProductionEnv };
