# SafeAlert NG — Production Reference

Everything required for a **serious launch** (thousands of users, proximity on).

---

## Quick deploy

```bash
cp .env.example .env          # fill all production values
npm install
npm run validate-env          # must pass with NODE_ENV=production
firebase deploy --only firestore:rules,firestore:indexes
npm start                     # or: docker build -t safealert . && docker run -p 8080:8080 --env-file .env
```

---

## Architecture (production)

| Layer | Implementation |
|-------|----------------|
| API | `src/server.js` — Helmet, CORS, rate limits, env validation |
| Auth | JWT + OTP in Firestore `otps` |
| DB | Firestore via `firebase-admin` (`USE_MEMORY_DB=false`) |
| Geospatial | Geohash on `locations` + composite indexes |
| Proximity | Opt-in `help_nearby_enabled`, FCM to nearby helpers |
| Panic | `panic_events` collection, async notify queue, cooldown |
| Push | FCM Admin + web client (`public/js/fcm*.js`) |
| SMS | Africa's Talking (circle + OTP) |
| Static UI | `public/` at `/app/` |

---

## API endpoints (production)

### Public
- `GET /v1/health` — status + `database: firestore|memory`
- `GET /v1/config/public` — Firebase web config for FCM
- `GET /v1/zones`, `POST /v1/zones`, …
- `GET /v1/settings`

### Auth (rate limited)
- `POST /v1/auth/request-otp`
- `POST /v1/auth/verify-otp`

### User (auth required)
- `GET/PUT /v1/user/preferences`
- `PUT /v1/user/location` (throttled)
- `PUT /v1/user/fcm-token`
- `GET/PUT /v1/user/circle`

### Panic
- `POST /v1/panic/activate` → **202** async notifications
- `POST /v1/panic/deactivate`
- `POST /v1/panic/broadcast` → **202** queued
- `GET /v1/panic/nearby?lat=&lng=&radius_km=`
- `GET /v1/panic/:id`
- `POST /v1/panic/:id/respond`

---

## Environment (required in production)

See `.env.example`. Critical:

| Variable | Rule |
|----------|------|
| `NODE_ENV` | `production` |
| `USE_MEMORY_DB` | `false` |
| `SEED_REVIEW_DATA` | `false` |
| `DEV_FIXED_OTP` | **unset** |
| `JWT_SECRET`, `HASH_SECRET`, `ENCRYPTION_KEY` | 32+ chars, not defaults |
| `FIREBASE_*` | Service account credentials |
| `FIREBASE_WEB_*` | For browser push |
| `CORS_ORIGINS` | Your app domain(s) |

Run: `npm run validate-env`

---

## Firestore collections

| Collection | Purpose |
|------------|---------|
| `users` | Profile, circle, preferences, FCM token |
| `locations` | Geohashed live positions (TTL) |
| `panic_events` | Active panics, responders |
| `zones`, `reports` | Incident map |
| `routes`, `groups` | Community data |
| `otps` | Login codes (short TTL) |

Deploy rules: `firestore.rules` (API-only access via Admin SDK).

---

## Source layout

```
src/
  config/       firebase.js, appConfig.js, envValidate.js, memoryDb.js
  middleware/   auth.js, validate.js, rateLimiter.js
  services/     panicService.js, locationService.js, geoService.js,
                otpStore.js, notifyQueue.js, pushService.js, …
  routes/       index.js
  utils/        geohash.js, geo.js, crypto.js
public/
  app.js        Main UI
  js/fcm.js     FCM token registration
  js/fcm-init.js Firebase CDN loader
```

---

## Mobile apps

iOS and Android ship via **Flutter** (`flutter_app/`) — see [MOBILE_IOS_ANDROID.md](./MOBILE_IOS_ANDROID.md).

## Cost & rollout

See [SERIOUS_LAUNCH_DEPLOYMENT.md](./SERIOUS_LAUNCH_DEPLOYMENT.md) for monthly budgets (₦260K–1.35M) and phased marketing.

---

## Kill switches

```env
PROXIMITY_ALERTS_ENABLED=false
PANIC_AUTO_BROADCAST_ENABLED=false
PANIC_SMS_ENABLED=false
PUSH_NOTIFICATIONS_ENABLED=false
```

Restart API after changing.
