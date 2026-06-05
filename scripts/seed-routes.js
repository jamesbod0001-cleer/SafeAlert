#!/usr/bin/env node
/**
 * Add route documents to the database (from env or CLI args — not hardcoded in app code).
 *
 * Usage:
 *   ROUTES_JSON='[{"from":"Lagos","to":"Abuja","via":"Ore–Okene–Lokoja","safety_score":50}]' node scripts/seed-routes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initFirebase, getDb } = require('../src/config/firebase');

async function main() {
  const raw = process.env.ROUTES_JSON;
  if (!raw) {
    console.error('Set ROUTES_JSON env var with a JSON array of route objects.');
    process.exit(1);
  }

  let routes;
  try {
    routes = JSON.parse(raw);
  } catch {
    console.error('ROUTES_JSON must be valid JSON');
    process.exit(1);
  }

  initFirebase();
  const db = getDb();
  const now = new Date().toISOString();

  for (const route of routes) {
    if (!route.from || !route.to) {
      console.warn('Skipping route missing from/to:', route);
      continue;
    }
    const id = `${route.from.toLowerCase().replace(/\s/g, '_')}_${route.to.toLowerCase().replace(/\s/g, '_')}`;
    await db.collection('routes').doc(id).set({
      id,
      from: route.from,
      to: route.to,
      via: route.via || '',
      safety_score: route.safety_score ?? 50,
      travelers_last_2h: route.travelers_last_2h ?? 0,
      last_updated: now,
    });
    console.log(`Seeded: ${route.from} → ${route.to}`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
