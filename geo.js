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

const NIGERIAN_STATES = [
  { name:'Lagos',     minLat:6.35,maxLat:6.70,minLng:2.70,maxLng:3.75 },
  { name:'Abuja FCT', minLat:8.80,maxLat:9.30,minLng:6.90,maxLng:7.80 },
  { name:'Kano',      minLat:11.8,maxLat:12.3,minLng:8.30,maxLng:9.00 },
  { name:'Kaduna',    minLat:9.90,maxLat:11.5,minLng:6.90,maxLng:8.60 },
  { name:'Borno',     minLat:10.5,maxLat:13.9,minLng:11.5,maxLng:15.0 },
  { name:'Kogi',      minLat:6.80,maxLat:8.50,minLng:5.60,maxLng:7.80 },
  { name:'Oyo',       minLat:7.00,maxLat:8.80,minLng:2.70,maxLng:4.60 },
  { name:'Rivers',    minLat:4.40,maxLat:5.20,minLng:6.50,maxLng:7.50 },
  { name:'Taraba',    minLat:6.50,maxLat:9.00,minLng:9.50,maxLng:12.5 },
  { name:'Yobe',      minLat:10.8,maxLat:13.0,minLng:10.0,maxLng:13.0 },
];

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
