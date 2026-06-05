#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'icons');
const destDir = path.join(root, 'public/icons');

if (!fs.existsSync(srcDir)) {
  console.warn('[copy-pwa-icons] No icons/ folder — run npm run assets:generate first');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const f of fs.readdirSync(srcDir)) {
  if (f.endsWith('.webp')) {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
  }
}
const icon512 = path.join(root, 'assets/icon.png');
if (fs.existsSync(icon512)) {
  fs.copyFileSync(icon512, path.join(destDir, 'icon-512.png'));
}
console.log('[copy-pwa-icons] Updated public/icons/ for web manifest');
