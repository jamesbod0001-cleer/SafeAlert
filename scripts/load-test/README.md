# SafeAlert NG — k6 load tests

National-scale validation scripts for multi-state launch readiness (Lagos, Kano, Rivers / Port Harcourt and nationwide zone reporting).

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

Start the API locally (`npm run dev`) or point at **staging** — never production without kill switches enabled.

## Auth token (panic test)

`k6-panic.js` requires a valid JWT via `TOKEN`.

**Local / dev** (with `DEV_FIXED_OTP` in `.env`):

```bash
curl -s -X POST http://localhost:3000/v1/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"08012345678"}'

curl -s -X POST http://localhost:3000/v1/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"08012345678","otp":"123456"}' | jq -r .token
```

Or run `npm run review` — it prints auth success and uses the same flow.

For realistic 500-VU panic load, use **multiple test accounts** (one token per VU pool) so activations are not blocked by `409` (already active) or cooldown limits.

## Commands

```bash
# Panic + state-filtered zones (500 VUs, 5m) — Lagos, Kano, Rivers
k6 run -e API=http://localhost:3000 -e TOKEN=xxx scripts/load-test/k6-panic.js

# Nationwide zone reports (200 VUs, 5m) — random coords in Nigeria bounds
k6 run -e API=http://localhost:3000 scripts/load-test/k6-zones.js

# Staging (recommended before national launch)
k6 run -e API=https://staging.api.safealert.ng -e TOKEN=xxx scripts/load-test/k6-panic.js
k6 run -e API=https://staging.api.safealert.ng scripts/load-test/k6-zones.js
```

npm shortcuts (pass env vars as above or export them first):

```bash
npm run loadtest:panic
npm run loadtest:zones
```

## Pass criteria

Both scripts enforce:

| Metric | Threshold |
|--------|-----------|
| `http_req_failed` | &lt; 1% |
| `http_req_duration` p(95) | &lt; 3000 ms |

Additional expectations:

- **Panic:** `POST /v1/panic/activate` returns `202` (async notify queued); `GET /v1/zones?state=` returns `200` for Lagos, Kano, and Rivers.
- **Zones:** `POST /v1/zones` returns `201` with a `zone.id`.
- No sustained **5xx** responses under load.

## Security probe (staging)

`k6-security-probe.js` verifies anonymous routes stay locked, webhooks reject forgeries, and invalid zone coords fail:

```bash
k6 run scripts/load-test/k6-security-probe.js -e API=https://staging.example.com -e TOKEN=eyJ...
```

Automated security + scaling tests (no k6 required):

```bash
npm run test:security
npm run test:scaling
```

## Staging vs production

Run load tests against **staging** only. Before national multi-state launch:

1. Confirm `PROXIMITY_ALERTS_ENABLED` and admin kill switches are understood — a full panic load test against production can trigger real SMS/FCM unless notifications are disabled.
2. Purge simulated data after tests: `node scripts/purge-simulated-data.js` (see `npm run launch:check`).
3. Re-run `npm run launch:check` before T-0.

## National launch context

These scripts validate capacity across Nigeria’s three largest urban corridors (Lagos, Kano, Port Harcourt / Rivers) plus distributed community reporting at national bounding-box scale — aligned with the 37-state offline pack and multi-state rollout checklist in `scripts/national-launch-checklist.js`.
