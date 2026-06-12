const { db } = require('../config/db');
const { randomUUID: uuidv4 } = require('crypto');

async function circleUserIdsForOrganizer(organizer) {
  const hashes = new Set(
    (organizer.circle || []).map((m) => m.phone_hash).filter(Boolean)
  );
  if (!hashes.size) return [];

  const snap = await db().collection('users').get();
  return snap.docs
    .filter((doc) => hashes.has(doc.data().phone_hash))
    .map((doc) => doc.id);
}

async function createConvoy(organizer, { member_ids = [], title }) {
  const allowed = new Set([organizer.id, ...(await circleUserIdsForOrganizer(organizer))]);
  const requested = member_ids.filter(Boolean);
  const unauthorized = requested.filter((id) => !allowed.has(id));
  if (unauthorized.length) {
    return {
      error: 'Convoy members must be in your safety circle',
      status: 403,
    };
  }

  const ids = [...new Set([organizer.id, ...requested])].slice(0, 10);
  const id = uuidv4();
  const now = new Date().toISOString();
  const session = {
    id,
    organizer_id: organizer.id,
    member_ids: ids,
    title: title || 'Group journey',
    started_at: now,
    ended_at: null,
    active: true,
    shared_map: true,
  };

  await db().collection('journey_sessions').doc(id).set(session);

  for (const memberId of ids) {
    await db().collection('users').doc(memberId).update({
      journey_active: true,
      journey_started_at: now,
      active_convoy_id: id,
    });
  }

  return { convoy: session };
}

async function getConvoy(convoyId, requesterId) {
  const snap = await db().collection('journey_sessions').doc(convoyId).get();
  if (!snap.exists) return null;
  const convoy = snap.data();
  if (!convoy.member_ids.includes(requesterId)) return { error: 'Not a convoy member', status: 403 };

  const members = [];
  for (const mid of convoy.member_ids) {
    const u = await db().collection('users').doc(mid).get();
    const loc = await db().collection('locations').doc(mid).get();
    members.push({
      user_id: mid,
      display_name: u.exists ? u.data().display_name : 'Member',
      journey_active: u.exists ? !!u.data().journey_active : false,
      location: loc.exists ? { lat: loc.data().lat, lng: loc.data().lng, updated_at: loc.data().updated_at } : null,
    });
  }

  return { convoy, members };
}

async function endConvoy(convoyId, organizerId) {
  const snap = await db().collection('journey_sessions').doc(convoyId).get();
  if (!snap.exists) return { error: 'Convoy not found', status: 404 };
  const convoy = snap.data();
  if (convoy.organizer_id !== organizerId) return { error: 'Only organizer can end convoy', status: 403 };

  const now = new Date().toISOString();
  await db().collection('journey_sessions').doc(convoyId).update({ active: false, ended_at: now });

  for (const mid of convoy.member_ids) {
    await db().collection('users').doc(mid).update({
      journey_active: false,
      journey_started_at: null,
      active_convoy_id: null,
    });
    await db().collection('locations').doc(mid).delete();
  }

  return { success: true };
}

module.exports = { createConvoy, getConvoy, endConvoy };
