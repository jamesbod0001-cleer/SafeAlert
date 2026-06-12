#!/usr/bin/env node
/**
 * Unified launch data pipeline (Workstream B + prep for A/C/D).
 *
 * Usage:
 *   node scripts/unified-launch-pipeline.js           # full pipeline
 *   node scripts/unified-launch-pipeline.js --skip-sync  # packs only
 *   node scripts/unified-launch-pipeline.js --dry-run
 *
 * Steps: ACLED sync → HDX fallback → zones fallback JSON → offline packs → verify
 */
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const skipSync = args.includes('--skip-sync');
const dryRun = args.includes('--dry-run');

function run(label, cmd) {
  console.log(`\n▶ ${label}`);
  if (dryRun) {
    console.log(`  [dry-run] ${cmd}`);
    return;
  }
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env } });
}

async function main() {
  console.log('SafeAlert NG — unified launch pipeline\n');

  if (!skipSync) {
    try {
      run('Sync ACLED live data', 'node scripts/sync-acled-live.js');
    } catch {
      console.warn('\nWARN  ACLED sync failed — continuing with HDX/fallback');
    }
    try {
      run('Sync HDX UCDP fallback', 'node scripts/sync-hdx-live.js');
    } catch {
      console.warn('\nWARN  HDX sync failed — continuing');
    }
  } else {
    console.log('SKIP  ACLED/HDX sync (--skip-sync)');
  }

  run('Build static zones fallback', 'node scripts/build-zones-fallback.js');
  run('Build all-state offline packs', 'node scripts/build-offline-packs-all-states.js');
  run('Verify offline packs', 'node scripts/verify-offline-packs.js --min-zones=1 --pilot=Lagos');

  console.log('\n✓ Pipeline complete. Next: npm run pilot:check && npm run launch:check -- --production\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
