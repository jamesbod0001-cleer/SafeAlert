#!/usr/bin/env node
/**
 * Push sensitive keys from local .env into AWS Secrets Manager (JSON).
 * Usage: AWS_SECRETS_ARN=arn:aws:secretsmanager:... node scripts/aws/push-secrets-manager.js
 * Never commit .env or print secret values.
 */
const fs = require('fs');
const path = require('path');
const { SECRET_KEYS } = require('../../src/config/secretsLoader');

const ROOT = path.join(__dirname, '../..');
const ENV_PATH = path.join(ROOT, '.env');
const arn = process.env.AWS_SECRETS_ARN || process.env.SAFEALERT_SECRETS_ARN;

if (!arn) {
  console.error('Set AWS_SECRETS_ARN or SAFEALERT_SECRETS_ARN');
  process.exit(1);
}
if (!fs.existsSync(ENV_PATH)) {
  console.error('Missing .env — create from .env.example first');
  process.exit(1);
}

function parseEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    let key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = parseEnv(ENV_PATH);
  const payload = {};
  for (const key of SECRET_KEYS) {
    if (env[key]) payload[key] = env[key];
  }
  for (const [key, val] of Object.entries(env)) {
    if (key.startsWith('FIREBASE_') && val) payload[key] = val;
  }
  if (!Object.keys(payload).length) {
    console.error('No secret keys found in .env');
    process.exit(1);
  }

  const { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand, DescribeSecretCommand } =
    require('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: process.env.AWS_DEFAULT_REGION || 'us-east-1' });
  const body = JSON.stringify(payload);

  try {
    await client.send(new DescribeSecretCommand({ SecretId: arn }));
    await client.send(new PutSecretValueCommand({ SecretId: arn, SecretString: body }));
    console.log(`Updated secret (${Object.keys(payload).length} keys): ${arn}`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      await client.send(
        new CreateSecretCommand({ Name: arn, SecretString: body, Description: 'SafeAlert NG production secrets' })
      );
      console.log(`Created secret (${Object.keys(payload).length} keys): ${arn}`);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
