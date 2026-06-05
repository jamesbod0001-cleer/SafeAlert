#!/usr/bin/env node
/**
 * Build static zones + stats JSON from HDX UCDP (no Firestore reads/writes).
 * Run: npm run build:zones-fallback
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const hdxImportService = require('../src/services/hdxImportService');
const { acledRowsToZones } = require('../src/services/importService');

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const ZONES_OUT = path.join(OUT_DIR, 'zones-fallback.json');
const STATS_OUT = path.join(OUT_DIR, 'stats-fallback.json');

async function main() {
  const days = parseInt(
    process.env.FALLBACK_LOOKBACK_DAYS || process.env.HDX_UCDP_LOOKBACK_DAYS || '3650',
    10
  );
  const limit = parseInt(process.env.FALLBACK_SYNC_LIMIT || process.env.HDX_UCDP_SYNC_LIMIT || '2500', 10);

  console.log(`Downloading HDX UCDP (last ${days} days, max ${limit} zones)...`);
  const text = await hdxImportService.fetchUcdpCsv();
  const rows = require('../src/services/importService').parseCsv(text);
  const recent = hdxImportService.filterRowsByLookback(rows, days);
  console.log(`Rows: ${rows.length} total, ${recent.length} in window`);

  const mapped = [];
  for (const row of recent) {
    const shape = hdxImportService.ucdpRowToAcledShape(row);
    if (shape) mapped.push(shape);
    if (mapped.length >= limit) break;
  }

  const zones = acledRowsToZones(mapped, { historicalInactive: false, source: 'hdx_ucdp' });
  for (const z of zones) {
    z.source = 'hdx_ucdp';
    z.active = true;
  }

  const by_state = {};
  const by_source = {};
  const by_type = {};
  for (const z of zones) {
    const st = (z.state || 'Unknown').trim().replace(/\s+state$/i, '') || 'Unknown';
    by_state[st] = (by_state[st] || 0) + 1;
    by_source[z.source] = (by_source[z.source] || 0) + 1;
    by_type[z.type] = (by_type[z.type] || 0) + 1;
  }

  const stats = {
    total_active_zones: zones.length,
    critical_zones: zones.filter((z) => z.severity === 'critical').length,
    high_zones: zones.filter((z) => z.severity === 'high').length,
    medium_zones: zones.filter((z) => z.severity === 'medium').length,
    low_zones: zones.filter((z) => z.severity === 'low').length,
    total_reports: zones.reduce((s, z) => s + (z.reports || 0), 0),
    active_panics: 0,
    live_count: zones.filter((z) => z.severity === 'critical').length,
    verified_zones: zones.filter((z) => z.verified).length,
    by_type,
    by_state,
    top_states: Object.entries(by_state)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    by_source,
    last_updated: new Date().toISOString(),
  };

  const generated_at = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    ZONES_OUT,
    JSON.stringify({ generated_at, dataset: 'hdx_ucdp', lookback_days: days, zones }, null, 0)
  );
  fs.writeFileSync(STATS_OUT, JSON.stringify({ generated_at, stats }, null, 2));

  console.log(`Wrote ${zones.length} zones → ${ZONES_OUT}`);
  console.log(`Wrote stats → ${STATS_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
