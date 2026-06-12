#!/usr/bin/env node
/**
 * Build exact Nigeria ADM1 polygons from geoBoundaries (GRID3, CC BY 4.0).
 * Updates src/config/nigeriaStatePolygons.json and refreshes bbox in nigeriaStates.json.
 *
 * Usage: node scripts/build-nigeria-state-polygons.js [path-to-geojson]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const STATES_PATH = path.join(ROOT, 'src/config/nigeriaStates.json');
const POLYGONS_PATH = path.join(ROOT, 'src/config/nigeriaStatePolygons.json');
const DEFAULT_GEOJSON =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson';
const MAX_RING_POINTS = 96;

const NAME_MAP = {
  'Abuja Federal Capital Territory': 'FCT',
};

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'SafeAlert-NG/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function simplifyRing(ring, maxPoints) {
  if (!ring || ring.length <= maxPoints) return ring;
  const out = [];
  const step = (ring.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(ring[Math.min(ring.length - 1, Math.round(i * step))]);
  }
  return out;
}

function ringBounds(ring) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function normalizeName(shapeName) {
  return NAME_MAP[shapeName] || shapeName;
}

async function loadGeoJson(inputPath) {
  if (inputPath && fs.existsSync(inputPath)) {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  }
  const tmp = path.join(__dirname, '../data/source/geoBoundaries-NGA-ADM1_simplified.geojson');
  if (fs.existsSync(tmp)) {
    return JSON.parse(fs.readFileSync(tmp, 'utf8'));
  }
  console.log('[states] Downloading geoBoundaries NGA ADM1…');
  const raw = await download(DEFAULT_GEOJSON);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, raw);
  return JSON.parse(raw);
}

async function main() {
  const geo = await loadGeoJson(process.argv[2]);
  const states = JSON.parse(fs.readFileSync(STATES_PATH, 'utf8'));
  const byName = new Map(states.map((s) => [s.name, { ...s }]));
  const polygons = {};

  for (const feature of geo.features || []) {
    const name = normalizeName(feature.properties?.shapeName || '');
    if (!name) continue;

    const geom = feature.geometry;
    if (!geom) continue;

    let rings = [];
    if (geom.type === 'Polygon') {
      rings = geom.coordinates.map((ring) => simplifyRing(ring, MAX_RING_POINTS));
    } else if (geom.type === 'MultiPolygon') {
      rings = geom.coordinates.flatMap((poly) =>
        poly.map((ring) => simplifyRing(ring, MAX_RING_POINTS))
      );
    }

    if (!rings.length) continue;

    polygons[name] = rings;
    const bounds = ringBounds(rings[0]);
    const entry = byName.get(name);
    if (entry) {
      Object.assign(entry, bounds, { polygon_rings: rings.length });
    } else {
      console.warn(`[states] Unknown shape in GeoJSON: ${name}`);
    }
  }

  if (Object.keys(polygons).length !== 37) {
    console.warn(`[states] Expected 37 polygons, got ${Object.keys(polygons).length}`);
  }

  fs.writeFileSync(POLYGONS_PATH, JSON.stringify({ source: 'geoBoundaries-GRID3-2022', states: polygons }));
  fs.writeFileSync(STATES_PATH, JSON.stringify([...byName.values()], null, 2) + '\n');

  console.log(`[states] Wrote ${Object.keys(polygons).length} polygons → ${path.relative(ROOT, POLYGONS_PATH)}`);
  console.log(`[states] Updated bbox fields in ${path.relative(ROOT, STATES_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
