const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

const queue = [];
let activeJobs = 0;

function enqueue(job) {
  queue.push({ ...job, enqueuedAt: Date.now() });
  drain();
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

module.exports = { enqueue, enqueueNamed };
