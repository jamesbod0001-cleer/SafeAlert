#!/usr/bin/env bash
# Self-host Leaflet for offline / low-data (run after clone or before deploy)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${ROOT}/public/vendor/leaflet"
mkdir -p "$DIR"
BASE="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4"
for f in leaflet.min.js leaflet.min.css; do
  curl -fsSL "${BASE}/${f}" -o "${DIR}/${f}"
done
for f in marker-icon.png marker-icon-2x.png marker-shadow.png; do
  curl -fsSL "${BASE}/images/${f}" -o "${DIR}/${f}"
done
echo "OK: ${DIR}"
