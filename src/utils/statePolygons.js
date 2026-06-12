/**
 * Point-in-polygon for Nigeria ADM1 boundaries (geoBoundaries / GRID3).
 */
const states = require('../config/nigeriaStates.json');
let polygons = null;

function loadPolygons() {
  if (polygons) return polygons;
  try {
    const data = require('../config/nigeriaStatePolygons.json');
    polygons = data.states || {};
  } catch {
    polygons = {};
  }
  return polygons;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInState(lng, lat, stateName) {
  const rings = loadPolygons()[stateName];
  if (!rings?.length) return false;
  return rings.some((ring) => pointInRing(lng, lat, ring));
}

function bboxCandidates(lat, lng) {
  return states.filter(
    (s) => lat >= s.minLat && lat <= s.maxLat && lng >= s.minLng && lng <= s.maxLng
  );
}

function resolveState(lat, lng) {
  const polyMap = loadPolygons();
  const candidates = bboxCandidates(lat, lng);

  if (!candidates.length) return 'Nigeria';

  const withPoly = candidates.filter((s) => polyMap[s.name]?.length);
  if (withPoly.length) {
    for (const s of withPoly) {
      if (pointInState(lng, lat, s.name)) return s.name;
    }
  }

  if (candidates.length === 1) return candidates[0].name;

  let best = candidates[0];
  let bestArea = Infinity;
  for (const s of candidates) {
    const area = (s.maxLat - s.minLat) * (s.maxLng - s.minLng);
    if (area < bestArea) {
      bestArea = area;
      best = s;
    }
  }
  return best.name;
}

module.exports = {
  loadPolygons,
  pointInState,
  resolveState,
  bboxCandidates,
};
