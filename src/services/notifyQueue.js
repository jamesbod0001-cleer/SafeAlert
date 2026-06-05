const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

const queue = [];
let activeJobs = 0;
const handlers = new Map();

function enqueue(job) {
  queue.push({ ...job, enqueuedAt: Date.now() });
  drain();
}

function registerHandler(name, handler) {
  if (!name || typeof handler !== 'function') {
    throw new Error('notifyQueue.registerHandler requires name and handler');
  }
  handlers.set(name, handler);
}

function enqueuePayload(name, payload) {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`No notify queue handler registered for "${name}"`);
  }
  enqueue({ name, payload, run: () => handler(payload) });
}

async function runJob(job) {
  try {
    await job.run();
  } catch (err) {
    logger.error(`[NotifyQueue] Job ${job.name} failed:`, err.message);
  }
}

function drain() {
  const maxConcurrent = appConfig.notifyQueueConcurrency;

  while (activeJobs < maxConcurrent && queue.length > 0) {
    const job = queue.shift();
    activeJobs += 1;
    runJob(job).finally(() => {
      activeJobs -= 1;
      drain();
    });
  }
}

function enqueueNamed(name, run) {
  enqueue({ name, run });
}

module.exports = { enqueue, enqueueNamed, enqueuePayload, registerHandler };
