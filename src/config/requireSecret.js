const { isProduction } = require('./envValidate');

const DEV_ONLY = {
  JWT_SECRET: 'local-dev-jwt-secret-min-32-chars!!',
  HASH_SECRET: 'local-dev-hash-secret-min-32-chars!',
  ENCRYPTION_KEY: 'local_dev_encryption_key_32ch',
};

function requireSecret(name) {
  const val = process.env[name];
  if (val) return val;
  if (!isProduction() && DEV_ONLY[name]) return DEV_ONLY[name];
  throw new Error(`${name} is not configured — set in .env locally or AWS Secrets Manager in production`);
}

module.exports = { requireSecret };
