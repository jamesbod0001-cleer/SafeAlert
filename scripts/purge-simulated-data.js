#!/usr/bin/env node
/**
 * Remove curated/simulated zones and routes from Firestore.
 * Keeps: acled, community/user reports, ussd_reports merged zones.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initFirebase, getDb } = require('../src/config/firebase');
const { isDemoGroup } = require('../src/constants/demoGroups');

const SIMULATED_ZONE_SOURCES = new Set(['safealert_starter', 'review_fixture', 'daily_starter']);
const SIMULATED_ROUTE_SOURCES = new Set(['safealert_starter', 'review_fixture', 'import', 'daily_starter']);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  initFirebase();
  const database = getDb();

  let zonesRemoved = 0;
  let routesRemoved = 0;
  let groupsRemoved = 0;

  const zoneSnap = await database.collection('zones').get();
  for (const doc of zoneSnap.docs) {
    const z = doc.data();
    const id = doc.id;
    const simulated =
      SIMULATED_ZONE_SOURCES.has(z.source) ||
      id.startsWith('starter_') ||
      (z.reporter_hash && String(z.description || '').includes('Review fixture'));
    if (!simulated) continue;
    if (dryRun) console.log('[dry] zone', id, z.source);
    else await doc.ref.delete();
    zonesRemoved++;
  }

  const routeSnap = await database.collection('routes').get();
  for (const doc of routeSnap.docs) {
    const r = doc.data();
    if (!SIMULATED_ROUTE_SOURCES.has(r.source) && r.source !== 'import') continue;
    if (dryRun) console.log('[dry] route', doc.id, r.source);
    else await doc.ref.delete();
    routesRemoved++;
  }

  const groupSnap = await database.collection('groups').get();
  for (const doc of groupSnap.docs) {
    const g = { id: doc.id, ...doc.data() };
    if (!isDemoGroup(g)) continue;
    if (dryRun) console.log('[dry] group', doc.id, g.source || g.name);
    else await doc.ref.delete();
    groupsRemoved++;
  }

  console.log(
    dryRun
      ? `Would remove ${zonesRemoved} zones, ${routesRemoved} routes, ${groupsRemoved} demo groups (re-run without --dry-run)`
      : `Removed ${zonesRemoved} simulated zones, ${routesRemoved} simulated routes, ${groupsRemoved} demo groups`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
