/**
 * Google Cloud Pub/Sub transport for notify jobs (multi-worker scale-out).
 * Requires NOTIFY_PUBSUB_ENABLED=true and GCP credentials (Firebase SA works).
 */
const appConfig = require('../config/appConfig');
const logger = require('../utils/logger');

let pubsubClient = null;
let topic = null;
let subscription = null;
let initAttempted = false;

function isEnabled() {
  return appConfig.notifyPubSubEnabled && !!appConfig.notifyPubSubTopic;
}

function shouldPublishOnly() {
  return isEnabled() && appConfig.notifyQueueRole === 'publisher';
}

function shouldRunWorker() {
  return (
    isEnabled() &&
    (appConfig.notifyQueueRole === 'worker' || appConfig.notifyQueueRole === 'all')
  );
}

function shouldSkipEmbeddedPump() {
  return isEnabled() && appConfig.notifyQueueRole !== 'all';
}

async function getClient() {
  if (pubsubClient || initAttempted) return pubsubClient;
  initAttempted = true;
  if (!isEnabled()) return null;

  try {
    const { PubSub } = require('@google-cloud/pubsub');
    pubsubClient = new PubSub({
      projectId: process.env.FIREBASE_PROJECT_ID || undefined,
    });
    topic = pubsubClient.topic(appConfig.notifyPubSubTopic);
    const [exists] = await topic.exists();
    if (!exists) {
      logger.warn(
        `[NotifyPubSub] Topic ${appConfig.notifyPubSubTopic} not found — create it in GCP or disable NOTIFY_PUBSUB_ENABLED`
      );
      pubsubClient = null;
      topic = null;
      return null;
    }
    return pubsubClient;
  } catch (err) {
    logger.warn('[NotifyPubSub] Client unavailable:', err.message);
    pubsubClient = null;
    topic = null;
    return null;
  }
}

async function publishJob({ jobId, name, payload }) {
  const client = await getClient();
  if (!client || !topic) return false;

  const data = Buffer.from(
    JSON.stringify({
      jobId,
      name,
      payload: payload || {},
      published_at: new Date().toISOString(),
    })
  );

  await topic.publishMessage({
    data,
    attributes: {
      job_name: name,
      job_id: jobId || '',
    },
  });
  return true;
}

async function startWorker({ onMessage }) {
  if (!shouldRunWorker()) return null;
  const client = await getClient();
  if (!client) return null;

  const subName = appConfig.notifyPubSubSubscription;
  subscription = client.subscription(subName, {
    flowControl: {
      maxMessages: appConfig.notifyQueueConcurrency,
    },
  });

  const [exists] = await subscription.exists();
  if (!exists) {
    logger.warn(`[NotifyPubSub] Subscription ${subName} not found — worker idle`);
    return null;
  }

  subscription.on('message', async (message) => {
    try {
      const body = JSON.parse(message.data.toString('utf8'));
      await onMessage(body);
      message.ack();
    } catch (err) {
      logger.error('[NotifyPubSub] Worker message failed:', err.message);
      message.nack();
    }
  });

  subscription.on('error', (err) => {
    logger.error('[NotifyPubSub] Subscription error:', err.message);
  });

  logger.info(`[NotifyPubSub] Worker listening on ${subName}`);
  return subscription;
}

async function stopWorker() {
  if (subscription) {
    await subscription.close();
    subscription = null;
  }
}

module.exports = {
  isEnabled,
  shouldPublishOnly,
  shouldRunWorker,
  shouldSkipEmbeddedPump,
  publishJob,
  startWorker,
  stopWorker,
};
