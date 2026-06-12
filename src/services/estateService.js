/**
 * Estate / area / street safety watch — bulk neighbor alerts without government.
 */
const { randomUUID: uuidv4 } = require('crypto');
const { db } = require('../config/db');
const { distanceKm } = require('../utils/geo');
const { guessState } = require('../utils/geo');
const pushService = require('./pushService');
const appConfig = require('../config/appConfig');
const runtimeSettings = require('./runtimeSettingsService');
const logger = require('../utils/logger');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ESTATE_TYPES = ['estate', 'area', 'street', 'market'];

function randomJoinCode() {
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

async function uniqueJoinCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomJoinCode();
    const snap = await db()
      .collection('estates')
      .where('join_code', '==', code)
      .limit(1)
      .get();
    if (snap.empty) return code;
  }
  return randomJoinCode() + randomJoinCode().slice(0, 2);
}

function normalizeType(type) {
  const t = String(type || 'estate').toLowerCase();
  return ESTATE_TYPES.includes(t) ? t : 'estate';
}

function defaultRadius(type) {
  if (type === 'street') return 1.5;
  if (type === 'estate') return 2.5;
  if (type === 'market') return 3;
  return 5;
}

async function registerEstate(userId, payload) {
  const { name, type, state, lga, lat, lng, radius_km } = payload;
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return { error: 'Valid lat and lng required — use your estate gate or chairman office', status: 400 };
  }

  const kind = normalizeType(type);
  const id = `est_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const join_code = await uniqueJoinCode();
  const radius = Math.min(15, Math.max(0.5, parseFloat(radius_km) || defaultRadius(kind)));

  const estate = {
    id,
    name: String(name || 'My area').slice(0, 100),
    type: kind,
    state: (state || guessState(latN, lngN) || '').slice(0, 60),
    lga: (lga || '').slice(0, 60),
    lat: latN,
    lng: lngN,
    radius_km: radius,
    join_code,
    admin_ids: [userId],
    member_ids: [userId],
    member_count: 1,
    watch_enabled: true,
    active: true,
    source: 'community',
    created_at: new Date().toISOString(),
  };

  await db().collection('estates').doc(id).set(estate);
  await addEstateToUser(userId, id);

  return { estate, invite_url: buildInvitePath(join_code) };
}

function buildInvitePath(code) {
  return `/app/?estate=${code}`;
}

async function addEstateToUser(userId, estateId) {
  const ref = db().collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  const ids = [...new Set([...(data.estate_ids || []), estateId])];
  await ref.update({
    estate_ids: ids,
    primary_estate_id: data.primary_estate_id || estateId,
    estate_watch_enabled: data.estate_watch_enabled !== false,
  });
}

async function removeEstateFromUser(userId, estateId) {
  const ref = db().collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  const ids = (data.estate_ids || []).filter((id) => id !== estateId);
  const patch = { estate_ids: ids };
  if (data.primary_estate_id === estateId) {
    patch.primary_estate_id = ids[0] || null;
  }
  await ref.update(patch);
}

async function findByJoinCode(code) {
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 4) return null;

  const snap = await db()
    .collection('estates')
    .where('join_code', '==', normalized)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function joinEstate(userId, { join_code, estate_id }) {
  let estate = null;
  if (join_code) {
    estate = await findByJoinCode(join_code);
  } else if (estate_id) {
    const snap = await db().collection('estates').doc(estate_id).get();
    if (snap.exists) estate = { id: snap.id, ...snap.data() };
  }

  if (!estate || !estate.active) {
    return { error: 'Estate or area not found — check the join code', status: 404 };
  }

  const members = estate.member_ids || [];
  if (members.includes(userId)) {
    return { success: true, already_member: true, estate: publicEstate(estate) };
  }

  if (members.length >= 2000) {
    return { error: 'This area watch is full — ask admin to create another block', status: 403 };
  }

  const updated = [...members, userId];
  await db()
    .collection('estates')
    .doc(estate.id)
    .update({
      member_ids: updated,
      member_count: updated.length,
    });
  await addEstateToUser(userId, estate.id);

  return {
    success: true,
    estate: publicEstate({ ...estate, member_ids: updated, member_count: updated.length }),
    message: `Joined ${estate.name} — you will get SOS alerts from neighbors in this area`,
  };
}

async function leaveEstate(userId, estateId) {
  const ref = db().collection('estates').doc(estateId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Estate not found', status: 404 };
  const estate = snap.data();
  const members = (estate.member_ids || []).filter((id) => id !== userId);
  await ref.update({ member_ids: members, member_count: members.length });
  await removeEstateFromUser(userId, estateId);
  return { success: true };
}

function publicEstate(estate) {
  return {
    id: estate.id,
    name: estate.name,
    type: estate.type,
    state: estate.state,
    lga: estate.lga,
    lat: estate.lat,
    lng: estate.lng,
    radius_km: estate.radius_km,
    join_code: estate.join_code,
    member_count: estate.member_count || (estate.member_ids || []).length,
    watch_enabled: estate.watch_enabled !== false,
    is_admin: undefined,
  };
}

async function listEstates({ state, limit = 40 } = {}) {
  const snap = await db().collection('estates').where('active', '==', true).limit(200).get();
  let estates = snap.docs.map((d) => publicEstate({ id: d.id, ...d.data() }));
  if (state) {
    estates = estates.filter(
      (e) => (e.state || '').toLowerCase() === String(state).toLowerCase()
    );
  }
  estates.sort((a, b) => (b.member_count || 0) - (a.member_count || 0));
  return estates.slice(0, limit);
}

async function listNearbyEstates(lat, lng, radiusKm = 25, limit = 20) {
  const estates = await listEstates({ limit: 100 });
  return estates
    .map((e) => ({
      ...e,
      distance_km: distanceKm(lat, lng, e.lat, e.lng),
    }))
    .filter((e) => e.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

async function getUserEstates(userId) {
  const userSnap = await db().collection('users').doc(userId).get();
  const ids = userSnap.exists ? userSnap.data().estate_ids || [] : [];
  const estates = [];
  for (const id of ids) {
    const snap = await db().collection('estates').doc(id).get();
    if (snap.exists && snap.data().active !== false) {
      const data = snap.data();
      estates.push({
        ...publicEstate({ id: snap.id, ...data }),
        is_admin: (data.admin_ids || []).includes(userId),
      });
    }
  }
  return estates;
}

async function loadMemberTokens(memberIds, excludeUserId) {
  const tokens = [];
  const userIds = [];
  const uniq = [...new Set(memberIds)].filter((id) => id && id !== excludeUserId);

  for (const uid of uniq) {
    const snap = await db().collection('users').doc(uid).get();
    if (!snap.exists) continue;
    const u = snap.data();
    if (u.notifications_enabled === false) continue;
    if (u.estate_watch_enabled === false) continue;
    if (u.fcm_token) {
      tokens.push(u.fcm_token);
      userIds.push(uid);
    }
  }

  return { tokens, userIds };
}

async function notifyEstateWatch(user, lat, lng, panicId, message) {
  if (
    !(await runtimeSettings.isProximityAlertsEnabled()) ||
    !(await runtimeSettings.isPushNotificationsEnabled())
  ) {
    return { notified: 0, userIds: [] };
  }

  const estateIds = user.estate_ids || [];
  if (!estateIds.length) return { notified: 0, userIds: [] };

  const allMembers = new Set();
  const estateNames = [];

  for (const eid of estateIds) {
    const snap = await db().collection('estates').doc(eid).get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (data.watch_enabled === false) continue;
    estateNames.push(data.name);
    for (const mid of data.member_ids || []) allMembers.add(mid);
  }

  allMembers.delete(user.id);
  const { tokens, userIds } = await loadMemberTokens([...allMembers], user.id);
  if (!tokens.length) return { notified: 0, userIds: [] };

  const area = estateNames[0] || guessState(lat, lng) || 'your area';
  const tag = panicId ? panicId.replace(/-/g, '').slice(-6).toUpperCase() : '';

  await pushService.sendPush({
    tokens,
    type: 'ESTATE_PANIC',
    body:
      message ||
      `🆘 Neighbor SOS in ${area}${tag ? ` #${tag}` : ''} — tap if you can help safely.`,
    data: {
      lat: String(lat),
      lng: String(lng),
      panic_id: panicId || '',
      short_id: tag,
      alert_type: 'estate_panic',
      action: 'open_map',
    },
  });

  logger.info(`ESTATE panic notify: ${panicId} estates:${estateIds.length} push:${tokens.length}`);
  return { notified: tokens.length, userIds };
}

module.exports = {
  ESTATE_TYPES,
  registerEstate,
  joinEstate,
  leaveEstate,
  findByJoinCode,
  listEstates,
  listNearbyEstates,
  getUserEstates,
  notifyEstateWatch,
  buildInvitePath,
  publicEstate,
};
