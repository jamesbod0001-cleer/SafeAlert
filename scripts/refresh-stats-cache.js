#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { initFirebase } = require('../src/config/firebase');
const statsCacheService = require('../src/services/statsCacheService');

async function main() {
  initFirebase();
  console.log('Refreshing stats cache (paginated zone scan)...');
  const stats = await statsCacheService.refreshStatsCache();
  console.log(JSON.stringify({ total_active_zones: stats.total_active_zones, critical: stats.critical_zones }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
