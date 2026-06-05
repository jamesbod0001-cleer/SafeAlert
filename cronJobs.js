// src/jobs/cronJobs.js
// Background jobs — run on schedule to keep data fresh

const cron = require('node-cron');
const { expireOldZones, recalculateSeverities } = require('../services/zoneService');
const logger = require('../utils/logger');

function startCronJobs() {
  // Recalculate zone severities every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const updated = await recalculateSeverities();
      if (updated > 0) logger.info(`Cron: recalculated ${updated} zone severities`);
    } catch (err) {
      logger.error('Cron severity error:', err.message);
    }
  });

  // Expire old zones every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const expired = await expireOldZones();
      if (expired > 0) logger.info(`Cron: expired ${expired} old zones`);
    } catch (err) {
      logger.error('Cron expiry error:', err.message);
    }
  });

  // Clean up stale locations every hour
  // (locations older than 2h with no journey/panic active)
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Cron: location cleanup tick');
      // In production: query Firestore for stale locations and delete
    } catch (err) {
      logger.error('Cron location cleanup error:', err.message);
    }
  });

  logger.info('Cron jobs started: severity (5min), expiry (30min), cleanup (1h)');
}

module.exports = { startCronJobs };
