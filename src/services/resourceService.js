const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const { distanceKm } = require('../utils/geo');
const logger = require('../utils/logger');

async function seedResourcesIfEmpty() {
  const snap = await db().collection('resources').get();
  if (!snap.empty) return 0;

  const file = path.join(__dirname, '../../data/resources.json');
  if (!fs.existsSync(file)) return 0;

  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const item of items) {
    await db().collection('resources').doc(item.id).set({
      ...item,
      created_at: new Date().toISOString(),
    });
  }
  logger.info(`[Resources] Seeded ${items.length} NGO resources`);
  return items.length;
}

async function listResources({ state, lga, type, limit = 50 } = {}) {
  let snap = await db().collection('resources').get();
  let items = snap.docs.map((d) => d.data()).filter((r) => r.active !== false);

  if (state) items = items.filter((r) => r.state?.toLowerCase() === state.toLowerCase());
  if (lga) items = items.filter((r) => r.lga?.toLowerCase() === lga.toLowerCase());
  if (type) items = items.filter((r) => r.type === type);

  return items.slice(0, limit);
}

async function nearbyResources(lat, lng, radiusKm = 25, type) {
  const all = await listResources({ type, limit: 200 });
  return all
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      ...r,
      distance_km: Math.round(distanceKm(lat, lng, r.lat, r.lng) * 10) / 10,
    }))
    .filter((r) => r.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 30);
}

module.exports = { seedResourcesIfEmpty, listResources, nearbyResources };
