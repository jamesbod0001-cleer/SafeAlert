#!/usr/bin/env node
/**
 * Pre-generate offline danger packs for every state in nigeriaStates.json.
 * Usage: node scripts/build-offline-packs-all-states.js
 * Requires: USE_MEMORY_DB=false + Firebase credentials OR runs against memory in dev.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const states = require('../src/config/nigeriaStates.json');
const offlinePackService = require('../src/services/offlinePackService');
const { initFirebase } = require('../src/config/firebase');

const OUT_DIR = path.join(__dirname, '../data/offline-packs');

async function main() {
  initFirebase();
  if (process.env.SEED_REVIEW_DATA === 'true') {
    const { seedReviewDataIfEnabled } = require('../src/config/seedReviewData');
    await seedReviewDataIfEnabled();
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const s of states) {
    const pack = await offlinePackService.buildPackFromFirestore(s.name);
    if (pack.error) {
      console.warn(`SKIP ${s.name}: ${pack.error}`);
      fail++;
      continue;
    }
    const slug = s.name.toLowerCase().replace(/\s+/g, '-');
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(pack, null, 2));
    console.log(`OK ${s.name} (${pack.zone_count} zones)`);
    ok++;
  }
  console.log(`Done: ${ok} packs, ${fail} skipped`);
  process.exit(fail > states.length / 2 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
