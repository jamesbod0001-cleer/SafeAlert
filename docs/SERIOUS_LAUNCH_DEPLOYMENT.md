# Serious Launch — Deployment, Budget & Build Guide

**SafeAlert NG · Thousands of users · Proximity alerts ON**  
**Last updated:** May 2026  

This document combines:

1. **What it costs** to run a serious launch in Nigeria  
2. **What to deploy** (stack, env, providers)  
3. **What to build** (Phases 1–2: production Firebase, geohash, opt-in preferences) — step-by-step in this repo  

Related: [PROXIMITY_ALERTS_IMPLEMENTATION.md](./PROXIMITY_ALERTS_IMPLEMENTATION.md) (full national scale + citizen features §12).

---

## Implementation status (code in repo)

| Area | Status | Key files |
|------|--------|-----------|
| **Phase 1 — Opt-in preferences** | ✅ | `GET/PUT /user/preferences`, profile UI |
| **Phase 2 — Geohash + location** | ✅ | `locationService.js`, `geoService.js`, `geohash.js` |
| **Phase 3 — Async panic notify** | ✅ | `notifyQueue.js`, panic activate returns **202** |
| **Phase 4 — FCM web** | ✅ | `public/js/fcm.js`, `fcm-init.js`, `GET /config/public` |
| **Phase 5 — Responders** | ✅ | `GET /panic/nearby`, `GET /panic/:id`, `POST /panic/:id/respond` |
| **Citizen C1 (check-in, resources)** | ✅ | `POST /check-in`, `GET /resources`, NGO seed in `data/resources.json` |
| **Citizen C2 (groups, false reports)** | ✅ | `POST /groups`, `GET /groups/:id/alerts`, `POST /zones/:id/report-false` |
| **Convoy + responders** | ✅ | `POST /journey/convoy`, `PUT /user/responder-profile`, `GET /responders/nearby` |
| **Maintenance jobs** | ✅ | Location TTL cleanup, zone expiry, overdue check-ins |
| **Production hardening** | ✅ | `envValidate.js`, `helmet`, `rateLimiter.js`, `Dockerfile`, `firestore.rules` |
| **OTP persistence** | ✅ | `otpStore.js` → Firestore `otps` |
| **Panic events** | ✅ | `panicService.js` → `panic_events` collection |

**Full API reference:** [PRODUCTION.md](./PRODUCTION.md)  
**iOS & Android apps:** [MOBILE_IOS_ANDROID.md](./MOBILE_IOS_ANDROID.md)

**Validate before deploy:**

```bash
NODE_ENV=production npm run validate-env
```

**Local dev:** `USE_MEMORY_DB=true` in `.env`  
**Production:** `USE_MEMORY_DB=false` + Firebase credentials + `firebase deploy --only firestore:rules,firestore:indexes`

---

## Table of contents

1. [Launch profile & assumptions](#1-launch-profile--assumptions)
2. [Monthly budget](#2-monthly-budget)
3. [One-time & runway costs](#3-one-time--runway-costs)
4. [Production stack](#4-production-stack)
5. [Pre-launch gaps in this repo](#5-pre-launch-gaps-in-this-repo)
6. [Deployment checklist](#6-deployment-checklist)
7. [Production environment template](#7-production-environment-template)
8. [Phase 1 — Opt-in preferences (build guide)](#8-phase-1--opt-in-preferences-build-guide)
9. [Phase 2 — Location pipeline + geohash (build guide)](#9-phase-2--location-pipeline--geohash-build-guide)
10. [Phases 3–5 pointer (after 1–2)](#10-phases-35-pointer-after-12)
11. [Cost control rules](#11-cost-control-rules)
12. [Rollout timeline](#12-rollout-timeline)
13. [Provider setup links](#13-provider-setup-links)

---

## 1. Launch profile & assumptions

Plan for **thousands of users**, not millions yet.

| Metric | Conservative | Active launch |
|--------|--------------|---------------|
| Registered (MAU) | 3,000–5,000 | 8,000–15,000 |
| Daily active (DAU) | 300–800 (~15%) | 1,200–2,500 |
| Opted into “help nearby” | 60–160 | 240–500 |
| Location writes/day (15 min ping, 8 hr) | ~30K–80K | ~120K–400K |
| Panics / day | 5–20 | 20–80 |
| Zone reports / day | 50–200 | 200–800 |

**Proximity ON** means: geospatial queries, FCM to nearby opted-in helpers, throttled location writes, async panic fan-out — **not** `USE_MEMORY_DB=true`.

Exchange rate for planning: **₦1,500 ≈ $1 USD** (verify at launch).

---

## 2. Monthly budget

### 2.1 Fixed infrastructure

| Item | Low / month | High / month | Notes |
|------|-------------|--------------|-------|
| Cloud Run or VPS (API + worker) | $40 | $120 | Autoscale on panic spikes |
| Firebase Hosting (`/app/`) | $0 | $15 | Often free on Spark/Blaze |
| Firestore (reads/writes) | $80 | $350 | Zones + locations + users |
| Redis Memorystore (optional) | $0* | $200 | *Defer until geohash p95 &gt; 200ms |
| Pub/Sub + Cloud Functions / Run jobs | $15 | $60 | Async panic notify |
| Domain + DNS | $2 | $5 | Amortized monthly |
| Logging / backups | $10 | $40 | |
| **Infra subtotal** | **~$150** | **~$790** | **~₦225K–1.2M** |

### 2.2 Variable — SMS (Africa’s Talking)

**Circle + OTP only.** No SMS to strangers for proximity (FCM only).

| Panics/day | Approx. SMS/month | Est. cost (USD) | Est. cost (NGN) |
|------------|-------------------|-----------------|-----------------|
| 10 | ~4,500 | $15–25 | ₦22K–38K |
| 40 | ~16,000 | $50–90 | ₦75K–135K |
| 80 | ~27,000 | $90–160 | ₦135K–240K |

Rate assumption: **₦2.5–6 per SMS** depending on route and message length.

### 2.3 FCM & maps

| Item | Cost |
|------|------|
| Firebase Cloud Messaging | **$0** |
| OpenStreetMap (client tiles) | **$0** |

### 2.4 Total monthly (plan for)

| Scenario | Infra | SMS | **Total** |
|----------|-------|-----|-----------|
| **Lean** (3K MAU, geohash, low panic) | ~$150 | ~$25 | **~$175 (~₦260K)** |
| **Target** (8K MAU, moderate traffic) | ~$400 | ~$80 | **~$480 (~₦720K)** |
| **Hot** (15K MAU, Lagos-heavy) | ~$750 | ~$150 | **~$900 (~₦1.35M)** |

Set Firebase billing alerts at **₦50K, ₦150K, ₦500K**.

### 2.5 What to defer

| Item | Why defer |
|------|-----------|
| USSD NCC shortcode | ₦500K–2M+ setup; add when DAU justifies |
| SMS to all users in radius | Cost + spam; use FCM |
| Redis | Until Firestore geohash struggles |
| Government / police APIs | Out of scope for citizen-first launch |

---

## 3. One-time & runway costs

| Item | Estimate |
|------|----------|
| Firebase Blaze (card on file) | $0 minimum |
| Africa’s Talking wallet top-up | ₦10K–50K |
| Domain (.com / .ng) | $10–20 / year |
| SSL | $0 (Let’s Encrypt) |
| Load test (staging) | $0–50 |
| Legal (privacy / terms) | $0 DIY – $500 |
| **3-month cash reserve (recommended)** | **₦2M–3M** (~$1,300–2,000) |

Covers infra + SMS spikes while tuning rate limits and indexes.

---

## 4. Production stack

| Layer | Recommendation |
|-------|----------------|
| API | **Google Cloud Run** (or 2× VPS + load balancer) |
| Web UI | Same origin as API (`/app/`) or Firebase Hosting |
| Database | **Firestore** on Blaze |
| Geospatial | **Geohash** on `locations` docs (Phase 2); Redis later if needed |
| Async work | **Pub/Sub** topic `panic-notify` + worker service |
| Push | **FCM** (web service worker + native later) |
| SMS / OTP | **Africa’s Talking** production |
| Secrets | GCP Secret Manager or host env (never commit `.env`) |

---

## 5. Pre-launch checklist (code complete — ops required)

| Item | Code | You must configure |
|------|------|-------------------|
| Firestore production | ✅ `firebase-admin` | `USE_MEMORY_DB=false`, credentials |
| Indexes + rules | ✅ `firestore.indexes.json`, `firestore.rules` | `firebase deploy` |
| Opt-in proximity | ✅ | Default off in UI |
| Geohash + TTL | ✅ | — |
| Async panic + cooldown | ✅ | `PANIC_COOLDOWN_SEC` |
| FCM web | ✅ | `FIREBASE_WEB_*` in `.env` |
| Responder APIs | ✅ | — |
| Rate limits + Helmet | ✅ | `CORS_ORIGINS` for your domain |
| Docker | ✅ `Dockerfile` | Host secrets via `--env-file` |
| Env validation | ✅ `npm run validate-env` | Strong secrets |
| Africa's Talking | ✅ | Production API key |
| Load test before ads | ⏳ Ops | k6 / Locust on staging |

---

## 6. Deployment checklist

### 6.1 Accounts & billing

- [ ] Google Cloud project + Blaze Firebase linked  
- [ ] Firestore enabled (production mode)  
- [ ] FCM enabled in Firebase Console  
- [ ] Africa’s Talking production account + sender ID  
- [ ] Domain purchased; DNS → Cloud Run or VPS  
- [ ] Billing alerts: Firebase ₦50K / ₦150K / ₦500K  
- [ ] AT SMS daily cap configured  

### 6.2 Security

- [ ] `USE_MEMORY_DB=false`  
- [ ] `JWT_SECRET`, `HASH_SECRET`, `ENCRYPTION_KEY` — 32+ random chars (rotate from dev)  
- [ ] `DEV_FIXED_OTP` **unset**  
- [ ] `SEED_REVIEW_DATA=false`  
- [ ] HTTPS only (HSTS on reverse proxy)  
- [ ] Firestore security rules: users write only own `locations/{userId}`  
- [ ] Rate limits on `/panic/*`, `/user/location`, `/auth/*`  

### 6.3 Application

- [ ] Phase 1 preferences API + UI (§8)  
- [ ] Phase 2 geohash + location TTL (§9)  
- [ ] Phase 3–5: async panic, FCM, broadcast UI (proximity doc)  
- [ ] `npm test` / smoke: health, zones, panic (staging)  
- [ ] Load test: 500 helpers in Lagos geohash cells  

### 6.4 Product & legal

- [ ] Privacy policy: location, opt-in, retention  
- [ ] Panic disclaimer: not government dispatch  
- [ ] `help_nearby` default **off**  
- [ ] Kill switch `PROXIMITY_ALERTS_ENABLED` tested  

### 6.5 Go-live

- [ ] Deploy API + static `/app/`  
- [ ] Webhook URLs registered at Africa’s Talking (SMS/USSD when ready)  
- [ ] Monitor: 5xx rate, panic latency, Firestore usage, SMS count  
- [ ] Runbook: false mass alert → disable `PROXIMITY_ALERTS_ENABLED`  

---

## 7. Production environment template

Copy to server secrets (not git):

```env
# ── SERVER ──
PORT=8080
NODE_ENV=production

# ── DATABASE (required) ──
USE_MEMORY_DB=false
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ── AFRICA'S TALKING ──
AT_USERNAME=your_prod_username
AT_API_KEY=your_prod_api_key
AT_SENDER_ID=SafeAlertNG
AT_SHORTCODE=your_shortcode_if_any

# ── SECURITY ──
JWT_SECRET=<64+ random chars>
HASH_SECRET=<64+ random chars>
ENCRYPTION_KEY=<exactly 32 chars>

# ── FEATURE FLAGS ──
PROXIMITY_ALERTS_ENABLED=true
PANIC_AUTO_BROADCAST_ENABLED=true
PANIC_SMS_ENABLED=true
PUSH_NOTIFICATIONS_ENABLED=true
SMS_NEARBY_CRITICAL_ENABLED=false
SEED_REVIEW_DATA=false

# Location & proximity
LOCATION_MIN_INTERVAL_SEC=300
LOCATION_TTL_MINUTES=45
HELP_NEARBY_MAX_RADIUS_KM=10
PANIC_BROADCAST_RADIUS_KM=10
PANIC_BROADCAST_COOLDOWN_SEC=600
CRITICAL_ZONE_RADIUS_KM=30

# Queue (Phase 3+)
PUBSUB_TOPIC_PANIC_NOTIFY=panic-notify

# ── APP ──
APP_NAME=SafeAlert NG
APP_MAP_URL=https://yourdomain.com
USSD_SERVICE_CODE=*384*911#
INCIDENT_TYPES=kidnapping,armed_robbery,banditry,terror,roadblock,suspicious
EMERGENCY_CONTACTS=[{"name":"Police","phone":"112"},{"name":"NEMA","phone":"08032003737"}]
```

---

## 8. Phase 1 — Opt-in preferences (build guide)

> **✅ Implemented in repo** — see [Implementation status](#implementation-status-code-in-repo).

**Goal:** Only users who opt in can be notified or tracked as nearby helpers.  
**Effort:** ~2–3 days  

### 8.1 User schema (Firestore `users/{id}`)

Add fields:

```javascript
{
  help_nearby_enabled: false,        // default OFF
  help_nearby_radius_km: 5,          // max 15, enforced server-side
  notifications_enabled: true,
  preferences_updated_at: "ISO8601"
}
```

### 8.2 Dependencies

```bash
npm install firebase-admin ngeohash
```

(`ngeohash` used in Phase 2; install once.)

### 8.3 Validation — `src/middleware/validate.js`

Add schema:

```javascript
updatePreferences: Joi.object({
  help_nearby_enabled: Joi.boolean().optional(),
  help_nearby_radius_km: Joi.number().min(1).max(15).optional(),
  notifications_enabled: Joi.boolean().optional(),
}),
```

Register in `buildSchemas()` return object.

### 8.4 Routes — `src/routes/index.js`

```javascript
// GET /user/preferences
router.get('/user/preferences', requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    preferences: {
      help_nearby_enabled: !!u.help_nearby_enabled,
      help_nearby_radius_km: Math.min(15, u.help_nearby_radius_km || 5),
      notifications_enabled: u.notifications_enabled !== false,
    },
  });
});

// PUT /user/preferences
router.put('/user/preferences', requireAuth, validate('updatePreferences'), async (req, res) => {
  const maxRadius = parseFloat(process.env.HELP_NEARBY_MAX_RADIUS_KM || 15);
  const patch = {
    preferences_updated_at: new Date().toISOString(),
  };
  if (req.body.help_nearby_enabled !== undefined) {
    patch.help_nearby_enabled = req.body.help_nearby_enabled;
  }
  if (req.body.help_nearby_radius_km !== undefined) {
    patch.help_nearby_radius_km = Math.min(maxRadius, req.body.help_nearby_radius_km);
  }
  if (req.body.notifications_enabled !== undefined) {
    patch.notifications_enabled = req.body.notifications_enabled;
  }
  await db().collection('users').doc(req.user.id).update(patch);
  res.json({ success: true, preferences: patch });
});
```

### 8.5 Auth — `src/services/authService.js`

- On `findOrCreateUser`, set defaults: `help_nearby_enabled: false`, `help_nearby_radius_km: 5`.  
- Include preferences in `sanitiseUser()` (no secrets).

### 8.6 Geo filter — `src/services/geoService.js`

After loading each candidate user:

```javascript
if (!user.help_nearby_enabled) continue;
if (excludeUserId && userId === excludeUserId) continue;
```

Pass `excludeUserId` from panic handlers (panicker must not get own alert).

### 8.7 Client — `public/app.js` + `public/index.html`

- Settings sheet or profile section: toggle **“Alert me when someone nearby needs help”** + radius slider (1–15 km).  
- On save: `PUT /v1/user/preferences`.  
- On login: `GET /v1/user/preferences` and sync UI.  
- Copy: *“You choose to receive alerts. We never share your exact address in notifications.”*

### 8.8 Phase 1 exit criteria

- [x] Default `help_nearby_enabled` is false for new users  
- [x] `getNearbyUsers` skips non-opted-in users  
- [x] UI toggle persists across sessions  
- [ ] Unit/integration test: opted-out user never in nearby list  

---

## 9. Phase 2 — Location pipeline + geohash (build guide)

> **✅ Implemented in repo** — see [Implementation status](#implementation-status-code-in-repo).

**Goal:** Query nearby helpers in O(cells) not O(all Nigeria).  
**Effort:** ~4–6 days  

### 9.1 Replace in-memory Firebase — `src/config/firebase.js`

Implement production branch:

```javascript
const admin = require('firebase-admin');
const { memDb } = require('./memoryDb');

let db = null;
let messaging = null;

function initFirebase() {
  if (process.env.USE_MEMORY_DB === 'true' || !process.env.FIREBASE_PROJECT_ID) {
    console.log('[Firebase] Using in-memory database');
    db = memDb;
    return;
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  db = admin.firestore();
  messaging = admin.messaging();
  console.log('[Firebase] Firestore + FCM initialized');
}

function getDb() {
  if (!db) initFirebase();
  return db;
}

function getMessaging() {
  if (!db) initFirebase();
  return messaging;
}

module.exports = { initFirebase, getDb, getMessaging };
```

Update `src/config/db.js`:

```javascript
const { getDb } = require('./firebase');
function db() { return getDb(); }
module.exports = { db };
```

Call `initFirebase()` at startup in `src/server.js`.

### 9.2 Location document shape — `locations/{userId}`

```javascript
{
  lat: number,
  lng: number,
  accuracy: number | null,
  user_id: string,
  journey_active: boolean,
  panic_active: boolean,
  help_nearby_enabled: boolean,  // denormalized from user for query
  geohash: string,               // precision 6 (~1.2 km)
  geohash_prefix: string,        // first 4 chars for composite index
  updated_at: ISO string,
  expires_at: ISO string         // now + LOCATION_TTL_MINUTES
}
```

### 9.3 Geohash helper — new `src/utils/geohash.js`

```javascript
const ngeohash = require('ngeohash');
const { distanceKm } = require('./geo');

const PRECISION = 6;

function encodeGeohash(lat, lng) {
  const hash = ngeohash.encode(lat, lng, PRECISION);
  return { geohash: hash, geohash_prefix: hash.slice(0, 4) };
}

function getNeighborPrefixes(lat, lng) {
  const center = ngeohash.encode(lat, lng, 4);
  const neighbors = ngeohash.neighbors(center);
  return [...new Set([center, ...neighbors])];
}

module.exports = { encodeGeohash, getNeighborPrefixes, PRECISION };
```

### 9.4 Location write — `PUT /user/location` in `src/routes/index.js`

Rules:

1. Require `help_nearby_enabled || journey_active || panic_active` on user.  
2. Throttle: reject if last write &lt; `LOCATION_MIN_INTERVAL_SEC` (store `last_location_write_at` on user).  
3. Set `expires_at` from `LOCATION_TTL_MINUTES`.  
4. Write geohash fields (§9.2).

### 9.5 Rewrite `getNearbyUsers` — `src/services/geoService.js`

```javascript
const { db } = require('../config/db');
const { distanceKm } = require('../utils/geo');
const { getNeighborPrefixes } = require('../utils/geohash');

async function getNearbyUsers(lat, lng, radiusKm, { excludeUserId } = {}) {
  const prefixes = getNeighborPrefixes(lat, lng);
  const now = new Date().toISOString();
  const candidates = new Map();

  for (const prefix of prefixes) {
    const snap = await db()
      .collection('locations')
      .where('geohash_prefix', '==', prefix)
      .where('expires_at', '>', now)
      .limit(200)
      .get();

    for (const doc of snap.docs) {
      const loc = doc.data();
      if (loc.lat == null || loc.lng == null) continue;
      if (distanceKm(lat, lng, loc.lat, loc.lng) > radiusKm) continue;
      const userId = loc.user_id || doc.id;
      if (excludeUserId && userId === excludeUserId) continue;
      if (!loc.help_nearby_enabled && !loc.panic_active && !loc.journey_active) continue;
      candidates.set(userId, { id: userId, ...loc });
    }
  }

  const users = [];
  for (const [userId, loc] of candidates) {
    const userSnap = await db().collection('users').doc(userId).get();
    if (!userSnap.exists) continue;
    const user = { id: userId, ...userSnap.data() };
    if (!user.help_nearby_enabled && !loc.panic_active) continue;
    if (user.fcm_token) users.push(user);
  }
  return users;
}

module.exports = { getNearbyUsers };
```

### 9.6 Firestore indexes

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "locations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "geohash_prefix", "order": "ASCENDING" },
        { "fieldPath": "expires_at", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy: `firebase deploy --only firestore:indexes`

### 9.7 TTL cleanup

- **Option A:** Cloud Scheduler + Function every 15 min: delete `locations` where `expires_at < now`.  
- **Option B:** Rely on query filter `expires_at > now` (stale docs remain until cleanup).

### 9.8 Client location ping — `public/app.js`

When `preferences.help_nearby_enabled`:

```javascript
setInterval(() => pingLocation(), 15 * 60 * 1000);
```

Reuse existing `pingLocation()` but only if opted in (after preferences loaded).

### 9.9 Phase 2 exit criteria

- [ ] `USE_MEMORY_DB=false` works on staging with real Firestore  
- [x] Location write rejected when not opted in and not journey/panic  
- [x] `getNearbyUsers` uses prefix queries (memory fallback scan in dev)  
- [ ] Load test: 500 location docs in Lagos; panic query p95 &lt; 200 ms  
- [x] Expired locations never returned (query filter `expires_at > now`)  

---

## 10. Phases 3–5 pointer (after 1–2)

Complete before marketing **proximity** to thousands:

| Phase | What | See |
|-------|------|-----|
| **3** | Async panic worker (Pub/Sub), auto nearby FCM | [PROXIMITY doc §4 Phase 4](./PROXIMITY_ALERTS_IMPLEMENTATION.md#phase-4--panic--broadcast-orchestration-weeks-6-7) |
| **4** | FCM web service worker, `PUT /user/fcm-token`, wire broadcast button | [PROXIMITY doc §7](./PROXIMITY_ALERTS_IMPLEMENTATION.md#7-client-implementation-web--native) |
| **5** | `GET /panic/nearby`, `POST /panic/:id/respond`, map UX | [PROXIMITY doc §4 Phase 5](./PROXIMITY_ALERTS_IMPLEMENTATION.md#phase-5--responder-experience-weeks-8-10) |

**Estimated calendar after Phase 1–2:** 4–6 more weeks one developer.

---

## 11. Cost control rules

1. Nearby strangers → **FCM only**, never SMS.  
2. `help_nearby_enabled` default **false**.  
3. Location ping ≥ **5 minutes** apart.  
4. Panic **cooldown** 15 min per user/device.  
5. **Geohash** live before ads.  
6. AT **SMS daily cap**.  
7. Test **`PROXIMITY_ALERTS_ENABLED=false`** kill switch.

---

## 12. Rollout timeline

| Month | Users | Budget focus | Engineering |
|-------|-------|--------------|-------------|
| **0** | Staging | ~$20 infra | Phase 1–2 + indexes |
| **1** | 500–1K invited | ~₦200K–350K | Phase 3–5, FCM |
| **2** | 2K–5K (one city) | ~₦400K–600K | Tune Firestore; add Redis if needed |
| **3** | 5K–15K + proximity marketing | ~₦500K–900K | Monitor SMS + writes daily |

---

## 13. Provider setup links

| Provider | URL |
|----------|-----|
| Firebase Console | https://console.firebase.google.com |
| Firestore pricing | https://firebase.google.com/pricing |
| Google Cloud Run | https://cloud.google.com/run |
| Africa's Talking | https://africastalking.com |
| AT Nigeria SMS pricing | Check dashboard after KYC |
| NiRA (.ng domains) | https://www.nira.org.ng |

---

## Quick reference — budget card

| | Lean | Target | Hot |
|--|------|--------|-----|
| **Monthly** | ~₦260K | ~₦720K | ~₦1.35M |
| **3-month reserve** | | **₦2M–3M** | |
| **Biggest variable** | SMS | SMS | SMS + Firestore |
| **Free** | FCM, OSM | | |

---

*Update this document when Phase 1–2 ship or when actual Firebase/AT bills are known.*
