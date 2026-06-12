/**
 * Per-state offline danger packs — state-scoped queries (low read cost).
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../config/db');
const stateBounds = require('../config/nigeriaStates.json');
const appConfig = require('../config/appConfig');
const zoneService = require('./zoneService');
const fallbackData = require('./fallbackDataService');

const PACK_DIR = path.join(__dirname, '../../data/offline-packs');

function normState(s) {
  return String(s || '')
    .trim()
    .replace(/\s+state$/i, '') || 'Unknown';
}

function findStateBounds(stateName) {
  const key = normState(stateName).toLowerCase();
  return stateBounds.find((s) => s.name.toLowerCase().includes(key) || key.includes(s.name.toLowerCase()));
}

function mapPackZone(z) {
  return {
    id: z.id,
    lat: z.lat,
    lng: z.lng,
    type: z.type,
    severity: z.severity,
    state: z.state,
    lga: z.lga,
    place: z.place,
    source: z.source,
    verified: !!z.verified,
    leader_endorsed: !!z.leader_endorsed,
    updated_at: z.updated_at,
  };
}

function fallbackZonesForState(stateName) {
  if (!fallbackData.hasFallback()) return [];
  const target = normState(stateName).toLowerCase();
  return fallbackData
    .getZones({ limit: 10000 })
    .filter((z) => normState(z.state).toLowerCase() === target)
    .map(mapPackZone);
}

async function buildPackFromFirestore(stateName) {
  const bounds = findStateBounds(stateName);
  if (!bounds) return { error: `Unknown state: ${stateName}` };

  try {
    const zones = await zoneService.getZones({
      state: normState(stateName),
      limit: 500,
    });

    let mapped = zones.map(mapPackZone);
    let source = 'firestore';

    if (mapped.length === 0) {
      const fallbackZones = fallbackZonesForState(stateName);
      if (fallbackZones.length) {
        mapped = fallbackZones;
        source = 'static_fallback';
      }
    }

    return {
      state: normState(stateName),
      version: new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      bounds,
      zone_count: mapped.length,
      zones: mapped,
      source,
      note:
        mapped.length > 0
          ? 'Download on Wi‑Fi. Warnings use cached data when offline.'
          : 'No zones yet for this state — check back after community reports or ACLED sync.',
    };
  } catch (err) {
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      const zones = fallbackZonesForState(stateName);
      return {
        state: normState(stateName),
        version: new Date().toISOString().slice(0, 10),
        generated_at: new Date().toISOString(),
        bounds,
        zone_count: zones.length,
        zones,
        source: 'static_fallback',
        note: 'From HDX cache — download on Wi‑Fi before travelling.',
      };
    }
    throw err;
  }
}

function listAvailablePacks() {
  return stateBounds.map((s) => ({
    state: s.name,
    slug: s.name.toLowerCase().replace(/\s+/g, '-'),
  }));
}

async function getPack(stateName) {
  const slug = normState(stateName).toLowerCase().replace(/\s+/g, '-');
  const filePath = path.join(PACK_DIR, `${slug}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const cached = JSON.parse(raw);
      if (cached.zones?.length) return cached;
    }
  } catch {
    /* rebuild */
  }
  const built = await buildPackFromFirestore(stateName);
  if (built.zones?.length && !built.error) {
    try {
      fs.mkdirSync(PACK_DIR, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(built));
    } catch {
      /* non-fatal */
    }
  }
  return built;
}

module.exports = { getPack, buildPackFromFirestore, listAvailablePacks, normState };
