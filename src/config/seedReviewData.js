const path = require('path');
const fs = require('fs');
const { db } = require('./db');
const zoneService = require('../services/zoneService');
const logger = require('../utils/logger');

async function seedReviewDataIfEnabled() {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.SEED_REVIEW_DATA !== 'true') return;

  const fixturesPath = path.join(__dirname, '../../data/review-fixtures.json');
  if (!fs.existsSync(fixturesPath)) {
    logger.warn('[Review seed] data/review-fixtures.json not found');
    return;
  }

  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const database = db();
  const now = new Date().toISOString();

  for (const route of fixtures.routes || []) {
    const id = `${route.from.toLowerCase().replace(/\s/g, '_')}_${route.to.toLowerCase().replace(/\s/g, '_')}`;
    const existing = await database.collection('routes').doc(id).get();
    if (existing.exists) continue;
    await database.collection('routes').doc(id).set({
      id,
      ...route,
      last_updated: now,
      source: 'review_fixture',
    });
  }

  for (const group of fixtures.groups || []) {
    const existing = await database.collection('groups').doc(group.id).get();
    if (existing.exists) continue;
    await database.collection('groups').doc(group.id).set(group);
  }

  const zoneSnap = await database.collection('zones').get();
  if (zoneSnap.empty) {
    for (const z of fixtures.zones || []) {
      await zoneService.createZone({
        lat: z.lat,
        lng: z.lng,
        type: z.type,
        description: z.description,
        deviceId: z.device_id,
      });
    }
  }

  logger.info('[Review seed] Placeholder routes, zones, and groups loaded for testing');
}

module.exports = { seedReviewDataIfEnabled };
