#!/usr/bin/env node
/**
 * Import verified Nigeria conflict events from HDX UCDP (no ACLED API tier).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initFirebase } = require('../src/config/firebase');
const hdxImportService = require('../src/services/hdxImportService');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const days = parseInt(process.env.HDX_UCDP_LOOKBACK_DAYS || '730', 10);

  initFirebase();

  if (!hdxImportService.isEnabled()) {
    console.error('HDX import disabled — set HDX_UCDP_ENABLED=true in .env');
    process.exit(1);
  }

  console.log(`Syncing HDX UCDP Nigeria (last ${days} days)${dryRun ? ' [dry-run]' : ''}...`);
  const result = await hdxImportService.syncFromUcdp({ days, dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
