#!/usr/bin/env node
/**
 * Verify offline pack JSON files have zone data.
 * Usage: node scripts/verify-offline-packs.js [--min-zones=1] [--pilot=Lagos]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACK_DIR = path.join(ROOT, 'data/offline-packs');
const states = require('../src/config/nigeriaStates.json');

const args = process.argv.slice(2);
const minZones = parseInt(
  args.find((a) => a.startsWith('--min-zones='))?.split('=')[1] || '1',
  10
);
const pilot = args.find((a) => a.startsWith('--pilot='))?.split('=')[1] || 'Lagos';

function slug(name) {
  return String(name).toLowerCase().replace(/\s+/g, '-');
}

function readPack(stateName) {
  const file = path.join(PACK_DIR, `${slug(stateName)}.json`);
  if (!fs.existsSync(file)) return { state: stateName, missing: true, zones: 0 };
  try {
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      state: stateName,
      zones: pack.zone_count ?? pack.zones?.length ?? 0,
      source: pack.source || 'cached',
    };
  } catch (e) {
    return { state: stateName, error: e.message, zones: 0 };
  }
}

function main() {
  console.log('SafeAlert — offline pack verification\n');
  if (!fs.existsSync(PACK_DIR)) {
    console.error('FAIL  data/offline-packs/ missing — run npm run build:offline-packs');
    process.exit(1);
  }

  const rows = states.map((s) => readPack(s.name));
  const empty = rows.filter((r) => !r.missing && !r.error && r.zones < minZones);
  const missing = rows.filter((r) => r.missing);
  const ok = rows.filter((r) => !r.missing && !r.error && r.zones >= minZones);

  ok.forEach((r) => console.log(`OK    ${r.state} — ${r.zones} zones (${r.source})`));
  empty.forEach((r) => console.log(`EMPTY ${r.state} — ${r.zones} zones (need ≥${minZones})`));
  missing.forEach((r) => console.log(`MISS  ${r.state}`));

  const pilotRow = rows.find((r) => r.state === pilot);
  console.log('');
  if (pilotRow) {
    const pilotOk = pilotRow.zones >= 50;
    console.log(
      `Pilot (${pilot}): ${pilotRow.zones} zones — ${pilotOk ? 'PASS (≥50)' : 'WARN (target ≥50 for demo depth)'}`
    );
  }

  console.log(`\nSummary: ${ok.length}/${states.length} packs with ≥${minZones} zone(s)`);
  const exitCode = missing.length > 0 || empty.length > states.length / 2 ? 1 : 0;
  process.exit(exitCode);
}

main();
