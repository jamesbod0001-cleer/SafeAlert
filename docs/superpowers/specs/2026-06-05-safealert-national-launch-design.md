# SafeAlert NG — National Launch & 90-Day Roadmap Design

**Date:** 2026-06-05  
**Status:** Approved  
**Scope:** Public launch (all 36 states + FCT), product polish, technical scale, fundraising readiness

---

## 1. Goals (60–90 days)

SafeAlert NG will pursue four parallel outcomes:

| Goal | Success criteria |
|------|------------------|
| **Public launch** | Nationwide from day one; 3,000–5,000 MAU; national ads → web PWA |
| **Product polish** | Web reference + Flutter FCM/i18n/offline parity by week 8 |
| **Technical scale** | Load test at target MAU; durable notify queue or documented deferral |
| **Fundraising** | Investor deck + live transparency metrics from week 4 |

**Approach:** Parallel workstreams (Foundation → Launch/Fundraise → Mobile/Admin → Scale/Growth), not sequential single-goal phases.

---

## 2. Launch model — all states in Nigeria

### 2.1 Principles

- **Every state is first-class:** stats, offline packs, radio bulletin, leader recruitment.
- **Cold-start states get data:** ACLED/HDX sync + pre-built offline packs so maps are not empty.
- **Citizen reports are the trust signal:** ACLED seeds high-risk areas; community confirms over time.
- **Languages match geography:** Pidgin (national ads), Hausa (North), Yoruba (SW), Igbo (SE).
- **Marketing is national:** one campaign + per-state community radio (`GET /v1/radio/bulletin?state=`).

### 2.2 Critical codebase gap (launch blocker)

`src/config/nigeriaStates.json` currently defines **10 states**. Functions that depend on it:

- `guessState()` in `src/utils/geo.js` — returns `"Nigeria"` for unmapped coordinates
- `offlinePackService.js` — returns `Unknown state` for missing bounds
- Insights/transparency `by_state` breakdown

**Requirement:** Replace with all **36 states + FCT** (37 regions) before national go-live.

### 2.3 Week 3–6 national targets

| Metric | Target |
|--------|--------|
| States with ≥1 active zone (citizen or ACLED) | 37/37 |
| States with downloadable offline pack | ≥20 (prompt on onboarding) |
| Registered users (national MAU) | 3,000–5,000 |
| Verified community leaders | ≥2 per geopolitical zone (12 minimum) |

### 2.4 Budget alignment

| Phase | Monthly burn |
|-------|--------------|
| Weeks 1–6 (lean national) | ~₦260K–720K/mo |
| Weeks 7–12 (target growth) | ~₦720K–1.35M/mo |
| Recommended reserve | ₦2M–3M runway |

National ads push toward Target–Hot tier vs Lagos-only lean launch.

---

## 3. 90-day roadmap

### Week 1–2: Foundation (all tracks)

**Remove**

- Root `server.js` (broken legacy; real entry is `src/server.js`)
- Hardcoded App Runner URL in `package.json` flutter scripts → env var
- Simulated/demo data from production Firestore (`scripts/purge-simulated-data.js`)

**Enhance**

- Full 37-state `nigeriaStates.json`
- Fix `api.test.js`: jest/supertest, `/v1` paths, `npm test` script
- Sync docs: update or supersede stale §2 in `PROXIMITY_ALERTS_IMPLEMENTATION.md`
- Init git; verify credentials gitignored
- CI: `validate-env` + smoke test on push
- Legal: `/privacy.html`, `/terms.html`, in-app panic disclaimer

**Add**

- `scripts/build-offline-packs-all-states.js` + nightly pre-generation
- Basic monitoring: health alerts, Firestore/SMS usage logging

**Exit criteria:** `npm test` passes, `validate-env` passes, legal pages live, no demo data in prod, all 37 offline packs buildable.

### Week 3–6: National launch + fundraise demo

**Launch**

- National ads → `/app/` PWA (not geo-limited to Lagos)
- Production Africa's Talking + FCM web tokens
- Kill switch tested: `PROXIMITY_ALERTS_ENABLED`
- Onboarding: OTP → circle → help_nearby (default off) → state detect → offline pack offer

**Fundraise**

- Investor one-pager (problem, traction, unit economics from `SERIOUS_LAUNCH_DEPLOYMENT.md`)
- Live demo: report zone → confirm → panic → nearby helper
- Transparency page on real stats (`GET /v1/transparency`)

**Polish (web)**

- Data saver default prompt outside major metros
- WhatsApp bot E2E (Meta webhook)
- Per-state leader recruitment promoted on Trust screen

**Exit criteria:** 500+ registered users, <1% 5xx, panic E2E <5s to circle SMS, investor deck ready.

### Week 5–10: Mobile parity + admin

**Flutter**

- Firebase platform configs (`google-services.json`, `GoogleService-Info.plist`)
- FCM token registration (`lib/core/notifications/push_service.dart`)
- i18n: port keys from `public/js/i18n.js` → `lib/core/i18n/app_i18n.dart`
- Offline pack download to device storage
- App Store / Play Store listings

**Backend**

- Split `src/routes/index.js` into domain routers (no API contract change)
- Admin UI at `/admin/`: leader verify, false-report queue, proximity kill switch, per-state moderation

**Exit criteria:** Flutter on TestFlight/Internal Testing, push works, admin verifies leaders without curl.

### Week 9–12: Scale validation + growth

**Scale**

- Replace in-memory `notifyQueue.js` with Pub/Sub + worker (or Firestore `notify_jobs` if MAU <5K)
- k6 load test: 500 helpers across Lagos + Kano + Port Harcourt geohash cells
- Firestore index review under load

**Growth**

- Field agent flow promoted nationally
- School safety pilot (2–3 schools)
- Post-trip route safety feedback

**Fundraise close**

- Update deck with 90-day metrics
- First public monthly transparency report

**Exit criteria:** Load test passes, notify queue durable or deferral documented, fundraising materials updated.

### Explicitly deferred

| Item | Rationale |
|------|-----------|
| USSD NCC shortcode | ₦500K–2M setup; sandbox/demo until DAU justifies |
| Redis geospatial | Firestore geohash sufficient until p95 >200ms |
| SMS to strangers in radius | Cost + spam; FCM only |
| Government API integrations | Out of scope by design |
| Full `app.js` rewrite | Incremental module extraction only |

---

## 4. Architecture

### 4.1 Nigeria geo coverage

- Replace `nigeriaStates.json` with 37 bounding boxes (border overlap acceptable; first match wins; user can override in report UI).
- Nightly cron pre-generates `data/offline-packs/{state}.json`.
- `guessState(lat, lng)` returns state name inside Nigeria; outside → `"Nigeria"`.

### 4.2 Route split (week 5–10)

```
src/routes/
  index.js, auth.routes.js, zones.routes.js, panic.routes.js,
  user.routes.js, journey.routes.js, community.routes.js,
  webhooks.routes.js, admin.routes.js, public.routes.js
```

Internal refactor only — no breaking API changes.

### 4.3 Notify queue (week 9–12)

```
POST /panic/activate → 202 → Pub/Sub panic-notify → worker → FCM + SMS
```

Intermediate fallback if MAU <5K: Firestore `notify_jobs` collection instead of in-memory queue.

### 4.4 Admin moderation

Password-protected `/admin/` static page:

- Verify community leaders (replaces curl + `X-Import-Secret`)
- False-report flag queue
- Proximity kill switch → `app_settings`
- Per-state zone moderation filter

Auth: `ADMIN_SECRET` header; not exposed publicly.

### 4.5 Data pipeline (all states)

| Source | Role |
|--------|------|
| ACLED live sync | National conflict seed data |
| HDX sync | Humanitarian resources |
| Citizen reports | Primary trust signal |
| Offline packs | 2G/offline per state |

Production: `blockSimulatedData` blocks `safealert_starter`; ACLED zones labeled `source: acled`.

---

## 5. Client parity

### 5.1 Web PWA (primary launch channel)

| Feature | National requirement |
|---------|---------------------|
| Onboarding | GPS → state → offline pack download offer |
| Insights | All 37 states in breakdown; zero states show "Be the first to report" |
| Report | State pre-filled; manual override |
| i18n | en/ha/yo/ig/pcm |
| Voice + icon modes | Promoted in onboarding (literacy) |
| Data saver | Default-on prompt for 2G-heavy areas |
| Trust | Per-state leaders, agents, offline packs |

### 5.2 Flutter (parity by week 8)

| Priority | Feature |
|----------|---------|
| P0 | FCM push, state onboarding + offline pack |
| P1 | Full i18n, offline pack to device |
| P2 | Voice mode (defer if needed), deep links |

### 5.3 Launch channels

| Channel | When |
|---------|------|
| Web PWA + national ad | Week 3 (primary) |
| WhatsApp bot | Week 3–6 |
| USSD sandbox | Demo only |
| Community radio | Per-state scripts |
| App stores | Week 8+ |

---

## 6. Remove / enhance / add summary

### Remove

- `server.js` (root)
- Hardcoded App Runner URLs in `package.json`
- Demo data in production
- Stale PROXIMITY doc §2 gap list (update or mark historical)

### Enhance

- 37-state geo config, offline pack pre-build, test harness, legal pages, doc sync, route split, admin UI, app.js modularization, CI

### Add

- State picker in onboarding, "first reporter" badge, per-state leader recruitment, national transparency stats, investor materials, Pub/Sub worker, multi-state load test, App Store listings, route feedback

---

## 7. Testing, monitoring, runbooks

### 7.1 Testing

| Layer | Pass criteria |
|-------|---------------|
| API (`npm test`) | Auth, zones, panic, preferences green |
| Smoke | All endpoints incl. per-state offline pack |
| E2E manual | Report in Lagos, Kano, Enugu — state correct |
| Panic E2E | Circle SMS + nearby FCM <5s |
| Load (k6) | 500 users, 5 state cells, p95 notify <3s, 0% 5xx |
| Flutter | Push token + state onboarding on TestFlight |

### 7.2 Monitoring alerts

| Metric | Threshold |
|--------|-----------|
| API 5xx | >0.5% / 5 min |
| Panic → first SMS | p95 >10s |
| Firestore reads/day | >80% budget |
| AT SMS/day | >daily cap |
| States with 0 citizen reports (7d) | Outreach flag |
| ACLED sync failure | Immediate alert |

### 7.3 National launch runbook

```
T-7  37-state geo + offline packs complete
T-3  Purge demo data; validate-env; firestore deploy
T-2  Multi-state load test; legal pages live
T-1  Kill switches + admin UI; radio scripts for 6 zones
T-0  National ads + WhatsApp; 24h monitoring
T+1  Per-state signup review; recruit leaders in empty states
T+7  First transparency report; investor deck update
```

### 7.4 Incident runbook

| Incident | Action |
|----------|--------|
| Mass false panic | Disable proximity via admin |
| SMS cost spike | Raise cooldown; cap AT daily spend |
| State misinformation | Admin freeze zone + leader review |
| Firestore quota | Fallback mode; throttle location writes |

---

## 8. Non-negotiable before week 3 go-live

1. Full `nigeriaStates.json` (37 regions)
2. Offline packs for all states
3. Legal pages + panic disclaimer
4. Per-state transparency stats (including zeros)
5. Multi-language onboarding in national ad creative

---

*Approved by product owner: 2026-06-05*
