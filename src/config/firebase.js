const { memDb } = require('./memoryDb');

let db = null;
let messaging = null;
let initialized = false;

function initFirebase() {
  if (initialized) return;

  const useMemory =
    process.env.USE_MEMORY_DB === 'true' || !process.env.FIREBASE_PROJECT_ID;

  if (useMemory) {
    console.log('[Firebase] Using in-memory database');
    db = memDb;
    messaging = null;
    initialized = true;
    return;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    const { getFirestore } = require('firebase-admin/firestore');
    const databaseId = process.env.FIRESTORE_DATABASE_ID || 'safealert';
    db = getFirestore(databaseId);
    messaging = admin.messaging();
    console.log(`[Firebase] Firestore (${databaseId}) + FCM initialized`);
  } catch (err) {
    console.error('[Firebase] Init failed, falling back to memory:', err.message);
    db = memDb;
    messaging = null;
  }

  initialized = true;
}

function getDb() {
  if (!initialized) initFirebase();
  return db;
}

function getMessaging() {
  if (!initialized) initFirebase();
  return messaging;
}

function isMemoryDb() {
  if (!initialized) initFirebase();
  return db === memDb;
}

module.exports = { initFirebase, getDb, getMessaging, isMemoryDb };
