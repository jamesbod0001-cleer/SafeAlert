# SafeAlert NG — Implementation & Citizen Safety Guide

**Proximity alerts · Community features · National scale (millions of users across Nigeria)**  
**Last updated:** May 2026  
**Status:** Implemented in codebase — proximity kill switch, panic broadcast, estate watch, admin moderation. See `GET /v1/health` for live feature flags.

**Positioning:** SafeAlert is a **neighborhood nervous system** — crowdsourced risk, peer response, and low-tech access (USSD/SMS) so Nigerians help Nigerians when formal systems are slow or absent. **No dependency on government APIs** for core value.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What exists in this codebase today](#2-what-exists-in-this-codebase-today)
3. [Target architecture at national scale](#3-target-architecture-at-national-scale)
4. [Phased implementation (step-by-step)](#4-phased-implementation-step-by-step)
5. [Data model & API contracts](#5-data-model--api-contracts)
6. [Geospatial strategy (millions of users)](#6-geospatial-strategy-millions-of-users)
7. [Client implementation (web → native)](#7-client-implementation-web--native)
8. [Privacy, legal & abuse prevention (Nigeria)](#8-privacy-legal--abuse-prevention-nigeria)
9. [Cost implications & budgeting](#9-cost-implications--budgeting)
10. [Monitoring, SLOs & incident response](#10-monitoring-slos--incident-response)
11. [Checklist before launch](#11-checklist-before-launch)
12. [Citizen-powered features (without government reliance)](#12-citizen-powered-features-without-government-reliance)

---

## 1. Executive summary

**Goal:** When someone triggers a **panic** or a **critical incident**, other SafeAlert users **near that location** who have **opted in** receive a timely alert and can open the map to help or avoid danger.

**Core formula:**

```
Proximity alert = (event at lat/lng) + (recent locations in radius) + (user opted in) + (delivery channel)
```

**Channels (by audience):**

| Audience | Channel | Works on 2G? | Cost driver |
|----------|---------|--------------|-------------|
| Safety circle (trusted contacts) | SMS + FCM | SMS yes | SMS per member per panic |
| Nearby strangers (opted-in helpers) | FCM (primary) | No (needs data) | FCM free; location writes expensive |
| Critical zone escalation | FCM + optional SMS | Partial | SMS if broadcast to many numbers |

**Do not** SMS every user within 10 km of a panic at national scale — cost and spam risk are prohibitive. Reserve SMS for **circle** and **verified critical** flows.

---

## 2. What exists in this codebase today

> **Updated 2026-06-05:** Items below marked ✅ are implemented. See `docs/PRODUCTION.md` and `docs/SERIOUS_LAUNCH_DEPLOYMENT.md` for current status.

| Component | Location | Status |
|-----------|----------|--------|
| Haversine distance | `src/utils/geo.js` | ✅ |
| Find users near point | `src/services/geoService.js` → `getNearbyUsers()` | ✅ MVP (full collection scan) |
| Zone create → nearby push | `src/routes/index.js` `POST /zones` | ✅ |
| Panic → circle SMS + FCM | `POST /panic/activate` | ✅ |
| Panic → nearby broadcast | `POST /panic/broadcast` | ✅ API only; **UI not wired** |
| FCM send | `src/services/pushService.js` | ✅ (mock if Firebase Messaging unset) |
| Location ping | `PUT /user/location` | ✅ (used during journey/panic in `public/app.js`) |
| Config radii | `.env` → `PANIC_BROADCAST_RADIUS_KM`, `CRITICAL_ZONE_RADIUS_KM` | ✅ |

**Gaps for production at scale:**

- ✅ `help_nearby_enabled` opt-in (`GET/PUT /user/preferences`, settings UI)
- ✅ Geospatial index — Firestore geohash (`src/utils/geohash.js`, `geoService.js`)
- Nearby users only found if they recently wrote to `locations` (by design; TTL 45 min)
- ✅ Responder APIs (`GET /panic/nearby`, `POST /panic/:id/respond`)
- ✅ Web FCM registration (`public/js/fcm.js`, `firebase-messaging-sw.js`, `PUT /user/fcm-token`)
- Redis GEO (optional at 5M+ MAU) — not deployed; geohash covers current scale

---

## 3. Target architecture at national scale

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│ Mobile/Web  │────▶│ API (stateless)  │────▶│ Firestore (zones, users) │
│ + FCM token │     │ Node / Cloud Run │     │ + location shards        │
└─────────────┘     └────────┬─────────┘     └─────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ Alert orchestrator│
                    │ (panic / zone)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │ FCM      │  │ SMS (AT) │  │ Queue (Pub/Sub)│
        │ (free)   │  │ circle   │  │ async fan-out  │
        └──────────┘  └──────────┘  └──────────────┘
```

**Principles for millions of users:**

1. **Opt-in only** for stranger proximity alerts.
2. **Async fan-out** — panic API returns in &lt;300 ms; notification job runs in background.
3. **Geospatial index** — never scan entire `locations` collection per event.
4. **TTL on locations** — ignore pings older than 30–60 minutes.
5. **Shard by geography** — Nigeria ~36 states; optional geohash prefix per region.
6. **Rate limits** — panic, broadcast, and location write caps per user/device.

---

## 4. Phased implementation (step-by-step)

### Phase 0 — Prerequisites (Week 1)

| Step | Action | Owner |
|------|--------|-------|
| 0.1 | Production Firebase project (Firestore + FCM + Auth if needed) | DevOps |
| 0.2 | Africa's Talking production SMS + shortcode / USSD registration (NCC) | Product / Legal |
| 0.3 | Define SLOs: panic notify p95 &lt; 5 s to circle; nearby FCM p95 &lt; 15 s | Engineering |
| 0.4 | Load test plan (locust/k6) for 10k RPS location writes | Engineering |

**Exit criteria:** Staging environment mirrors prod; secrets in Secret Manager (not `.env` on disk).

---

### Phase 1 — Opt-in & preferences (Week 2)

**Purpose:** Legal and cost control — only notify users who asked to help nearby.

| Step | Task | Implementation detail |
|------|------|------------------------|
| 1.1 | Extend user schema | Add to Firestore `users/{id}`: `help_nearby_enabled: boolean`, `help_nearby_radius_km: number` (default 5, max 15), `notifications_enabled: boolean` |
| 1.2 | API | `GET /user/preferences`, `PUT /user/preferences` with Joi validation |
| 1.3 | Auth middleware | Reuse `requireAuth` from `src/middleware/auth.js` |
| 1.4 | UI | Settings screen toggle: *"Alert me when someone nearby needs help"* + radius slider |
| 1.5 | Audit log | Write `preference_changes` subcollection for disputes |

**Code touchpoints:** `src/routes/index.js`, `src/middleware/validate.js`, `public/app.js`, `public/index.html`

**Exit criteria:** 100% of nearby pushes gated on `help_nearby_enabled === true`.

---

### Phase 2 — Location pipeline (Weeks 3–4)

**Purpose:** Build a fresh, queryable location index for helpers (not only panic/journey users).

| Step | Task | Implementation detail |
|------|------|------------------------|
| 2.1 | Location write rules | Accept `PUT /user/location` only if `help_nearby_enabled` OR `journey_active` OR `panic_active` |
| 2.2 | Throttle | Max 1 write per 5 minutes per user (config `LOCATION_MIN_INTERVAL_SEC`) |
| 2.3 | TTL field | Store `expires_at = now + 45 minutes` on `locations/{userId}` |
| 2.4 | Scheduled cleanup | Cloud Function / cron deletes expired `locations` docs |
| 2.5 | Client background ping | While opted-in: ping every 10–15 min (foreground); native app uses OS background APIs |
| 2.6 | Exclude panicker | `getNearbyUsers(lat, lng, radius, { excludeUserId })` |

**Upgrade `geoService.js`:**

```javascript
// Pseudocode — Phase 2 still uses Firestore; Phase 3 adds geohash
async function getNearbyUsers(lat, lng, radiusKm, { excludeUserId } = {}) {
  const candidates = await queryLocationsInRadius(lat, lng, radiusKm); // Phase 3
  return candidates.filter(u => u.help_nearby_enabled && u.id !== excludeUserId && !isExpired(u));
}
```

**Exit criteria:** With 10k simulated helpers in Lagos, query returns &lt;100 ms p95 in staging.

---

### Phase 3 — Geospatial index (Weeks 5–8) — **required before millions**

| Step | Task | Options |
|------|------|---------|
| 3.1 | Add geohash to location docs | Library: `ngeohash` — precision 5–6 (~4.9 km / 1.2 km cells) |
| 3.2 | Composite queries | Firestore: `geohash_prefix` + `expires_at` index |
| 3.3 | Query pattern | Compute geohash neighbors for circle radius; union results; precise filter with `distanceKm` |
| 3.4 | Alternative at 5M+ MAU | **Redis GEO** (`GEOADD`, `GEORADIUS`) on Memorystore — sub-ms radius queries |
| 3.5 | Shard hot cities | Separate Redis DB index per zone: `lagos`, `abuja`, `ph`, `kano`, `other` |

**Why:** Current `locations.get()` is O(all users). At 2M location docs × 1000 panics/day = billions of reads/month.

**Exit criteria:** Single panic query touches &lt;500 location docs, not entire collection.

---

### Phase 4 — Panic & broadcast orchestration (Weeks 6–7)

| Step | Task | Implementation detail |
|------|------|------------------------|
| 4.1 | Sync path on `POST /panic/activate` | Update user + location; enqueue job `panic.notify` |
| 4.2 | Async worker | Pub/Sub or BullMQ: (a) circle SMS, (b) circle FCM, (c) nearby FCM |
| 4.3 | Auto nearby notify | Call broadcast logic inside worker (not blocking HTTP) |
| 4.4 | `POST /panic/broadcast` | Manual widen radius (e.g. 10 → 25 km), rate limit 1/10 min |
| 4.5 | Wire UI | Replace fake toast in panic overlay; call API from `doPanic()` |
| 4.6 | Push payload | `{ type: 'NEARBY_PANIC', lat, lng, distance_km, panic_id, action: 'open_map' }` |
| 4.7 | Dedup | `panic_events/{id}` with `notified_user_ids[]` to prevent double push |

**New collection:** `panic_events/{id}` — `user_id`, `lat`, `lng`, `started_at`, `active`, `responders[]`

**Exit criteria:** End-to-end test: User A panics in Lagos → User B (opted-in, 3 km away) receives FCM within 15 s.

---

### Phase 5 — Responder experience (Weeks 8–10)

| Step | Task | API |
|------|------|-----|
| 5.1 | List active panics near me | `GET /panic/nearby?lat=&lng=&radius_km=10` |
| 5.2 | Respond | `POST /panic/:id/respond` → notifies circle "Someone is coming" |
| 5.3 | Map UI | Pulsing marker; approximate location (no exact home address) |
| 5.4 | Safe actions | Open Google Maps, call `EMERGENCY_CONTACTS` from config |
| 5.5 | Close panic | Existing `POST /panic/deactivate` clears map markers |

**Privacy:** Public API returns fuzzed coords (e.g. 2 decimal places ≈ 1.1 km) until user is in responder list.

---

### Phase 6 — Zone / critical incident proximity (Weeks 10–11)

Already partially implemented on `POST /zones` and critical confirm.

| Step | Task | Detail |
|------|------|--------|
| 6.1 | Severity gate | Push nearby only if `severity >= high` |
| 6.2 | SMS gate | SMS nearby only on `critical` AND `SMS_NEARBY_CRITICAL_ENABLED=true` |
| 6.3 | Cap SMS recipients | Max 50 SMS per zone escalation (nearest opted-in with phone — controversial; prefer FCM) |

---

### Phase 7 — FCM at scale (Weeks 4–12, parallel)

| Step | Task | Detail |
|------|------|--------|
| 7.1 | Web | Service worker `firebase-messaging-sw.js`, permission prompt after opt-in |
| 7.2 | Register token | `PUT /user/fcm-token` on login + token refresh |
| 7.3 | Android/iOS | Flutter/React Native — higher priority for Nigeria (background location) |
| 7.4 | Batch send | FCM multicast 500 tokens per request (already in `pushService.js`) |
| 7.5 | Topic fallback | Optional: `state_lagos` topics for broadcast (use carefully — not for precise panic) |

**FCM cost:** $0 (Google does not charge for notification delivery).

---

### Phase 8 — Production hardening (Weeks 12–16)

| Step | Task |
|------|------|
| 8.1 | API autoscaling (Cloud Run min instances in peak hours) |
| 8.2 | Firestore rules — users can only write own `locations/{userId}` |
| 8.3 | WAF + rate limits (`express-rate-limit` per IP + per user) |
| 8.4 | Panic abuse: cooldown 15 min, CAPTCHA on web, device ban list |
| 8.5 | DLQ for failed push jobs + retry |
| 8.6 | Disaster runbook: false mass alert, kill switch `PROXIMITY_ALERTS_ENABLED=false` |

---

## 5. Data model & API contracts

### Firestore collections (recommended)

```
users/{userId}
  help_nearby_enabled: boolean
  help_nearby_radius_km: number
  fcm_token: string | null
  circle: array
  panic_active: boolean

locations/{userId}
  lat, lng, accuracy
  geohash: string
  geohash_prefix: string  // first 4 chars for indexing
  user_id: string
  journey_active: boolean
  panic_active: boolean
  updated_at: timestamp
  expires_at: timestamp

panic_events/{panicId}
  user_id, lat, lng, state (guess), active, started_at
  notified_count, responder_ids[]

zones/{zoneId}  (existing)
```

### New / updated endpoints

```
PUT  /user/preferences     { help_nearby_enabled, help_nearby_radius_km }
GET  /user/preferences

PUT  /user/location        { lat, lng, accuracy }  — throttled
PUT  /user/fcm-token       { token }

POST /panic/activate       { lat, lng }  → async notify
POST /panic/deactivate
POST /panic/broadcast      { lat, lng, message? }  — rate limited
GET  /panic/nearby         ?lat&lng&radius_km
POST /panic/:id/respond
```

---

## 6. Geospatial strategy (millions of users)

### Nigeria scale assumptions

| Metric | Conservative | Aggressive |
|--------|--------------|------------|
| Registered users (MAU) | 2M | 10M |
| Daily active (DAU) | 200K (10%) | 1M (10%) |
| Opted into help nearby | 40K (20% DAU) | 200K |
| Location pings / user / day | 32 (every 15 min × 8 hr) | 96 |
| Panics / day (national) | 500 | 5,000 |
| New zone reports / day | 5,000 | 50,000 |

### Query pattern (production)

1. Panic at `(lat, lng)` with radius `R` km.
2. Compute geohash + 8 neighbors.
3. Firestore/Redis fetch candidates in those cells.
4. Filter: `distanceKm <= R`, `expires_at > now`, `help_nearby_enabled`, has `fcm_token`.
5. Enqueue FCM multicast batches of 500.

### What breaks at scale (avoid)

| Anti-pattern | At 5M MAU impact |
|--------------|------------------|
| `locations.get()` full scan | Millions of reads per panic → $$$$ + timeout |
| SMS all users in 10 km | 10k+ SMS per panic → ₦ millions + NCC complaints |
| Location ping every 60 s for everyone | 5M × 1440 = 7.2B writes/day → unsustainable |
| Synchronous FCM in HTTP handler | Timeouts under fan-out load |

---

## 7. Client implementation (web → native)

### Web (current `public/app.js`)

1. After login → request notification permission → FCM token → `PUT /user/fcm-token`.
2. If `help_nearby_enabled` → `setInterval(pingLocation, 15 * 60 * 1000)`.
3. On panic success → `POST /panic/broadcast` (optional second call if not merged server-side).
4. Service worker: on `NEARBY_PANIC` → open `/app/?lat=&lng=`.

### Native (recommended for Nigeria)

- **Android:** Foreground service for journey/panic; WorkManager for periodic location when opted-in.
- **iOS:** Significant location change + background modes (stricter review).
- **Data savings:** Batch location, compress payloads, respect "low data mode".

---

## 8. Privacy, legal & abuse prevention (Nigeria)

| Requirement | Implementation |
|-------------|----------------|
| NDPR / consent | Explicit opt-in toggle; privacy policy link; log consent timestamp |
| Data minimization | Store geohash + rounded lat/lng for helpers; encrypt phone at rest (already in circle flow) |
| NCC / SMS regulations | Register sender ID; opt-out keyword (STOP); no marketing in panic SMS |
| False panic | Cooldown, strike system, community report |
| Victim safety | Do not show victim phone to strangers; fuzz home location |
| Emergency services | UI disclaimer: "Not a replacement for 112 / police" |

---

## 9. Cost implications & budgeting

> **All figures are estimates** for planning. Verify with Firebase, Africa's Talking, and cloud vendor quotes before budgeting. Exchange rate assumed: **₦1,500 ≈ $1 USD** (adjust as needed).

### 9.1 Cost drivers (ranked)

1. **Firestore reads/writes** (location pings dominate)
2. **SMS** (circle panic + optional critical — per message)
3. **Compute** (API + workers — moderate)
4. **FCM** — **$0**
5. **Redis** (optional, Phase 3+) — fixed monthly
6. **Maps** — OSM free; Google Maps API costs if you switch

---

### 9.2 Unit economics (per user per month)

| Activity | Firestore ops (approx) | Notes |
|----------|------------------------|-------|
| Location ping (1 write + 1 read index) | ~64 writes + 64 reads / day if every 15 min | Only for opted-in active users |
| Daily zone browse | ~20 reads | Map/list |
| 1 panic (as victim) | ~10 writes + worker reads | Rare |
| Receive 2 nearby pushes / month | 0 extra storage | FCM free |

**Opted-in helper, active 8 hr/day, 15-min ping:**

- Writes: 32/day × 30 ≈ **960 writes/month**
- At $0.18 / 100K writes → **~$0.0017/user/month** (writes only)
- Reads for geohash queries are shared across events — budget **2–5× write cost** for index maintenance

---

### 9.3 Monthly cost scenarios

#### Scenario A — MVP (50K MAU, 5K DAU, 1K helpers)

| Item | Volume | Est. USD/mo |
|------|--------|-------------|
| Firestore | ~30M writes, ~50M reads | $50–120 |
| Cloud Run (API) | 2 vCPU peak | $80–150 |
| SMS (500 panics × 5 circle × ₦3) | ~2,500 SMS | $15–40 |
| FCM | Unlimited | $0 |
| **Total** | | **~$150–310** (~₦225K–465K) |

#### Scenario B — Growth (2M MAU, 200K DAU, 40K helpers with pings)

| Item | Volume | Est. USD/mo |
|------|--------|-------------|
| Firestore locations | 40K × 960 writes ≈ 38M writes + queries | $800–2,500 |
| Firestore zones/users | reads/writes | $300–800 |
| Cloud Run / GKE | autoscale | $500–1,500 |
| Redis Memorystore (optional) | 5 GB HA | $200–400 |
| SMS | 2K panics/day × 5 × 30 = 300K SMS | **$3,000–9,000** ⚠️ |
| Pub/Sub + Functions | alert queue | $50–200 |
| FCM | | $0 |
| **Total** | | **~$5K–14K/mo** (SMS dominates if panic volume high) |

**SMS mitigation:** Cap circle size at 5 (already); never SMS strangers; use FCM for proximity.

#### Scenario C — National scale (10M MAU, 1M DAU, 200K helpers)

| Item | Volume | Est. USD/mo |
|------|--------|-------------|
| Firestore | 200K helpers × 960 writes ≈ **192M writes/mo** | $3,500–8,000 |
| Firestore reads (geohash + app) | 500M–2B | $3,000–12,000 |
| Redis GEO cluster | 3 shards HA | $800–2,000 |
| Compute (K8s/Cloud Run) | multi-region | $3,000–8,000 |
| SMS (5K panics/day × 5 × 30) | 750K SMS/mo | $7,500–22,000 |
| Monitoring (Datadog etc.) | | $500–2,000 |
| **Total** | | **~$18K–54K/mo** without SMS |
| **With heavy SMS** | | **~$30K–75K/mo** |

At **10M registered** but only **200K** location-active helpers, total Firestore writes ≈ **192M/month** — manageable with indexing (~$3.5K–8K). If **all 10M** pinged every 15 min, writes explode to **~9.6B/month** → **$17K+ on writes alone** — **must throttle and opt-in**.

---

### 9.4 SMS cost detail (Africa's Talking — Nigeria)

| Item | Typical range |
|------|----------------|
| Outbound SMS | ~₦2.5–₦6 per segment (~$0.002–$0.004) |
| Circle panic (5 SMS) | ~₦12.5–₦30 per panic |
| 1,000 panics/day | ~₦12,500–₦30,000/day → **₦375K–₦900K/mo** ($250–$600 at low end; higher with more panics) |
| USSD session | Separate pricing — session-based |

**Rule:** Proximity to strangers = **FCM only**. SMS = **circle + optional OTP**.

---

### 9.5 FCM (Firebase Cloud Messaging)

- **Price:** Free for notification delivery.
- **Limits:** Batch 500 tokens; quota scales with Firebase project — request increase for 10M+ devices.
- **Cost risk:** Indirect — Firestore reads to resolve tokens, worker compute for fan-out.

---

### 9.6 Cost optimization playbook

| Technique | Savings |
|-----------|---------|
| Opt-in + 15-min ping (not 60s) | 4× fewer writes |
| Expire locations after 45 min | Smaller collection, faster queries |
| Geohash / Redis GEO | 100–1000× fewer reads per panic |
| Async panic fan-out | Smaller API instances |
| FCM not SMS for nearby | Avoids largest SMS bill |
| Panic cooldown + fraud detection | Fewer fake panics |
| `help_nearby` default **off** | Majority of users write zero locations |
| Regional Redis shards | Avoid single hot spot (Lagos) |

---

### 9.7 Revenue / sustainability (optional planning)

If purely civic / NGO-funded, document subsidy per active helper (~$0.01–0.05/mo infrastructure).  
If freemium: premium circle size, verified responders, insurer API — does not affect marginal FCM cost.

---

## 10. Monitoring, SLOs & incident response

### Metrics to track

| Metric | Alert threshold |
|--------|-----------------|
| `panic.activate.duration` p95 | &gt; 500 ms |
| `panic.notify.nearby.count` | 0 for 5 min during known test |
| `location.write.rate` | &gt; 10× baseline |
| `fcm.send.failure_rate` | &gt; 5% |
| `geo.query.duration` p95 | &gt; 200 ms |
| `sms.send.failure_rate` | &gt; 2% |

### Kill switches (env)

```env
PROXIMITY_ALERTS_ENABLED=true
PANIC_AUTO_BROADCAST_ENABLED=true
SMS_NEARBY_CRITICAL_ENABLED=false
LOCATION_WRITES_ENABLED=true
```

### False alert runbook

1. Set `PROXIMITY_ALERTS_ENABLED=false`.
2. Purge pending Pub/Sub messages.
3. Push in-app banner: "Ignore previous alert — system test."
4. Post-mortem: device_id, user_id, IP.

---

## 11. Checklist before launch

### Product & legal

- [ ] Privacy policy covers location sharing & opt-in
- [ ] In-app consent for "help nearby"
- [ ] NCC / AT sender ID registered
- [ ] Emergency disclaimer in panic UI

### Engineering

- [ ] `help_nearby_enabled` enforced server-side
- [ ] Geohash or Redis GEO in production
- [ ] Location TTL + cleanup job
- [ ] Async panic notification worker
- [ ] FCM registered on web + native
- [ ] `/panic/broadcast` wired in UI
- [ ] Rate limits on panic, location, broadcast
- [ ] Load test: 50K helpers in Lagos, 100 concurrent panics
- [ ] Kill switches tested

### Cost

- [ ] Monthly budget cap on Firebase billing alerts
- [ ] SMS daily cap configured in AT dashboard
- [ ] Projected SMS bill &lt; 20% of operating budget
- [ ] Only opted-in users generate location writes

---

## 12. Citizen-powered features (without government reliance)

This section extends SafeAlert beyond proximity panic into a **citizen-first safety platform** — peers, local groups, NGOs, and commercial partners — without building on police databases, NIN, or state emergency dispatch APIs.

### 12.1 What you already have (community / peer today)

| Existing capability | Citizen angle | Code / config |
|---------------------|---------------|---------------|
| Zone reports + confirm/clear votes | Crowdsourced “still dangerous?” | `zoneService`, `POST/PATCH /zones` |
| Route safety scores | Travellers warn each other | `routes` collection, `GET /routes/check` |
| Safety circle (max 5) + panic SMS | Family/neighbors, not state | `PUT /user/circle`, `sendPanicSMS` |
| Journey watch | Peers track a trip | `POST /journey/start`, `PUT /user/location` |
| Community groups | Traders, drivers, estates | `GET /groups`, `POST /groups/:id/join` |
| USSD + inbound SMS | Feature phone, 2G, zero data | `ussdService`, `*384*911#` |
| Emergency contacts list | User may call — not platform dispatch | `EMERGENCY_CONTACTS` in `.env` / Firestore |

**Design principle (from README):** Phone numbers hashed/encrypted; live locations deleted when journey/panic ends; reports are **citizen-only** by default.

---

### 12.2 Feature catalog

#### A. Life safety & response (extend proximity work)

| Feature | What it does | Govt needed? | Build on |
|---------|--------------|--------------|----------|
| **Verified responders / “I can help”** | Opt-in users list skills (first aid, escort, mechanic, languages). Panic/nearby shows nearest helpers. | No — community vouches | Phase 4–5 proximity + `help_nearby_enabled` |
| **Safe check-in / dead man’s switch** | “Arrive by 9pm” — no check-in → notify circle; optional SMS `SAFE` reply | No | Journey + SMS inbound (`handleInboundSMS`) |
| **Convoy / group travel** | 3–10 phones share one journey timeline (weddings, buses, night roads) | No | `groups` + shared `journey_sessions` |
| **Women’s & night-travel mode** | Stricter sharing defaults, double-tap panic, prefer female-vouched helpers | No | UI + preferences flags |
| **Responder flow** | `POST /panic/:id/respond` — “I’m on my way” notifies circle | No | Section 5 APIs |

#### B. Local intelligence (hyperlocal, crowdsourced)

| Feature | What it does | Govt needed? | Build on |
|---------|--------------|--------------|----------|
| **Estate / market / corridor channels** | Geofenced group feeds (“Mile 2”, “Gwarinpa”, “Kaduna–Abuja axis”) | No — community admins | `groups` + geohash subscription |
| **Safe corridor windows** | When 70%+ vote “cleared”, push “corridor open ~2h” to route subscribers | No | Zone clear threshold + FCM topics |
| **Scam / one-chance / checkpoint types** | New `INCIDENT_TYPES`; same vote algorithm | No | `INCIDENT_TYPES` env + zones |
| **Pattern heatmaps** | Anonymized time/place aggregates — no named suspects | No | Zone history + analytics job |
| **Anonymous USSD tips** | Report danger from any SIM → merges into zones | No | `ussd_reports` (exists) → zone pipeline |

#### C. Inclusion & low connectivity

| Feature | What it does | Govt needed? | Build on |
|---------|--------------|--------------|----------|
| **USSD menus (routes, zones, emergency list)** | Full feature set on dial pad | No | `ussdService.js` |
| **Local languages** | Hausa, Yoruba, Igbo, Pidgin copy for USSD/push | No — volunteers/NGO | i18n strings + Firestore `copy/{lang}` |
| **Voice note on report** | 10s audio attached to zone (inclusion) | No | Cloud Storage + moderation queue |
| **Offline queue** | Reports sync when data returns | No | Firestore offline + client queue |
| **Airtime / data gift on panic** | Circle sends ₦50 airtime so victim can call back | No — telco/fintech API | Partner integration |

#### D. Resources & trust (private / civic, not state)

| Feature | What it does | Govt needed? | Build on |
|---------|--------------|--------------|----------|
| **NGO & private resource directory** | Hospitals, clinics, safe houses, legal aid, mental health — by state/LGA | No — curated by NGOs/partners | New `resources` collection |
| **Trusted reporter weight** | After N verified reports, votes count more | No | `users.reporter_score` |
| **CSO / radio partner badge** | Human rights org, station verifies moderator | No — private MOU | `groups.verified_partner` |
| **Merchant / driver micro-trust** | Post-trip 1-tap “felt safe” → route score | No | Extend route ratings |
| **False alert reporting** | Community + auto cooldown on device | No | `reports` + strikes |

#### E. Advanced (longer horizon)

| Feature | What it does | Govt needed? | Notes |
|---------|--------------|--------------|-------|
| **Bluetooth/Wi-Fi mesh panic** | Alert phones ~100m when cell is down | No | Native Android; not web |
| **School / worship batch check-in** | One organizer, many attendees | No | B2B2C via institutions |
| **Insurer / logistics APIs** | Fleet journeys, risk scores | No — commercial | Optional revenue |

---

### 12.3 What to avoid (or keep strictly optional)

| Anti-pattern | Why |
|--------------|-----|
| Mandatory NIN / police DB linkage | Trust collapse; single point of failure |
| Publishing named “suspects” | Legal harm; vigilante risk |
| SMS blast to all users in a state | Cost (see §9), spam, panic |
| Claiming official government authority | Regulatory exposure |
| Platform-initiated police dispatch | Liability; requires licensed partnership |

**Acceptable:** Display police/NEMA numbers in `EMERGENCY_CONTACTS` as **“services you may call yourself”** — user-initiated, not SafeAlert-dependent.

---

### 12.4 Trust model without government ID

| Mechanism | Implementation |
|-----------|----------------|
| Community confirm/clear | Existing zone algorithm (§README) |
| Phone OTP + device reputation | `authService`, rate limits |
| Trusted reporter tier | `users.verified_reporter` after N accepted reports |
| NGO partner badge | Manual onboarding + `groups.partner_id` |
| Location fuzzing in public APIs | Round coords; no home addresses in push body |
| Moderation queue | Reported zones/users; CSO admins |

---

### 12.5 Phased rollout (citizen features)

| Phase | Features | Est. effort | Depends on |
|-------|----------|-------------|------------|
| **C1** | Safe check-in, wire panic broadcast UI, NGO resource directory (JSON/Firestore) | 2–3 weeks | Auth, SMS |
| **C2** | Hyperlocal group geofences, safe corridor push, scam/checkpoint types | 3–4 weeks | Geohash (§6) |
| **C3** | Verified responders, convoy journeys, responder map | 4–6 weeks | Proximity Phases 4–5 |
| **C4** | i18n USSD, voice reports, trusted reporter weights | 4–8 weeks | Storage, moderation |
| **C5** | Mesh, airtime gift, insurer hooks | 3+ months | Partners |

Run **C1** in parallel with proximity **Phases 1–2**; defer **C3** until geospatial index is live.

---

### 12.6 Data model additions (citizen features)

```
users/{id}
  help_nearby_enabled, help_nearby_radius_km
  responder_skills: string[]          // e.g. ["first_aid","mechanic"]
  verified_reporter: boolean
  reporter_score: number
  preferences: { night_mode, women_mode, language }

check_ins/{id}
  user_id, due_at, circle_notify, status, created_at

journey_sessions/{id}
  organizer_id, member_ids[], started_at, ended_at, shared_map

groups/{id}
  name, geofence_center, geofence_radius_km
  admin_ids[], verified_partner, member_count

resources/{id}
  type: hospital | clinic | safe_house | legal | mental_health
  name, phone, state, lga, lat, lng, verified_by_ngo, active

route_ratings/{id}
  route_id, user_id_hash, score, felt_safe, created_at
```

---

### 12.7 API sketch (new endpoints)

```
# Check-in
POST   /check-in              { due_at, notify_circle }
POST   /check-in/:id/confirm  — I'm safe
GET    /check-in/active       — circle view (auth)

# Responders
PUT    /user/responder-profile   { skills[], available }
GET    /responders/nearby        ?lat&lng&radius_km

# Resources (read-only public)
GET    /resources                ?state=&lga=&type=
GET    /resources/nearby         ?lat&lng&radius_km

# Convoy
POST   /journey/convoy           { member_phones[] | member_ids[] }
GET    /journey/convoy/:id       — shared status

# Groups (extend existing)
POST   /groups                   { name, geofence }  — admin
GET    /groups/:id/alerts        — zone feed in geofence

# Trust
POST   /zones/:id/report-false   { reason }
POST   /users/:id/vouch         — partner only
```

---

### 12.8 USSD menu expansion (no smartphone)

Suggested `*384*911#` tree (align with `ussdService.js`):

```
1. Report danger (pick type → optional location SMS)
2. Check route safety
3. Active alerts near me (LGA/state text summary)
4. Emergency numbers (NGO + optional police — user dials)
5. Alert my circle (registered users)
6. I'm safe (cancel check-in / panic if owner)
```

**Cost:** USSD session fees only; no FCM. Ideal for rural and 2G users.

---

### 12.9 Cost notes for citizen features

| Feature | Main cost driver | Scale note |
|---------|------------------|------------|
| Check-in SMS fallback | SMS count | Keep FCM primary; SMS only if no token |
| Voice reports | Cloud Storage + egress | Cap 10s; compress audio |
| Group geofence pushes | FCM (free) + Firestore reads | Use geohash scoped to group |
| Resource directory | Firestore reads (low) | Cache per state on CDN |
| Convoy location | Same as location pipeline (§9) | One ping per member, throttled |
| Mesh | None (P2P) | Engineering cost only |

**Citizen features do not require SMS to strangers** — same rule as proximity (§9.4).

---

### 12.10 Sustainability without government budget

| Model | Who pays | Fits citizen mission |
|-------|----------|----------------------|
| **Free core** | NGO grant / CSR | Reports, circle, USSD danger list |
| **Partner sponsorship** | Radio, telco, insurer | “Lagos corridor powered by …” |
| **B2B** | Logistics fleets, schools | Convoy + journey admin dashboard |
| **Premium (optional)** | Power users | Larger circle, voice reports, verified badge |

Core safety must stay free to avoid excluding low-income users.

---

### 12.11 Priority matrix (impact vs effort)

| Priority | Feature | Why (Nigeria context) |
|----------|---------|------------------------|
| **P0** | Nearby helpers + check-in + broadcast UI | Immediate life safety |
| **P0** | USSD report + circle alert | Inclusion on 2G / feature phones |
| **P1** | Hyperlocal groups + safe corridor notifications | Daily use, retention |
| **P1** | NGO/resource directory | Help without waiting on state |
| **P2** | Convoy mode + scam/checkpoint types | Roads, markets, urban fraud |
| **P2** | Verified responder skills | Peer help at scale |
| **P3** | Voice/i18n, mesh, airtime gifts | Broader reach; partner-dependent |

---

### 12.12 Citizen features launch checklist

- [ ] Copy clarifies: community intelligence, not government dispatch
- [ ] Emergency contacts labeled “call at your own discretion”
- [ ] No named suspects in public UI
- [ ] Group admins agree to moderation guidelines
- [ ] NGO resources reviewed quarterly
- [ ] USSD tested on MTN, Airtel, Glo (staging)
- [ ] False-alert path live before scaling marketing

---

## Appendix A — Environment variables to add

```env
# Proximity & location
PROXIMITY_ALERTS_ENABLED=true
PANIC_AUTO_BROADCAST_ENABLED=true
LOCATION_MIN_INTERVAL_SEC=300
LOCATION_TTL_MINUTES=45
HELP_NEARBY_MAX_RADIUS_KM=15
PANIC_BROADCAST_COOLDOWN_SEC=600
SMS_NEARBY_CRITICAL_ENABLED=false
SMS_NEARBY_MAX_RECIPIENTS=50

# Queue (Phase 4+)
PUBSUB_TOPIC_PANIC_NOTIFY=panic-notify
```

---

## Appendix B — Reference files in this repo

| File | Purpose |
|------|---------|
| `src/services/geoService.js` | Nearby user lookup (upgrade here first) |
| `src/routes/index.js` | Panic, zones, location, FCM token routes |
| `src/services/pushService.js` | FCM multicast |
| `src/services/smsService.js` | Circle SMS |
| `src/config/appConfig.js` | Radius & thresholds |
| `public/app.js` | Client panic, journey, location ping |

---

## Appendix C — Suggested implementation order (summary)

**Proximity & scale**

1. **Opt-in preferences** (legal + cost gate)  
2. **Throttled location pipeline** + TTL  
3. **Geohash / Redis** (before marketing push to millions)  
4. **Async panic worker** + auto nearby FCM  
5. **FCM client registration** (web + native)  
6. **Responder APIs** + map UX  
7. **Load test + cost alerts**  
8. **Launch region-by-region** (Lagos → Abuja → national)

**Citizen features (§12)** — in parallel where possible

1. **C1:** Check-in, resource directory, USSD circle alert  
2. **C2:** Hyperlocal groups, safe corridors, new incident types  
3. **C3:** Responders, convoy, full map responder UX  

---

*This document should be updated as implementation progresses. See also:*

- **[Serious launch — budget, deployment & Phases 1–2 build guide](SERIOUS_LAUNCH_DEPLOYMENT.md)** — thousands of users, proximity on.
- **`README.md`** → Documentation.
