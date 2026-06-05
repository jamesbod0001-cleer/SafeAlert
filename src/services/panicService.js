const { randomUUID: uuidv4 } = require('crypto');
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const { guessState } = require('../utils/geo');
const { getNearbyUsers } = require('./geoService');
const pushService = require('./pushService');
const smsService = require('./smsService');
const { decryptContact } = require('../utils/crypto');
const logger = require('../utils/logger');

function fuzzCoord(n) {
  return Math.round(n * 100) / 100;
}

function shortPanicId(id) {
  return (id || '').replace(/-/g, '').slice(-6).toUpperCase();
}

function publicPanicEvent(doc, extras = {}) {
  return {
    id: doc.id,
    short_id: shortPanicId(doc.id),
    lat: fuzzCoord(doc.lat),
    lng: fuzzCoord(doc.lng),
    state: doc.state || guessState(doc.lat, doc.lng),
    active: !!doc.active,
    started_at: doc.started_at,
    responder_count: (doc.responder_ids || []).length,
    already_responding: !!extras.already_responding,
    distance_km:
      extras.distance_km != null ? Math.round(extras.distance_km * 10) / 10 : undefined,
    victim_label: extras.victim_label || 'Someone nearby',
    alert_type: 'panic',
  };
}

async function victimLabel(userId) {
  const snap = await db().collection('users').doc(userId).get();
  if (!snap.exists) return 'Someone nearby';
  const name = (snap.data().display_name || '').trim();
  if (name && !name.startsWith('User_')) {
    const first = name.split(/\s+/)[0];
    return `${first} needs help`;
  }
  return `Neighbor #${userId.slice(-4).toUpperCase()}`;
}

async function getActivePanicForUser(userId) {
  const snap = await db()
    .collection('panic_events')
    .where('user_id', '==', userId)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function assertPanicCooldown(user) {
  if (!user.last_panic_at) return null;
  const elapsed = Date.now() - new Date(user.last_panic_at).getTime();
  if (elapsed < appConfig.panicCooldownSec * 1000) {
    const retryAfterSec = Math.ceil((appConfig.panicCooldownSec * 1000 - elapsed) / 1000);
    return { error: 'Panic cooldown active', retryAfterSec, status: 429 };
  }
  return null;
}

async function createPanicEvent(user, lat, lng) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const event = {
    id,
    user_id: user.id,
    lat,
    lng,
    state: guessState(lat, lng),
    active: true,
    started_at: now,
    responder_ids: [],
    notified_user_ids: [],
    circle_notified: 0,
    nearby_notified: 0,
  };

  await db().collection('panic_events').doc(id).set(event);
  return event;
}

async function deactivatePanicEvent(userId) {
  const active = await getActivePanicForUser(userId);
  if (!active) return null;

  await db().collection('panic_events').doc(active.id).update({
    active: false,
    ended_at: new Date().toISOString(),
  });

  return active.id;
}

async function getCirclePhonesAndTokens(user) {
  const circle = user.circle || [];
  const circlePhones = [];
  const circleFCMTokens = [];

  for (const m of circle) {
    const phone = m.phone_encrypted ? decryptContact(m.phone_encrypted) : null;
    let token = null;
    const snap = await db().collection('users').where('phone_hash', '==', m.phone_hash).get();
    if (!snap.empty) token = snap.docs[0].data().fcm_token;

    if (token) circleFCMTokens.push(token);

    if (!phone) continue;
    if (appConfig.panicSmsFallbackOnly) {
      if (!token) circlePhones.push(phone);
    } else if (appConfig.panicSmsEnabled) {
      circlePhones.push(phone);
    }
  }

  return { circlePhones, circleFCMTokens };
}

async function notifyCircleAsync(user, lat, lng, circlePhones, circleFCMTokens, panicId) {
  if (appConfig.panicSmsEnabled && circlePhones.length > 0) {
    await smsService.sendPanicSMS({
      memberPhones: circlePhones,
      reporterName: user.display_name,
      lat,
      lng,
      timestamp: new Date().toISOString(),
    });
  }

  if (appConfig.pushNotificationsEnabled && circleFCMTokens.length > 0) {
    await pushService.notifyCirclePanic({
      circle: circleFCMTokens.map((t) => ({ fcm_token: t })),
      reporterName: user.display_name,
      lat,
      lng,
      panic_id: panicId || user.active_panic_id,
      short_id: shortPanicId(panicId || user.active_panic_id),
    });
  }

  return { sms: circlePhones.length, push: circleFCMTokens.length };
}

async function notifyNearbyAsync(lat, lng, excludeUserId, panicId, message) {
  if (!appConfig.proximityAlertsEnabled) return { notified: 0 };

  const nearbyUsers = await getNearbyUsers(lat, lng, appConfig.panicBroadcastRadiusKm, {
    excludeUserId,
    requireFcm: true,
  });

  const tokens = nearbyUsers.map((u) => u.fcm_token).filter(Boolean);
  if (!tokens.length || !appConfig.pushNotificationsEnabled) {
    return { notified: 0, userIds: [] };
  }

  const tag = shortPanicId(panicId);
  const area = guessState(lat, lng);
  await pushService.sendPush({
    tokens,
    type: 'NEARBY_PANIC',
    body:
      message ||
      `🆘 Panic #${tag} near ${area} — tap to view and offer help.`,
    data: {
      lat: String(lat),
      lng: String(lng),
      panic_id: panicId,
      short_id: tag,
      alert_type: 'nearby_panic',
      action: 'open_map',
    },
  });

  return { notified: tokens.length, userIds: nearbyUsers.map((u) => u.id) };
}

async function listNearbyActivePanics(lat, lng, radiusKm, viewerUserId) {
  const snap = await db()
    .collection('panic_events')
    .where('active', '==', true)
    .orderBy('started_at', 'desc')
    .limit(30)
    .get();
  const { distanceKm: distKm } = require('../utils/geo');
  const events = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.user_id === viewerUserId) continue;
    if ((data.dismissed_by || []).includes(viewerUserId)) continue;
    const d = distKm(lat, lng, data.lat, data.lng);
    if (d > radiusKm) continue;
    const label = await victimLabel(data.user_id);
    events.push(
      publicPanicEvent(
        { id: doc.id, ...data },
        {
          distance_km: d,
          victim_label: label,
          already_responding: (data.responder_ids || []).includes(viewerUserId),
        }
      )
    );
  }

  return events.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}

async function getPanicById(panicId, requesterId) {
  const snap = await db().collection('panic_events').doc(panicId).get();
  if (!snap.exists) return null;
  const data = snap.data();

  const publicView = publicPanicEvent({ id: snap.id, ...data });
  if (data.user_id === requesterId) {
    publicView.lat = data.lat;
    publicView.lng = data.lng;
  }
  return publicView;
}

async function addResponder(panicId, responderId) {
  const ref = db().collection('panic_events').doc(panicId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Panic event not found', status: 404 };
  const data = snap.data();
  if (!data.active) return { error: 'Panic is no longer active', status: 410 };

  const responders = [...new Set([...(data.responder_ids || []), responderId])];
  await ref.update({ responder_ids: responders });

  const isNew = !(data.responder_ids || []).includes(responderId);
  return {
    success: true,
    responder_count: responders.length,
    victim_id: data.user_id,
    is_new_response: isNew,
    short_id: shortPanicId(panicId),
  };
}

async function listRespondersForPanic(panicId, requesterId) {
  const snap = await db().collection('panic_events').doc(panicId).get();
  if (!snap.exists) return { error: 'Panic event not found', status: 404 };
  const data = snap.data();
  const ids = data.responder_ids || [];
  const responders = [];
  for (const uid of ids) {
    const uSnap = await db().collection('users').doc(uid).get();
    if (!uSnap.exists) continue;
    const u = uSnap.data();
    const name =
      (u.display_name && !u.display_name.startsWith('User_')
        ? u.display_name.split(/\s+/)[0]
        : null) || `Helper #${uid.slice(-4).toUpperCase()}`;
    responders.push({
      id: uid,
      display_name: name,
      skills: u.responder_skills || [],
      is_you: uid === requesterId,
    });
  }
  return {
    panic_id: panicId,
    short_id: shortPanicId(panicId),
    responder_count: responders.length,
    responders,
    victim_id: data.user_id,
    is_victim: data.user_id === requesterId,
  };
}

async function dismissPanicHelper(panicId, userId, reason) {
  const ref = db().collection('panic_events').doc(panicId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Panic event not found', status: 404 };
  const data = snap.data();
  const dismissed = [...new Set([...(data.dismissed_by || []), userId])];
  await ref.update({
    dismissed_by: dismissed,
    dismiss_notes: [...(data.dismiss_notes || []), { user_id: userId, reason: reason || '', at: new Date().toISOString() }].slice(-20),
  });
  return { success: true };
}

async function notifyEstateWatchAsync(user, lat, lng, panicId, message) {
  return require('./estateService').notifyEstateWatch(user, lat, lng, panicId, message);
}

async function notifyVictimResponderOnWay(victimId, responderUser, panicId, shortId, responderCount) {
  const victimSnap = await db().collection('users').doc(victimId).get();
  if (!victimSnap.exists) return { sent: 0 };
  const victim = victimSnap.data();
  if (!victim.fcm_token || victim.notifications_enabled === false) return { sent: 0 };

  const responderName =
    (responderUser.display_name && !responderUser.display_name.startsWith('User_')
      ? responderUser.display_name.split(/\s+/)[0]
      : null) || 'A nearby helper';

  const result = await pushService.notifyPanicResponder({
    victimToken: victim.fcm_token,
    responderName,
    panicId,
    shortId,
    responderCount,
  });
  logger.info(`PANIC respond push: victim=${victimId} responder=${responderUser.id} sent=${result.sent || 0}`);
  return result;
}

module.exports = {
  fuzzCoord,
  shortPanicId,
  publicPanicEvent,
  getActivePanicForUser,
  assertPanicCooldown,
  createPanicEvent,
  deactivatePanicEvent,
  getCirclePhonesAndTokens,
  notifyCircleAsync,
  notifyNearbyAsync,
  notifyEstateWatchAsync,
  listNearbyActivePanics,
  getPanicById,
  addResponder,
  notifyVictimResponderOnWay,
  listRespondersForPanic,
  dismissPanicHelper,
};
