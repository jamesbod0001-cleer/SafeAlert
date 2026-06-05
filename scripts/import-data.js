#!/usr/bin/env node
/**
 * Import zones, routes, resources, and groups into Firestore.
 *
 * Examples:
 *   node scripts/import-data.js --starter
 *   node scripts/import-data.js --file=data/nigeria-starter.json
 *   node scripts/import-data.js --acled=downloads/acled_nigeria.csv --historical
 *   node scripts/import-data.js --zones=./my-zones.json --dry-run
 *   node scripts/import-data.js --starter --resources
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { initFirebase } = require('../src/config/firebase');
const {
  importBundle,
  loadJsonFile,
  parseCsv,
  acledRowsToZones,
} = require('../src/services/importService');
const { seedResourcesIfEmpty } = require('../src/services/resourceService');

function usage() {
  console.log(`
SafeAlert data import

  --starter              Load data/nigeria-starter.json (routes + zones + groups)
  --file=<path>          JSON bundle { zones, routes, resources, groups }
  --acled=<csv>          ACLED export CSV (Nigeria rows, lat/lng columns)
  --zones=<json>         JSON array of zone objects only
  --routes=<json>        JSON array of routes only
  --resources            Also seed data/resources.json if collection empty
  --historical           ACLED/historical: import zones as inactive
  --dry-run              Print counts only, no writes
  --force                Overwrite existing docs (default: skip existing)
  --limit=N              Max zones from ACLED (default 500)

Requires FIREBASE_* in .env (or USE_MEMORY_DB=true for local test).
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    skipExisting: true,
    historicalInactive: false,
    resources: false,
    starter: false,
    limit: 500,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.skipExisting = false;
    else if (arg === '--historical') opts.historicalInactive = true;
    else if (arg === '--resources') opts.resources = true;
    else if (arg === '--starter') opts.starter = true;
    else if (arg.startsWith('--file=')) opts.file = arg.slice(7);
    else if (arg.startsWith('--acled=')) opts.acled = arg.slice(8);
    else if (arg.startsWith('--zones=')) opts.zones = arg.slice(8);
    else if (arg.startsWith('--routes=')) opts.routes = arg.slice(9);
    else if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.slice(8), 10);
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
  }
  return opts;
}

function printSummary(label, summary) {
  console.log(`\n${label}:`);
  for (const [bucket, counts] of Object.entries(summary)) {
    const parts = Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (parts) console.log(`  ${bucket}: ${parts}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.starter && !opts.file && !opts.acled && !opts.zones && !opts.routes) {
    usage();
    process.exit(1);
  }

  initFirebase();
  const importOpts = {
    dryRun: opts.dryRun,
    skipExisting: opts.skipExisting,
    historicalInactive: opts.historicalInactive,
    refreshRoutes: opts.starter || process.env.REFRESH_ROUTES === 'true',
    source: 'import',
  };

  let total = { zones: {}, routes: {}, resources: {}, groups: {} };

  if (opts.starter || opts.file) {
    console.warn(
      '⚠️  Starter/import bundles are CURATED data, not live feeds. For real data use: npm run sync:acled (requires ACLED_API_KEY)'
    );
    const file = opts.file || 'data/nigeria-starter.json';
    const bundle = loadJsonFile(file);
    console.log(`Loading bundle: ${file}`);
    const s = await importBundle(bundle, importOpts);
    printSummary('Bundle', s);
    total = s;
  }

  if (opts.zones) {
    const zones = loadJsonFile(opts.zones);
    const arr = Array.isArray(zones) ? zones : zones.zones || [];
    const s = await importBundle({ zones: arr }, importOpts);
    printSummary('Zones file', s);
  }

  if (opts.routes) {
    const routes = loadJsonFile(opts.routes);
    const arr = Array.isArray(routes) ? routes : routes.routes || [];
    const s = await importBundle({ routes: arr }, importOpts);
    printSummary('Routes file', s);
  }

  if (opts.acled) {
    const csvPath = path.isAbsolute(opts.acled) ? opts.acled : path.join(process.cwd(), opts.acled);
    if (!fs.existsSync(csvPath)) {
      console.error(`ACLED file not found: ${csvPath}`);
      process.exit(1);
    }
    console.log(`Parsing ACLED CSV: ${csvPath}`);
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const nigeria = rows.filter((r) => {
      const c = (r.country || r.iso || '').toLowerCase();
      return c.includes('nigeria') || c === 'nga' || c === 'ng';
    });
    const limited = nigeria.slice(0, opts.limit);
    const zones = acledRowsToZones(limited, {
      historicalInactive: opts.historicalInactive,
      source: 'acled',
    });
    console.log(`ACLED rows: ${rows.length} total, ${nigeria.length} Nigeria, importing ${zones.length}`);
    const s = await importBundle({ zones }, importOpts);
    printSummary('ACLED', s);
  }

  if (opts.resources && !opts.dryRun) {
    const n = await seedResourcesIfEmpty();
    console.log(`\nResources: seeded ${n} (skipped if collection already had docs)`);
  }

  if (opts.dryRun) console.log('\n(dry-run — no data written)');
  else console.log('\nImport complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
