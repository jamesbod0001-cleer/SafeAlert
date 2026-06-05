# SafeAlert — importing current & historical data

SafeAlert stores community safety data in **Firestore** (`zones`, `routes`, `resources`, `groups`). You can load starter data or external datasets with the import CLI.

## Quick start (curated Nigeria data)

```bash
# From project root — requires .env with FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
npm run import:starter

# Preview without writing
npm run import:starter:dry
```

This loads `data/nigeria-starter.json`:

- **12 route safety scores** (Lagos–Abuja, Abuja–Kaduna, etc.)
- **18 incident zones** (critical/high hotspots)
- **3 community groups**
- Optionally **`data/resources.json`** NGO contacts with `--resources`

Re-runs **skip** existing documents unless you pass `--force`.

---

## Import CLI

```bash
node scripts/import-data.js [options]
```

| Option | Description |
|--------|-------------|
| `--starter` | `data/nigeria-starter.json` |
| `--file=path.json` | Custom bundle `{ zones, routes, resources, groups }` |
| `--zones=zones.json` | JSON array of zones only |
| `--routes=routes.json` | JSON array of routes only |
| `--acled=file.csv` | ACLED export (see below) |
| `--resources` | Seed `data/resources.json` if empty |
| `--historical` | Import zones as **inactive** (archive) |
| `--dry-run` | Count only, no Firestore writes |
| `--force` | Overwrite existing IDs |
| `--limit=500` | Max ACLED rows (default 500) |

---

## Sourcing real-world data

### 1. ACLED (Armed Conflict Location & Event Data) — recommended for history

1. Register at [https://acleddata.com](https://acleddata.com)
2. Download **Nigeria** events as CSV
3. Import:

```bash
node scripts/import-data.js --acled=~/Downloads/ACLED_Nigeria.csv --limit=1000
```

- Rows outside Nigeria bounding box are dropped
- Event types map to SafeAlert types (`kidnapping`, `banditry`, `protest`, etc.)
- `external_id` prevents duplicate imports on re-run

**Historical archive** (map reference only, not live alerts):

```bash
node scripts/import-data.js --acled=ACLED_Nigeria.csv --historical --limit=2000
```

### 2. HDX / humanitarian datasets

Search [https://data.humdata.org](https://data.humdata.org) for Nigeria security, displacement, or violence datasets. Convert to JSON matching the zone schema (see `data/nigeria-starter.json`) and:

```bash
node scripts/import-data.js --zones=data/my-hdx-zones.json
```

### 3. Your own CSV

Convert to JSON with fields:

```json
{
  "lat": 10.52,
  "lng": 7.44,
  "type": "kidnapping",
  "description": "Highway incident",
  "state": "Kaduna",
  "votes_danger": 3,
  "reports": 3,
  "severity": "high",
  "source": "partner_ngo_2026"
}
```

### 4. Routes

```bash
ROUTES_JSON='[{"from":"Lagos","to":"Abuja","safety_score":55}]' npm run seed:routes
```

Or include routes in any `--file` bundle.

---

## JSON zone fields

| Field | Required | Notes |
|-------|----------|-------|
| `lat`, `lng` | Yes | Nigeria bounds (~4–14°N, 2.7–15°E) |
| `type` | Yes | `kidnapping`, `armed_robbery`, `banditry`, `roadblock`, `protest`, `terror`, `flood`, etc. |
| `description` | No | Shown in app |
| `votes_danger` / `reports` | No | Affects severity |
| `severity` | No | `critical`, `high`, `medium`, `low` |
| `verified` | No | `true` if ≥3 confirmations |
| `active` | No | Default `true`; use `false` for history |
| `source` | No | e.g. `acled`, `safealert_starter` |
| `external_id` | No | Dedup key for ACLED |
| `id` | No | Auto-generated if omitted |

---

## Production import

1. Use a machine with Firebase service account or production `.env`
2. Run dry-run first: `npm run import:starter:dry`
3. Import: `npm run import:starter`
4. Verify: `GET /v1/zones`, `GET /v1/routes`, `GET /v1/stats`

**Note:** Production App Runner does **not** auto-seed review fixtures (`SEED_REVIEW_DATA` is dev-only). Use this CLI for production data loads.

---

## Daily automatic import (no ACLED required)

The API server runs a **daily job** (default every 24 hours) that reloads `data/nigeria-starter.json`:

- **Zones / groups:** skipped if already present (no duplicates)
- **Routes:** safety scores and `last_updated` refreshed each run
- **Resources:** seeded once if the collection is empty

Enable in `.env` (on by default):

```env
DAILY_IMPORT_ENABLED=true
DAILY_IMPORT_INTERVAL_MS=86400000
DAILY_IMPORT_INITIAL_DELAY_MS=180000
IMPORT_JOB_SECRET=your-long-random-secret
```

Manual trigger (after deploy):

```bash
curl -X POST https://YOUR_APP/v1/admin/import/run \
  -H "x-import-secret: YOUR_SECRET"
```

Status:

```bash
curl https://YOUR_APP/v1/admin/import/status -H "x-import-secret: YOUR_SECRET"
```

When you later obtain an ACLED CSV, run a one-off import; the daily job will continue maintaining starter routes/zones.

---

## Legal & accuracy

- ACLED and HDX data have their own **licence terms** — comply when republishing
- Imported historical events are **not verified by SafeAlert** unless community votes confirm them
- Mark archival data with `--historical` or `active: false` so users are not misled by old incidents
