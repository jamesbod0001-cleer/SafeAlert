const { db } = require('../config/db');
const { distanceKm } = require('../utils/geo');
const { isMemoryDb } = require('../config/firebase');
const { getNearbyUsers } = require('./geoService');

const SKILL_OPTIONS = [
  'first_aid',
  'escort',
  'mechanic',
  'driver',
  'security',
  'translator',
];

async function updateResponderProfile(userId, { skills, available }) {
  const patch = { responder_updated_at: new Date().toISOString() };
  if (skills !== undefined) {
    patch.responder_skills = skills.filter((s) => SKILL_OPTIONS.includes(s));
  }
  if (available !== undefined) {
    patch.responder_available = !!available;
  }
  await db().collection('users').doc(userId).update(patch);
  const snap = await db().collection('users').doc(userId).get();
  return getResponderProfile({ id: userId, ...snap.data() });
}

function getResponderProfile(user) {
  return {
    skills: user.responder_skills || [],
    available: !!user.responder_available,
    help_nearby_enabled: !!user.help_nearby_enabled,
  };
}

async function getNearbyResponders(lat, lng, radiusKm, { excludeUserId } = {}) {
  const nearby = await getNearbyUsers(lat, lng, radiusKm, { excludeUserId, requireFcm: false });
  const responders = [];

  for (const user of nearby) {
    if (!user.help_nearby_enabled || !user.responder_available) continue;
    if (!user.responder_skills?.length && !isMemoryDb()) continue;

    responders.push({
      user_id: user.id,
      display_name: user.display_name || 'Helper',
      skills: user.responder_skills || [],
      distance_km: Math.round((user.distance_km || 0) * 10) / 10,
      lat: user.lat != null ? Math.round(user.lat * 1000) / 1000 : null,
      lng: user.lng != null ? Math.round(user.lng * 1000) / 1000 : null,
    });
  }

  return responders.sort((a, b) => a.distance_km - b.distance_km).slice(0, 25);
}

module.exports = {
  SKILL_OPTIONS,
  updateResponderProfile,
  getResponderProfile,
  getNearbyResponders,
};
