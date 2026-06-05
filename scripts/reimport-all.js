#!/usr/bin/env node
/**
 * Reimport live data: HDX → Firestore (when quota allows) + refresh static fallback.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { execSync } = require('child_process');
const path = require('path');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryFirestoreImport() {
  const { initFirebase, getDb } = require('../src/config/firebase');
  initFirebase();
  const db = getDb();
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.collection('app_settings').doc('global').get();
      console.log('Firestore readable — running HDX sync to Firestore...');
      execSync('node scripts/sync-hdx-live.js', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: process.env,
      });
      return true;
    } catch (e) {
      if (/quota exceeded/i.test(e.message) || e.code === 8) {
        console.warn(`Attempt ${attempt}/5: Firestore quota exceeded — wait and retry...`);
        await sleep(attempt * 15000);
      } else {
        throw e;
      }
    }
  }
  return false;
}

async function main() {
  console.log('Step 1: Build static fallback from HDX (always works)...');
  execSync('node scripts/build-zones-fallback.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      FALLBACK_LOOKBACK_DAYS: process.env.FALLBACK_LOOKBACK_DAYS || '3650',
      FALLBACK_SYNC_LIMIT: process.env.FALLBACK_SYNC_LIMIT || '2500',
    },
  });

  console.log('\nStep 2: Import to Firestore if quota allows...');
  const imported = await tryFirestoreImport();
  if (!imported) {
    console.log('\nFirestore import skipped (quota). App will use static fallback until quota resets.');
    console.log('Upgrade Firebase to Blaze or wait ~24h, then run: npm run reimport:all');
  } else {
    console.log('\nFirestore import complete.');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
