#!/usr/bin/env node
/**
 * Ensures the default Firestore database exists, then seeds starter data if empty.
 * Run: node scripts/ensure-firestore-db.js
 * Requires: credentials/serviceAccountKey.json or FIREBASE_* env vars
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'safealert-ng-3abbb';

const KEY_FILE = path.join(__dirname, '../credentials/serviceAccountKey.json');
const LOCATION = process.env.FIRESTORE_LOCATION || 'nam5';

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: fs.existsSync(KEY_FILE) ? KEY_FILE : undefined,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    projectId: PROJECT_ID,
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Google access token');
  return token.token;
}

async function listDatabases(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error?.message || `list databases HTTP ${res.status}`);
  }
  return body.databases || [];
}

async function createDatabase(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases?databaseId=(default)`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locationId: LOCATION,
      type: 'FIRESTORE_NATIVE',
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body.error?.message || JSON.stringify(body);
    if (msg.includes('already exists')) return { existed: true };
    throw new Error(msg);
  }
  return { created: true, name: body.name };
}

async function waitForDatabaseReady(maxWaitMs = 120000) {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const keyPath = KEY_FILE;
    if (fs.existsSync(keyPath)) {
      admin.initializeApp({ credential: admin.credential.cert(keyPath) });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  const { getFirestore } = require('firebase-admin/firestore');
  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'safealert';
  const firestore = getFirestore(databaseId);
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await firestore.collection('_health').doc('ping').set(
        { ok: true, at: new Date().toISOString() },
        { merge: true }
      );
      return true;
    } catch (err) {
      if (err.code !== 5 && !String(err.message).includes('NOT_FOUND')) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('Firestore not ready after waiting');
}

async function seedIfEmpty() {
  process.env.SEED_REVIEW_DATA = 'true';
  process.env.NODE_ENV = 'development';
  const { initFirebase } = require('../src/config/firebase');
  const { seedReviewDataIfEnabled } = require('../src/config/seedReviewData');
  const resourceService = require('../src/services/resourceService');

  initFirebase();
  await seedReviewDataIfEnabled();
  try {
    await resourceService.seedResourcesIfEmpty();
  } catch (err) {
    console.warn('[Seed] resources:', err.message);
  }
}

async function main() {
  console.log(`Project: ${PROJECT_ID}`);
  const token = await getAccessToken();
  const databases = await listDatabases(token);
  console.log(`Existing databases: ${databases.length}`);

  if (!databases.length) {
    console.log(`Creating default Firestore database (location: ${LOCATION})...`);
    const result = await createDatabase(token);
    console.log(result.created ? 'Create requested — waiting for provisioning...' : 'Database already exists');
  } else {
    console.log('Default database present:', databases.map((d) => d.name).join(', '));
  }

  console.log('Waiting for Firestore to accept writes...');
  await waitForDatabaseReady();
  console.log('Firestore is writable.');

  await seedIfEmpty();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('ensure-firestore-db failed:', err.message);
  process.exit(1);
});
