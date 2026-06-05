#!/usr/bin/env node
const { execSync } = require('child_process');

const port = process.env.PORT || 3000;

try {
  const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  if (pids) {
    execSync(`kill -9 ${pids.split('\n').join(' ')}`);
    console.log(`Freed port ${port}`);
  }
} catch {
  /* port already free */
}
