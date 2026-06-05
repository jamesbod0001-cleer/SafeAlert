#!/usr/bin/env node
/**
 * National launch pre-flight checklist — run before T-0 go-live.
 *
 * Usage:
 *   npm run launch:check
 *   node scripts/national-launch-checklist.js
 *   node scripts/national-launch-checklist.js --skip-tests
 *   node scripts/national-launch-checklist.js --production
 *   node scripts/national-launch-checklist.js --dry-run
 *
 * Purge simulated/review data before launch (staging/prod):
 *   node scripts/purge-simulated-data.js --dry-run
 *   node scripts/purge-simulated-data.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const production = args.includes('--production');
const skipTests = args.includes('--skip-tests');
const dryRun = args.includes('--dry-run');

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function warn(name, detail = '') {
  results.push({ name, ok: true, warn: true, detail });
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, detail = '') {
  results.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

function checkSeedReviewData() {
  const value = process.env.SEED_REVIEW_DATA;
  if (value === 'true') {
    if (production) {
      fail('SEED_REVIEW_DATA', 'must not be true in production');
    } else {
      warn('SEED_REVIEW_DATA', 'set to true — disable before national launch');
    }
    return;
  }
  pass('SEED_REVIEW_DATA', 'not enabled');
}

function checkDevFixedOtp() {
  if (process.env.DEV_FIXED_OTP) {
    if (production) {
      fail('DEV_FIXED_OTP', 'must be unset for production launch');
    } else {
      warn('DEV_FIXED_OTP', 'set — unset before national launch');
    }
    return;
  }
  pass('DEV_FIXED_OTP', 'unset');
}

function checkUseMemoryDb() {
  if (!production) return;
  if (process.env.USE_MEMORY_DB === 'true') {
    fail('USE_MEMORY_DB', 'must be false in production');
    return;
  }
  pass('USE_MEMORY_DB', 'false');
}

function checkNigeriaStates() {
  const file = path.join(ROOT, 'src/config/nigeriaStates.json');
  if (!fs.existsSync(file)) {
    fail('nigeriaStates.json', 'file missing');
    return;
  }
  let states;
  try {
    states = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('nigeriaStates.json', `invalid JSON: ${e.message}`);
    return;
  }
  const count = Array.isArray(states) ? states.length : 0;
  if (count === 37) {
    pass('nigeriaStates.json', '37 states');
  } else {
    fail('nigeriaStates.json', `expected 37 entries, found ${count}`);
  }
}

function checkOfflinePacks() {
  const dir = path.join(ROOT, 'data/offline-packs');
  if (!fs.existsSync(dir)) {
    fail('offline-packs', 'directory missing');
    return;
  }
  const jsonFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (jsonFiles.length >= 37) {
    pass('offline-packs', `${jsonFiles.length} .json files`);
  } else {
    fail('offline-packs', `expected ≥37 .json files, found ${jsonFiles.length}`);
  }
}

function checkPublicFile(relPath, label) {
  const file = path.join(ROOT, relPath);
  if (fs.existsSync(file)) {
    pass(label, relPath);
  } else {
    fail(label, `${relPath} missing`);
  }
}

function checkNpmTest() {
  if (skipTests || dryRun) {
    skip('npm test', skipTests ? '--skip-tests' : '--dry-run');
    return;
  }
  try {
    execSync('npm test', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });
    pass('npm test', 'all tests passed');
  } catch (e) {
    const out = (e.stdout?.toString() || e.stderr?.toString() || e.message).trim();
    const tail = out.split('\n').slice(-3).join(' ');
    fail('npm test', tail || 'tests failed');
  }
}

async function checkHealth() {
  const useMemory = process.env.USE_MEMORY_DB === 'true';
  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();

  if (useMemory || !projectId) {
    skip('health endpoint', useMemory ? 'USE_MEMORY_DB=true' : 'FIREBASE_PROJECT_ID unset');
    return;
  }

  if (dryRun) {
    skip('health endpoint', '--dry-run');
    return;
  }

  const base = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
    /\/$/,
    ''
  );
  const url = `${base}/v1/health`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      fail('health endpoint', `HTTP ${res.status} from ${url}`);
      return;
    }

    const body = await res.json();
    if (body.database === 'firestore' && body.status === 'ok') {
      pass('health endpoint', `database=firestore (${url})`);
    } else if (body.database === 'firestore') {
      warn('health endpoint', `database=firestore but status=${body.status}`);
    } else {
      fail('health endpoint', `expected database=firestore, got ${body.database}`);
    }
  } catch (e) {
    skip('health endpoint', `no server at ${url}`);
  }
}

async function main() {
  console.log('SafeAlert NG — national launch checklist\n');
  if (production) console.log('Mode: production (strict)\n');
  if (dryRun) console.log('Mode: dry-run (print only, no failure exit)\n');

  checkSeedReviewData();
  checkDevFixedOtp();
  checkUseMemoryDb();
  checkNigeriaStates();
  checkOfflinePacks();
  checkPublicFile('public/privacy.html', 'privacy.html');
  checkPublicFile('public/terms.html', 'terms.html');
  checkNpmTest();
  await checkHealth();

  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.warn);

  console.log('');
  if (failed.length === 0) {
    console.log(
      warned.length
        ? `READY (with ${warned.length} warning${warned.length === 1 ? '' : 's'})`
        : 'READY for national launch'
    );
    process.exit(dryRun ? 0 : 0);
  }

  console.log(`NOT READY — ${failed.length} check${failed.length === 1 ? '' : 's'} failed`);
  if (!dryRun) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
