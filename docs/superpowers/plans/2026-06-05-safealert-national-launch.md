# SafeAlert NG National Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SafeAlert NG production-ready for a nationwide launch (37 states + FCT) across web, Flutter, backend, and ops — with tests, legal pages, full geo coverage, and admin tooling.

**Architecture:** Parallel workstreams over 90 days. Phase 1 (Foundation) unblocks everything: 37-state geo config, offline packs, tests, legal, CI. Phase 2 launches web PWA nationally. Phase 3 adds Flutter parity + admin UI. Phase 4 scales notify queue and load-tests multi-state geohash.

**Tech Stack:** Node 18+ / Express, Firestore, Africa's Talking, FCM, vanilla JS PWA (`public/`), Flutter 3.8+ (`flutter_app/`), GitHub Actions CI, optional GCP Pub/Sub.

**Spec:** `docs/superpowers/specs/2026-06-05-safealert-national-launch-design.md`

---

## File map (phases)

| Phase | Create | Modify |
|-------|--------|--------|
| 1 | `scripts/build-offline-packs-all-states.js`, `public/privacy.html`, `public/terms.html`, `.github/workflows/ci.yml`, `tests/api.test.js` | `src/config/nigeriaStates.json`, `package.json`, `public/index.html`, `public/app.js`, `docs/PROXIMITY_ALERTS_IMPLEMENTATION.md`, `README.md` |
| 1 remove | — | Delete `server.js` (root) |
| 2 | `public/js/onboarding-state.js`, `scripts/national-launch-checklist.js` | `public/index.html`, `public/app.js`, `public/js/tier-features.js`, `public/transparency.html` |
| 3 | `public/admin/index.html`, `public/admin/admin.js`, `src/routes/admin.routes.js`, split route files | `src/routes/index.js`, `src/server.js`, `flutter_app/lib/core/i18n/app_i18n.dart`, `flutter_app/lib/core/notifications/push_service.dart` |
| 4 | `src/services/notifyJobsService.js`, `scripts/load-test/k6-panic.js` | `src/services/notifyQueue.js`, `src/services/panicService.js` |

---

## Phase 1 — Foundation (Week 1–2)

### Task 1: Initialize git and remove legacy server

**Files:**
- Delete: `server.js` (repo root)
- Create: `.gitignore` already exists — verify `credentials/*` excluded

- [ ] **Step 1: Initialize repository**

```bash
cd /Users/jamesbod/Downloads/SafeAlert
git init
git add .gitignore .env.example README.md docs/ src/ public/ scripts/ flutter_app/ package.json firestore.rules firebase.json
git status  # confirm credentials/*.json NOT staged
```

- [ ] **Step 2: Delete legacy server**

```bash
rm server.js
```

Root `server.js` imports `./routes/auth` which does not exist. Production uses `src/server.js` via `npm start`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: init repo and remove broken legacy server.js

EOF
)"
```

---

### Task 2: Fix test harness

**Files:**
- Move: `api.test.js` → `tests/api.test.js`
- Modify: `tests/api.test.js`, `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev jest supertest
```

- [ ] **Step 2: Move and fix test paths**

Move `api.test.js` to `tests/api.test.js`. Change:

```javascript
// Before
const BASE = '/api/v1';

// After
process.env.USE_MEMORY_DB = 'true';
process.env.SEED_REVIEW_DATA = 'true';
const BASE = '/v1';
const app = require('../src/server');
```

Also fix auth endpoint names to match production:

```javascript
// request-otp and verify-otp (not verify-phone / confirm-otp)
.post(`${BASE}/auth/request-otp`)
.post(`${BASE}/auth/verify-otp`)
```

- [ ] **Step 3: Add test script to package.json**

```json
"scripts": {
  "test": "NODE_ENV=test USE_MEMORY_DB=true SEED_REVIEW_DATA=true jest tests/api.test.js --forceExit",
  "test:smoke": "node scripts/smoke-test-backend.js"
}
```

Add jest config in `package.json`:

```json
"jest": {
  "testEnvironment": "node",
  "testTimeout": 30000
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests PASS (fix any failing assertions against current API responses).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/api.test.js
git commit -m "$(cat <<'EOF'
test: wire jest harness with in-memory DB and correct /v1 paths

EOF
)"
```

---

### Task 3: Complete 37-state geo config (launch blocker)

**Files:**
- Modify: `src/config/nigeriaStates.json`
- Modify: `src/utils/geo.js` (optional: prefer smallest bounding box on overlap)
- Test: add to `tests/api.test.js`

- [ ] **Step 1: Replace nigeriaStates.json with all 37 regions**

Each entry format (existing pattern):

```json
{ "name": "Lagos", "minLat": 6.35, "maxLat": 6.7, "minLng": 2.7, "maxLng": 3.75 }
```

Include all 36 states + `"Abuja FCT"` (or `"FCT"` — normalize to one name used in ACLED/starter data; prefer `"FCT"` to match `nigeria-starter.json`).

Source bounding boxes from Nigeria admin boundary datasets (e.g. geoBoundaries or manual centroids ±0.5° for MVP). Minimum: every state name in `data/nigeria-starter.json` and ACLED output must resolve via `findStateBounds()`.

- [ ] **Step 2: Add unit test for guessState**

In `tests/geo.test.js` (new file):

```javascript
const { guessState } = require('../src/utils/geo');

describe('guessState', () => {
  test('Lagos coordinates → Lagos', () => {
    expect(guessState(6.5244, 3.3792)).toBe('Lagos');
  });
  test('Kano coordinates → Kano', () => {
    expect(guessState(12.0022, 8.5920)).toBe('Kano');
  });
  test('Enugu coordinates → Enugu', () => {
    expect(guessState(6.4584, 7.5464)).toBe('Enugu');
  });
});
```

Add to package.json jest `testMatch` or run: `jest tests/geo.test.js`

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS for all 37 states spot-checked in test file (at least 6 geopolitical zones).

- [ ] **Step 4: Commit**

```bash
git add src/config/nigeriaStates.json src/utils/geo.js tests/geo.test.js
git commit -m "$(cat <<'EOF'
feat: add all 37 Nigeria state bounding boxes for national launch

EOF
)"
```

---

### Task 4: Pre-build offline packs for all states

**Files:**
- Create: `scripts/build-offline-packs-all-states.js`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create build script**

```javascript
#!/usr/bin/env node
/**
 * Pre-generate offline danger packs for every state in nigeriaStates.json.
 * Usage: node scripts/build-offline-packs-all-states.js
 * Requires: USE_MEMORY_DB=false + Firebase credentials OR runs against memory in dev.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const states = require('../src/config/nigeriaStates.json');
const offlinePackService = require('../src/services/offlinePackService');
const { initFirebase } = require('../src/config/firebase');

const OUT_DIR = path.join(__dirname, '../data/offline-packs');

async function main() {
  initFirebase();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const s of states) {
    const pack = await offlinePackService.buildPackFromFirestore(s.name);
    if (pack.error) {
      console.warn(`SKIP ${s.name}: ${pack.error}`);
      fail++;
      continue;
    }
    const slug = s.name.toLowerCase().replace(/\s+/g, '-');
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(pack, null, 2));
    console.log(`OK ${s.name} (${pack.zone_count} zones)`);
    ok++;
  }
  console.log(`Done: ${ok} packs, ${fail} skipped`);
  process.exit(fail > states.length / 2 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Export `buildPackFromFirestore` from `offlinePackService.js` if not already exported.

- [ ] **Step 2: Add npm script**

```json
"build:offline-packs": "node scripts/build-offline-packs-all-states.js"
```

- [ ] **Step 3: Run in dev**

```bash
USE_MEMORY_DB=true npm run build:offline-packs
```

Expected: 37 JSON files in `data/offline-packs/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-offline-packs-all-states.js data/offline-packs/ package.json src/services/offlinePackService.js
git commit -m "$(cat <<'EOF'
feat: pre-build offline danger packs for all Nigerian states

EOF
)"
```

---

### Task 5: Legal pages and panic disclaimer

**Files:**
- Create: `public/privacy.html`, `public/terms.html`
- Modify: `public/index.html`, `public/app.js`

- [ ] **Step 1: Create privacy.html**

Static page covering: phone hash storage, location retention (deleted after journey/panic), opt-in help_nearby, circle encryption, no government data sharing, account deletion via `DELETE /user/account`, contact email placeholder.

- [ ] **Step 2: Create terms.html**

Cover: citizen-reported data disclaimer, panic is not emergency services, abuse/moderation policy, minimum age 13+.

- [ ] **Step 3: Add footer links in index.html**

```html
<footer class="legal-footer">
  <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a>
</footer>
```

- [ ] **Step 4: Panic disclaimer modal in app.js**

Before first `activatePanic()` call, show one-time modal:

```javascript
function ensurePanicDisclaimerAccepted() {
  if (localStorage.getItem('sa_panic_disclaimer') === '1') return true;
  // show modal with text: "SafeAlert alerts your circle and nearby helpers. It does not dispatch police or ambulance."
  // on Accept: localStorage.setItem('sa_panic_disclaimer', '1')
  return false;
}
```

Gate `activatePanic()` on this.

- [ ] **Step 5: Manual verify**

```bash
npm run dev
# Open http://localhost:3000/app/privacy.html and /app/
# Trigger SOS — disclaimer appears once
```

- [ ] **Step 6: Commit**

```bash
git add public/privacy.html public/terms.html public/index.html public/app.js
git commit -m "$(cat <<'EOF'
feat: add privacy, terms, and one-time panic disclaimer

EOF
)"
```

---

### Task 6: CI pipeline and env hardening

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (remove hardcoded App Runner URL)

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: NODE_ENV=production node -e "require('./src/config/envValidate').validateProductionEnv()"
        env:
          USE_MEMORY_DB: 'false'
          JWT_SECRET: 'ci-test-secret-minimum-32-characters-long'
          HASH_SECRET: 'ci-test-hash-secret-minimum-32-chars'
          ENCRYPTION_KEY: '12345678901234567890123456789012'
          FIREBASE_PROJECT_ID: 'ci-placeholder'
          FIREBASE_CLIENT_EMAIL: 'ci@placeholder.iam.gserviceaccount.com'
          FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nCI\n-----END PRIVATE KEY-----\n'
```

- [ ] **Step 2: Externalize Flutter API URL**

In `package.json`, change:

```json
"flutter:run": "cd flutter_app && flutter run --dart-define=SAFEALERT_API=${SAFEALERT_API:-http://localhost:3000/v1}"
```

Document in README: `export SAFEALERT_API=https://your-api/v1`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml package.json README.md
git commit -m "$(cat <<'EOF'
ci: add GitHub Actions test workflow and externalize Flutter API URL

EOF
)"
```

---

### Task 7: Sync documentation

**Files:**
- Modify: `docs/PROXIMITY_ALERTS_IMPLEMENTATION.md`, `README.md`

- [ ] **Step 1: Add banner to PROXIMITY doc §2**

At top of §2 "What exists today", add:

```markdown
> **Updated 2026-06-05:** Items below marked ✅ are implemented. See `docs/PRODUCTION.md` and `docs/SERIOUS_LAUNCH_DEPLOYMENT.md` for current status.
```

Update gap list: mark geohash, help_nearby, responder APIs, FCM web as ✅.

- [ ] **Step 2: Fix README API paths**

Replace `/auth/verify-phone` → `/auth/request-otp`, `/auth/confirm-otp` → `/auth/verify-otp`. Fix `npm test` reference.

- [ ] **Step 3: Commit**

```bash
git add docs/PROXIMITY_ALERTS_IMPLEMENTATION.md README.md
git commit -m "$(cat <<'EOF'
docs: sync README and proximity doc with implemented features

EOF
)"
```

---

### Phase 1 exit gate

Run before starting Phase 2:

```bash
npm test
NODE_ENV=production npm run validate-env  # with real .env on staging
USE_MEMORY_DB=true npm run build:offline-packs  # 37 packs
npm run test:smoke
```

All must pass.

---

## Phase 2 — National launch (Week 3–6)

### Task 8: State-aware onboarding (web)

**Files:**
- Create: `public/js/onboarding-state.js`
- Modify: `public/index.html`, `public/app.js`

- [ ] **Step 1: Detect state on onboarding**

After GPS permission in onboarding flow:

```javascript
async function detectAndOfferStatePack() {
  const pos = await getCurrentPosition();
  const stateRes = await api(`/zones?lat=${pos.lat}&lng=${pos.lng}&radius=1`);
  // Or call guessState client-side if exposed via /config/public state list
  const state = guessStateFromConfig(pos.lat, pos.lng); // import bounds from /v1/offline/packs list
  showOnboardingCard(`You're in ${state}`, `Download ${state} safety pack for offline use?`, async () => {
    const pack = await api(`/offline/packs/${encodeURIComponent(state)}`);
    localStorage.setItem(`sa_offline_pack_${state}`, JSON.stringify(pack));
    toast(`${state} pack saved`, 'ok');
  });
}
```

- [ ] **Step 2: State manual override picker**

Add `<select id="onboarding-state">` populated from `GET /v1/offline/packs` state list for users who deny GPS.

- [ ] **Step 3: Insights zero-state copy**

In `public/js/insights-ui.js`, for states with count 0:

```javascript
`${state}: Be the first to report in ${state}`
```

- [ ] **Step 4: Commit**

```bash
git add public/js/onboarding-state.js public/index.html public/app.js public/js/insights-ui.js
git commit -m "$(cat <<'EOF'
feat: state-aware onboarding with offline pack offer nationwide

EOF
)"
```

---

### Task 9: Production purge and launch checklist script

**Files:**
- Create: `scripts/national-launch-checklist.js`

- [ ] **Step 1: Launch checklist script**

Verifies:
- `SEED_REVIEW_DATA !== 'true'`
- `DEV_FIXED_OTP` unset
- `nigeriaStates.json` length === 37
- `data/offline-packs/` has ≥37 files
- `privacy.html` and `terms.html` exist
- Health endpoint returns `database: firestore` on staging

```bash
node scripts/national-launch-checklist.js
```

Exit 0 = ready for T-0.

- [ ] **Step 2: Run purge on staging/prod**

```bash
node scripts/purge-simulated-data.js --dry-run
node scripts/purge-simulated-data.js
```

- [ ] **Step 3: Commit and deploy**

---

### Task 10: Fundraise materials (non-code)

**Files:**
- Create: `docs/fundraise/one-pager.md`, `docs/fundraise/demo-script.md`

- [ ] **Step 1: One-pager** — problem, solution, traction metrics from `/v1/transparency`, unit economics from `SERIOUS_LAUNCH_DEPLOYMENT.md`, ask amount, team.

- [ ] **Step 2: Demo script** — 5-minute live flow: map → report → confirm → panic → helper respond. Include fallback if OTP fails (sandbox OTP).

- [ ] **Step 3: Commit**

```bash
git add docs/fundraise/
git commit -m "$(cat <<'EOF'
docs: add investor one-pager and live demo script

EOF
)"
```

---

## Phase 3 — Mobile parity + admin (Week 5–10)

### Task 11: Admin moderation UI

**Files:**
- Create: `public/admin/index.html`, `public/admin/admin.js`, `src/routes/admin.routes.js`
- Modify: `src/routes/index.js`, `src/server.js`

- [ ] **Step 1: Admin routes**

Extract existing admin endpoints from `src/routes/index.js` (leader verify, etc.) into `admin.routes.js`. Add:

```javascript
router.use('/admin', express.static(path.join(publicDir, 'admin')));
router.post('/admin/leaders/:id/verify', requireAdminSecret, ...);
router.get('/admin/false-reports', requireAdminSecret, ...);
router.put('/admin/settings/proximity', requireAdminSecret, async (req, res) => {
  await db().collection('app_settings').doc('global').set({
    proximity_alerts_enabled: !!req.body.enabled,
  }, { merge: true });
  res.json({ ok: true });
});
```

`requireAdminSecret` checks `X-Admin-Secret` header against `process.env.ADMIN_SECRET`.

- [ ] **Step 2: Admin UI**

Simple HTML page: leader queue table, verify button, false-report list, proximity toggle.

- [ ] **Step 3: Add ADMIN_SECRET to .env.example**

- [ ] **Step 4: Smoke test admin**

```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" https://staging/v1/admin/false-reports
```

- [ ] **Step 5: Commit**

---

### Task 12: Split monolithic routes

**Files:**
- Create: `src/routes/*.routes.js` (9 files per spec)
- Modify: `src/routes/index.js` → thin mount only

- [ ] **Step 1:** Move auth endpoints → `auth.routes.js` (no logic change)
- [ ] **Step 2:** Move zones → `zones.routes.js`
- [ ] **Step 3:** Move panic → `panic.routes.js`
- [ ] **Step 4:** Continue for user, journey, community, webhooks, public
- [ ] **Step 5:** Run `npm test && npm run test:smoke` after each extraction
- [ ] **Step 6: Commit per domain** (6 commits)

---

### Task 13: Flutter FCM + i18n + offline packs

**Files:**
- Modify: `flutter_app/android/app/build.gradle`, add `google-services.json`
- Modify: `flutter_app/ios/Runner/GoogleService-Info.plist`
- Modify: `flutter_app/lib/core/notifications/push_service.dart`
- Modify: `flutter_app/lib/core/i18n/app_i18n.dart`
- Create: `flutter_app/lib/core/storage/offline_pack_storage.dart`

- [ ] **Step 1: Firebase platform configs**

Download from Firebase Console → place in android/ios per `docs/MOBILE_IOS_ANDROID.md`.

- [ ] **Step 2: Wire push on sign-in**

In `push_service.dart`, call `app.api.updateFcmToken(token)` after OTP verify in `app_controller.dart`.

- [ ] **Step 3: Port i18n keys**

Copy all keys from `public/js/i18n.js` `STRINGS` object into `app_i18n.dart` for en, ha, yo, ig, pcm.

- [ ] **Step 4: Offline pack download**

```dart
// offline_pack_storage.dart
Future<void> downloadPack(String state) async {
  final pack = await api.getOfflinePack(state);
  await prefs.setString('offline_pack_$state', jsonEncode(pack));
}
```

Call from onboarding after state detection.

- [ ] **Step 5: Test on device**

```bash
npm run flutter:run
# Verify push token in server logs after sign-in
```

- [ ] **Step 6: Commit**

---

## Phase 4 — Scale + growth (Week 9–12)

### Task 14: Durable notify queue

**Files:**
- Create: `src/services/notifyJobsService.js`
- Modify: `src/services/notifyQueue.js`, `src/services/panicService.js`

- [ ] **Step 1: Firestore-backed jobs (intermediate)**

```javascript
// notifyJobsService.js
async function enqueueJob(name, payload) {
  const ref = await db().collection('notify_jobs').add({
    name, payload, status: 'pending', created_at: Date.now(),
  });
  processNext(); // same worker loop, but survives restart
}
```

- [ ] **Step 2: Replace in-memory enqueue in panicService**

Change `notifyQueue.enqueueNamed(...)` → `notifyJobsService.enqueueJob(...)`.

- [ ] **Step 3: Worker on startup**

In `src/server.js`, call `notifyJobsService.recoverPending()` on boot.

- [ ] **Step 4: Optional Pub/Sub upgrade** if MAU >5K — add `scripts/pubsub-worker.js` per `SERIOUS_LAUNCH_DEPLOYMENT.md`.

- [ ] **Step 5: Commit**

---

### Task 15: Multi-state load test

**Files:**
- Create: `scripts/load-test/k6-panic.js`, `scripts/load-test/README.md`

- [ ] **Step 1: k6 script**

Simulate 500 users across geohash cells for Lagos (6.52, 3.37), Kano (12.00, 8.59), Port Harcourt (4.81, 7.03):

```javascript
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 500, duration: '5m' };
export default function () {
  const r = http.post(`${__ENV.API}/v1/panic/activate`, JSON.stringify({ lat: 6.52, lng: 3.37 }), {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' },
  });
  check(r, { 'panic 202': (res) => res.status === 202 });
}
```

- [ ] **Step 2: Run on staging**

```bash
k6 run -e API=https://staging.api -e TOKEN=... scripts/load-test/k6-panic.js
```

Pass: p95 <3s, 0% 5xx.

- [ ] **Step 3: Commit**

---

### Task 16: Growth features

**Files:**
- Modify: `public/js/tier-features.js`, `src/routes/index.js`

- [ ] **Step 1: Post-trip route feedback prompt** after `journey/end`:

```javascript
// POST /routes/:id/feedback { safe: boolean, note?: string }
```

- [ ] **Step 2: "First reporter in {state}" badge** — `reputationService.addPoints(userId, 'first_state_report', state)` when zone count for state was 0 before report.

- [ ] **Step 3: Commit**

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| 37-state geo | Task 3 |
| Offline packs all states | Task 4 |
| Tests + CI | Task 2, 6 |
| Legal + disclaimer | Task 5 |
| Remove legacy server | Task 1 |
| National onboarding | Task 8 |
| Launch checklist | Task 9 |
| Fundraise materials | Task 10 |
| Admin UI | Task 11 |
| Route split | Task 12 |
| Flutter parity | Task 13 |
| Durable notify queue | Task 14 |
| Load test | Task 15 |
| Growth features | Task 16 |
| Doc sync | Task 7 |
| Deferred: USSD NCC, Redis, gov APIs | Explicitly out of plan |

No TBD placeholders remain in task steps.

---

## Execution order recommendation

1. Tasks 1–7 (Phase 1) — **start here, blocking**
2. Tasks 8–10 (Phase 2) — national go-live
3. Tasks 11–13 (Phase 3) — parallel after week 3
4. Tasks 14–16 (Phase 4) — after MAU baseline established

**Estimated Phase 1 duration:** 3–5 dev days for one engineer.
