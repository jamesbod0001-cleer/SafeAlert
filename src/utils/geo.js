// src/utils/geo.js
// Pure implementation — no external dependencies

function toRad(deg) { return (deg * Math.PI) / 180; }

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zonesNearPoint(zones, lat, lng, radiusKm) {
  return zones.filter(z => distanceKm(lat, lng, z.lat, z.lng) <= radiusKm);
}

const NIGERIAN_STATES = require('../config/nigeriaStates.json');

function guessState(lat, lng) {
  const match = NIGERIAN_STATES.find(s => lat>=s.minLat && lat<=s.maxLat && lng>=s.minLng && lng<=s.maxLng);
  return match ? match.name : 'Nigeria';
}

function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(toRad(lat)));
  return { minLat:lat-latDelta, maxLat:lat+latDelta, minLng:lng-lngDelta, maxLng:lng+lngDelta };
}

module.exports = { distanceKm, zonesNearPoint, guessState, boundingBox };
