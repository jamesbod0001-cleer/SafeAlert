# SafeAlert NG — Unified Launch Implementation Plan

> **Goal:** Ship hub-and-spoke launch tooling for pilot (A), national data (B), investor demo (C), and production deploy (D).

**Architecture:** Orchestration scripts + env tier templates + stricter launch checklist; deploy script already unsets `DEV_FIXED_OTP`.

---

## Implemented in repo

- [x] `scripts/unified-launch-pipeline.js` — ACLED → HDX → fallback → offline packs → verify
- [x] `scripts/verify-offline-packs.js` — zone count per state + pilot target
- [x] `scripts/pilot-readiness-check.js` — SMS/FCM/admin/pilot zone checks
- [x] `scripts/fill-fundraise-metrics.js` — transparency → one-pager table
- [x] `.env.staging.example` / `.env.production.example`
- [x] `setup:secrets` generates ADMIN_SECRET + IMPORT_JOB_SECRET
- [x] Enhanced `launch:check` (polygons, pack zones, admin, AT prod)
- [x] npm scripts: `launch:pipeline`, `pilot:check`, `fundraise:metrics`

## Operator steps (you run)

- [ ] `npm run launch:pipeline` against Firestore
- [ ] Apply for AT production + `AT_SENDER_ID`
- [ ] `npm run deploy:aws` with production env values
- [ ] `npm run demo https://your-staging-url`
- [ ] 2-phone FCM test (manual)
- [ ] Add `google-services.json` to Flutter
