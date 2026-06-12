const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const { isMemoryDb } = require('../config/firebase');
const logger = require('../utils/logger');
const notifyQueue = require('./notifyQueue');
const notifyPubSub = require('./notifyPubSubService');

const JOBS_COLLECTION = 'notify_jobs';
const PROCESSING_STALE_MS = 5 * 60 * 1000;

const handlers = new Map();

let initialized = false;
let initPromise = null;
let activeWorkers = 0;
let pumpScheduled = false;
let pumpRunning = false;

function nowIso() {
  return new Date().toISOString();
}

function requireHandler(name) {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`No notify job handler registered for "${name}"`);
  }
  return handler;
}

function registerHandler(name, handler) {
  if (!name || typeof handler !== 'function') {
    throw new Error('registerHandler requires a handler name and function');
  }
  handlers.set(name, handler);
  notifyQueue.registerHandler(name, handler);
}

function schedulePump() {
  if (pumpScheduled || notifyPubSub.shouldSkipEmbeddedPump()) return;
  pumpScheduled = true;
  setImmediate(() => {
    pumpScheduled = false;
    void pumpQueue();
  });
}

async function claimOldestPendingJob() {
  const snap = await db()
    .collection(JOBS_COLLECTION)
    .where('status', '==', 'pending')
    .orderBy('created_at', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return null;

  const jobDoc = snap.docs[0];
  return claimJobDoc(jobDoc.id, jobDoc.data());
}

async function claimJobDoc(id, jobData) {
  const ref = db().collection(JOBS_COLLECTION).doc(id);
  const startedAt = nowIso();

  await ref.update({
    status: 'processing',
    attempts: (jobData.attempts || 0) + 1,
    processing_started_at: startedAt,
    updated_at: startedAt,
    error: null,
  });

  return { id, data: jobData };
}

async function runFirestoreJob(job) {
  const { id, data } = job;
  const ref = db().collection(JOBS_COLLECTION).doc(id);
  const handler = requireHandler(data.name);

  try {
    await handler(data.payload || {});
    await ref.update({
      status: 'done',
      done_at: nowIso(),
      updated_at: nowIso(),
      error: null,
    });
  } catch (err) {
    const message = err?.message || 'Unknown notify job error';
    await ref.update({
      status: 'failed',
      failed_at: nowIso(),
      updated_at: nowIso(),
      error: message,
    });
    logger.error(`[NotifyJobs] Job ${data.name} (${id}) failed:`, message);
  }
}

async function processJobById(jobId, fallback = {}) {
  if (isMemoryDb()) return;

  const ref = db().collection(JOBS_COLLECTION).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) {
    if (fallback.name) {
      await runFirestoreJob({
        id: jobId,
        data: { name: fallback.name, payload: fallback.payload || {} },
      });
    }
    return;
  }

  const data = snap.data();
  if (data.status === 'done' || data.status === 'failed') return;
  if (data.status === 'processing') return;

  await runFirestoreJob(await claimJobDoc(jobId, data));
}

async function pumpQueue() {
  if (pumpRunning || isMemoryDb() || notifyPubSub.shouldSkipEmbeddedPump()) return;
  pumpRunning = true;

  try {
    const maxConcurrent = Math.max(1, appConfig.notifyQueueConcurrency || 1);
    while (activeWorkers < maxConcurrent) {
      const job = await claimOldestPendingJob();
      if (!job) break;

      activeWorkers += 1;
      runFirestoreJob(job).finally(() => {
        activeWorkers -= 1;
        processNext();
      });
    }
  } catch (err) {
    logger.error('[NotifyJobs] Queue pump failed:', err.message);
  } finally {
    pumpRunning = false;
  }
}

async function enqueueJob(name, payload = {}) {
  await init();
  requireHandler(name);

  if (isMemoryDb()) {
    notifyQueue.enqueuePayload(name, payload);
    return { mode: 'memory' };
  }

  const createdAt = nowIso();
  try {
    const ref = await db().collection(JOBS_COLLECTION).add({
      name,
      payload,
      status: 'pending',
      created_at: createdAt,
      updated_at: createdAt,
      attempts: 0,
    });

    let transport = 'firestore';
    if (notifyPubSub.isEnabled()) {
      const published = await notifyPubSub.publishJob({
        jobId: ref.id,
        name,
        payload,
      });
      transport = published ? 'pubsub' : 'firestore-fallback';
    }

    processNext();
    return { id: ref.id, mode: transport };
  } catch (err) {
    logger.error(
      `[NotifyJobs] Firestore enqueue failed for ${name}; falling back to in-memory execution:`,
      err.message
    );
    notifyQueue.enqueuePayload(name, payload);
    return { mode: 'memory-fallback' };
  }
}

function processNext() {
  if (isMemoryDb()) return;
  schedulePump();
}

async function recoverPending() {
  if (isMemoryDb()) return;

  const now = Date.now();
  const staleBefore = now - PROCESSING_STALE_MS;
  const processing = await db().collection(JOBS_COLLECTION).where('status', '==', 'processing').get();

  let resetCount = 0;
  for (const doc of processing.docs) {
    const data = doc.data();
    const startedAtMs = Date.parse(data.processing_started_at || data.updated_at || data.created_at || '');
    const isStale = Number.isNaN(startedAtMs) || startedAtMs <= staleBefore;

    if (!isStale) continue;

    await db().collection(JOBS_COLLECTION).doc(doc.id).update({
      status: 'pending',
      updated_at: nowIso(),
      processing_started_at: null,
      error: null,
    });
    resetCount += 1;
  }

  if (resetCount > 0) {
    logger.info(`[NotifyJobs] Recovered ${resetCount} stale processing jobs`);
  }

  processNext();
}

async function startPubSubWorker() {
  if (!notifyPubSub.shouldRunWorker()) return;
  await notifyPubSub.startWorker({
    onMessage: async (body) => {
      await processJobById(body.jobId, {
        name: body.name,
        payload: body.payload,
      });
    },
  });
}

async function init() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { registerNotifyJobHandlers } = require('./notifyJobHandlers');
    registerNotifyJobHandlers({ registerHandler });
    initialized = true;
    await recoverPending();
    await startPubSubWorker();
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

module.exports = {
  init,
  registerHandler,
  enqueueJob,
  processNext,
  recoverPending,
  processJobById,
  startPubSubWorker,
};
