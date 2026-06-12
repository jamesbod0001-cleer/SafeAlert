#!/usr/bin/env node
/**
 * Split public/app.js into load-ordered modules under public/js/app/.
 * Regenerate: node scripts/split-app-js.js
 */
const fs = require('fs');
const path = require('path');

const APP_JS = path.join(__dirname, '../public/app.js');
const OUT_DIR = path.join(__dirname, '../public/js/app');

const SECTIONS = [
  ['01-config.js', 1, 138, 'API base, constants, session state, module globals'],
  ['02-api.js', 140, 253, 'HTTP client + cached GET'],
  ['03-stats-insights.js', 255, 548, 'Dashboard stats and insights'],
  ['04-utils.js', 550, 673, 'Geo helpers, UI utilities, zone adapters'],
  ['05-auth-core.js', 675, 735, 'ensureAuth + settings bootstrap'],
  ['06-data.js', 737, 933, 'Zone/route/group loaders + refresh'],
  ['07-routes-ui.js', 935, 1040, 'Route list, zone sheets, overlays'],
  ['08-profile-auth.js', 1041, 1441, 'Profile, OTP, circle, location ping'],
  ['09-nav.js', 1443, 1506, 'Screen navigation'],
  ['10-map.js', 1508, 1735, 'Leaflet map + zone markers'],
  ['11-gps.js', 1737, 1803, 'GPS watch + coords display'],
  ['12-panic.js', 1805, 1983, 'Panic SOS flow'],
  ['13-journey.js', 1985, 2176, 'Journey watch + route feedback'],
  ['14-report-home.js', 2178, 2262, 'Community report + home list'],
  ['15-community.js', 2264, 2547, 'Circle, groups, check-in, nearby panic'],
  ['16-ui-core.js', 2549, 2562, 'Toast + formatting'],
  ['17-bootstrap.js', 2564, 2745, 'window exports + DOMContentLoaded'],
];

function main() {
  const lines = fs.readFileSync(APP_JS, 'utf8').split('\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [file, start, end, desc] of SECTIONS) {
    const chunk = lines.slice(start - 1, end).join('\n');
    const header = `/** SafeAlert app module — ${desc} */\n/* eslint-disable */\n`;
    fs.writeFileSync(path.join(OUT_DIR, file), header + chunk + '\n');
  }

  const loader = `/**
 * SafeAlert NG — app entry (modular)
 * Logic lives in public/js/app/*.js — loaded from index.html in order.
 * To regenerate modules: node scripts/split-app-js.js
 */
console.debug('[SafeAlert] app modules loaded from js/app/');
`;
  fs.writeFileSync(APP_JS, loader);
  console.log(`Split ${lines.length} lines into ${SECTIONS.length} modules under public/js/app/`);
}

main();
