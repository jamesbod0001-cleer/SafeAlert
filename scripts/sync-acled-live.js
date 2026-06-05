#!/usr/bin/env node
/**
 * One-off live sync from ACLED API → Firestore zones.
 * Requires ACLED_API_KEY + ACLED_EMAIL in .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initFirebase } = require('../src/config/firebase');
const acledService = require('../src/services/acledService');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const days = parseInt(process.env.ACLED_LOOKBACK_DAYS || '30', 10);

  initFirebase();

  if (!acledService.isConfigured()) {
    console.error(`
ACLED credentials missing.

1. Register (free): https://acleddata.com
2. Add to .env (do NOT paste password in chat):
   ACLED_EMAIL=your@email.com
   ACLED_PASSWORD=your_password
3. Re-run: npm run sync:acled
`);
    process.exit(1);
  }

  console.log(`Syncing ACLED Nigeria events (last ${days} days)${dryRun ? ' [dry-run]' : ''}...`);
  const result = await acledService.syncLiveFromAcled({ days, dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  if (/access denied|403/i.test(e.message)) {
    console.error('\nTip: import verified HDX data now → npm run sync:hdx');
  }
  process.exit(1);
});
