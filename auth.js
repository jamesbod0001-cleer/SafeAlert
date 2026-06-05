const crypto = require('crypto');
const { getDb } = require('../config/firebase');

/**
 * Lightweight auth middleware using signed device tokens.
 * No passwords — phone OTP verified via Africa's Talking,
 * then we issue a signed hex token stored in Firestore.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.length < 32) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const db = getDb();
    const tokenDoc = await db.collection('auth_tokens').doc(token).get();

    if (!tokenDoc.exists) {
      return res.status(401).json({ error: 'Token not found or expired' });
    }

    const tokenData = tokenDoc.data();
    const now = Date.now();

    // Token expires after 7 days
    if (now > tokenData.expires_at) {
      await tokenDoc.ref.delete();
      return res.status(401).json({ error: 'Token expired — please re-authenticate' });
    }

    // Attach user info to request
    req.userId = tokenData.user_id;
    req.deviceHash = tokenData.device_hash;

    // Slide expiry on activity (refresh window)
    await tokenDoc.ref.update({ last_used: now });

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Optional auth — attach user if token present, continue anyway.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.split(' ')[1];
    const db = getDb();
    const tokenDoc = await db.collection('auth_tokens').doc(token).get();
    if (tokenDoc.exists && Date.now() <= tokenDoc.data().expires_at) {
      req.userId = tokenDoc.data().user_id;
      req.deviceHash = tokenDoc.data().device_hash;
    }
  } catch (_) { /* silent */ }
  next();
}

module.exports = { requireAuth, optionalAuth };
