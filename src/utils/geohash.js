const { distanceKm } = require('./geo');

let ngeohash;
try {
  ngeohash = require('ngeohash');
} catch {
  ngeohash = null;
}

const PRECISION = 6;

function encodeGeohash(lat, lng) {
  if (ngeohash) {
    const hash = ngeohash.encode(lat, lng, PRECISION);
    return { geohash: hash, geohash_prefix: hash.slice(0, 4) };
  }
  const latR = Math.round(lat * 100) / 100;
  const lngR = Math.round(lng * 100) / 100;
  const hash = `${latR}:${lngR}`;
  return { geohash: hash, geohash_prefix: hash.slice(0, 6) };
}

function getNeighborPrefixes(lat, lng) {
  if (ngeohash) {
    const center = ngeohash.encode(lat, lng, 4);
    const neighbors = ngeohash.neighbors(center);
    return [...new Set([center, ...Object.values(neighbors)])];
  }
  const { geohash_prefix: center } = encodeGeohash(lat, lng);
  return [center];
}

module.exports = { encodeGeohash, getNeighborPrefixes, PRECISION, distanceKm };
