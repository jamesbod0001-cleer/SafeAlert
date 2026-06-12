#!/usr/bin/env node
/**
 * Standalone notify worker — subscribe to Pub/Sub and process Firestore jobs.
 *
 * Usage:
 *   NOTIFY_PUBSUB_ENABLED=true NOTIFY_QUEUE_ROLE=worker node scripts/notify-worker.js
 *
 * Requires: FIREBASE_* credentials, NOTIFY_PUBSUB_TOPIC, NOTIFY_PUBSUB_SUBSCRIPTION
 */
require('dotenv').config();

process.env.NOTIFY_PUBSUB_ENABLED = process.env.NOTIFY_PUBSUB_ENABLED || 'true';
process.env.NOTIFY_QUEUE_ROLE = 'worker';

const { initFirebase } = require('../src/config/firebase');
const notifyJobsService = require('../src/services/notifyJobsService');

async function main() {
  initFirebase();
  await notifyJobsService.init();
  console.log('[NotifyWorker] Running — Ctrl+C to stop');
}

main().catch((err) => {
  console.error('[NotifyWorker] Failed:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
