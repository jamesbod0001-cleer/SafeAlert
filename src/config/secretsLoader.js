/**
 * Production secrets from AWS Secrets Manager (JSON object).
 * Set AWS_SECRETS_ARN or SAFEALERT_SECRETS_ARN — never commit secret values.
 */
const logger = require('../utils/logger');

const SECRET_KEYS = new Set([
  'JWT_SECRET',
  'HASH_SECRET',
  'ENCRYPTION_KEY',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PROJECT_ID',
  'AT_API_KEY',
  'AT_USERNAME',
  'OPENAI_API_KEY',
  'ACLED_API_KEY',
  'ACLED_PASSWORD',
  'IMPORT_JOB_SECRET',
  'ADMIN_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_WEBHOOK_SECRET',
]);

function secretsArn() {
  return process.env.AWS_SECRETS_ARN || process.env.SAFEALERT_SECRETS_ARN || '';
}

async function hydrateFromSecretsManager() {
  const arn = secretsArn();
  if (!arn) return { loaded: false, source: 'env' };

  let SecretsManagerClient;
  let GetSecretValueCommand;
  try {
    ({ SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager'));
  } catch (err) {
    throw new Error(
      `AWS Secrets Manager configured (${arn}) but @aws-sdk/client-secrets-manager is unavailable: ${err.message}`
    );
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_DEFAULT_REGION || 'us-east-1' });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = res.SecretString;
  if (!raw) throw new Error(`Secret ${arn} has no SecretString`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Secret ${arn} must be a JSON object of environment keys`);
  }

  let applied = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null || value === '') continue;
    if (!SECRET_KEYS.has(key) && !key.startsWith('FIREBASE_') && !key.startsWith('AT_')) continue;
    process.env[key] = String(value);
    applied += 1;
  }

  logger.info(`[Secrets] Loaded ${applied} keys from AWS Secrets Manager`);
  return { loaded: true, source: 'secrets-manager', keys: applied };
}

module.exports = { hydrateFromSecretsManager, secretsArn, SECRET_KEYS };
