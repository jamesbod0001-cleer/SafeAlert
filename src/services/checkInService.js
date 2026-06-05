const { db } = require('../config/db');
const { randomUUID: uuidv4 } = require('crypto');
const pushService = require('./pushService');
const smsService = require('./smsService');
const { decryptContact } = require('../utils/crypto');
const logger = require('../utils/logger');

async function createCheckIn(user, { due_at, notify_circle = true, note }) {
  const dueAt = due_at ? new Date(due_at) : new Date(Date.now() + 2 * 60 * 60 * 1000);
  if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date()) {
    return { error: 'due_at must be a future ISO timestamp' };
  }

  const existing = await getActiveCheckIn(user.id);
  if (existing) {
    return { error: 'You already have an active check-in', check_in: existing };
  }

  const id = uuidv4();
  const doc = {
    id,
    user_id: user.id,
    due_at: dueAt.toISOString(),
    notify_circle: !!notify_circle,
    note: note || '',
    status: 'pending',
    created_at: new Date().toISOString(),
    confirmed_at: null,
  };

  await db().collection('check_ins').doc(id).set(doc);
  await db().collection('users').doc(user.id).update({ active_check_in_id: id });

  return { check_in: doc };
}

async function getActiveCheckIn(userId) {
  const snap = await db().collection('users').doc(userId).get();
  const activeId = snap.exists ? snap.data().active_check_in_id : null;
  if (!activeId) return null;

  const ci = await db().collection('check_ins').doc(activeId).get();
  if (!ci.exists) return null;
  const data = ci.data();
  if (data.status !== 'pending') return null;
  if (new Date(data.due_at) < new Date()) {
    await markMissed(data);
    return null;
  }
  return data;
}

async function confirmCheckIn(userId, checkInId) {
  const ref = db().collection('check_ins').doc(checkInId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Check-in not found', status: 404 };
  const data = snap.data();
  if (data.user_id !== userId) return { error: 'Not your check-in', status: 403 };

  const now = new Date().toISOString();
  await ref.update({ status: 'safe', confirmed_at: now });
  await db().collection('users').doc(userId).update({ active_check_in_id: null });

  return { success: true, check_in: { ...data, status: 'safe', confirmed_at: now } };
}

async function markMissed(checkIn) {
  await db().collection('check_ins').doc(checkIn.id).update({
    status: 'missed',
    missed_at: new Date().toISOString(),
  });
  await db().collection('users').doc(checkIn.user_id).update({ active_check_in_id: null });

  const userSnap = await db().collection('users').doc(checkIn.user_id).get();
  if (!userSnap.exists || !checkIn.notify_circle) return;

  const user = userSnap.data();
  const circle = user.circle || [];
  const phones = circle.map((m) => decryptContact(m.phone_encrypted)).filter(Boolean);
  const tokens = circle.map((m) => m.fcm_token).filter(Boolean);

  const msg = `${user.display_name || 'A circle member'} missed their SafeAlert check-in. Please try to reach them.`;
  if (phones.length) {
    try {
      await smsService.sendCheckInMissedSMS({ phones, message: msg });
    } catch (err) {
      logger.error('Check-in SMS failed:', err.message);
    }
  }
  if (tokens.length) {
    try {
      await pushService.sendPush({
        tokens,
        type: 'JOURNEY_STOPPED',
        body: msg,
        data: { type: 'check_in_missed', user_id: checkIn.user_id },
      });
    } catch (err) {
      logger.error('Check-in push failed:', err.message);
    }
  }
}

async function processOverdueCheckIns() {
  const now = new Date().toISOString();
  const snap = await db().collection('check_ins').where('status', '==', 'pending').get();
  let processed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.due_at <= now) {
      await markMissed(data);
      processed++;
    }
  }
  if (processed) logger.info(`[Check-in] Notified circle for ${processed} missed check-in(s)`);
  return processed;
}

module.exports = {
  createCheckIn,
  getActiveCheckIn,
  confirmCheckIn,
  processOverdueCheckIns,
};
