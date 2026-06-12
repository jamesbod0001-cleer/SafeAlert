# SafeAlert NG — Backend API

Community-powered safety intelligence platform for Nigeria.

## Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** Firebase Firestore (real-time, offline-capable)
- **Auth:** Custom OTP via Africa's Talking SMS
- **SMS/USSD:** Africa's Talking API
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Maps:** OpenStreetMap (client-side only — free)

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-org/safealert-ng-backend
cd safealert-ng-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Firebase and Africa's Talking credentials

# 3. Run in development
npm run dev

# 4. Run in production
npm start
```

---

## Environment Setup

### Firebase Setup
1. Go to https://console.firebase.google.com
2. Create a new project named `safealert-ng`
3. Enable Firestore (production mode)
4. Go to Project Settings → Service Accounts → Generate new private key
5. Copy `project_id`, `private_key`, `client_email` into your `.env`
6. Enable Firebase Cloud Messaging in the console
7. Deploy Firestore rules: `firebase deploy --only firestore:rules`
8. Create indexes: `firebase deploy --only firestore:indexes`

### Africa's Talking Setup
1. Register at https://africastalking.com
2. Create an account for Nigeria
3. Get your API key from the dashboard
4. Register your shortcode (or use sandbox shortcode for testing)
5. Apply to NCC for USSD code: https://ncc.gov.ng

---

## API Reference

Base URL: `https://api.safealertng.com/v1`

### Authentication
```
POST /auth/request-otp     — Send OTP
POST /auth/verify-otp      — Verify OTP → get token
POST /auth/logout          — Revoke token
```

### Zones (Incident Reports)
```
GET    /zones              — All active zones (?lat&lng&radius)
GET    /zones/:id          — Single zone
POST   /zones              — Report incident (creates/merges zone)
PATCH  /zones/:id/confirm  — Confirm still dangerous (auth required)
PATCH  /zones/:id/clear    — Mark as cleared (auth required)
```

### Panic
```
POST /panic/activate       — Activate panic (SMS circle + push)
PUT  /panic/location       — Update GPS during panic
POST /panic/deactivate     — End panic
POST /panic/broadcast      — Broadcast to nearby users
```

### Journey
```
POST /journey/start        — Start sharing live GPS
PUT  /journey/location     — Update GPS (call every 60s)
POST /journey/end          — End journey safely
GET  /journey/:userId      — Get circle member's live location
```

### User
```
GET    /user/profile       — Get profile
PUT    /user/profile       — Update profile + FCM token
PUT    /user/circle        — Update safety circle (max 5)
```
Account deletion is available in-app under **Settings & account** (signed-in users). It permanently removes profile, circle, and preferences.

### Routes
```
GET /routes                — All monitored routes with safety scores
GET /routes/check          — Check specific route (?from=Lagos&to=Abuja)
```

### USSD & SMS
```
POST /ussd                 — Africa's Talking USSD webhook
POST /ussd/sms-inbound     — Africa's Talking SMS webhook
```

---

## Key Design Decisions

### Privacy First
- Phone numbers **never stored in plain text** — SHA-256 hashed with secret
- Circle contacts AES-256 encrypted — only decrypted at SMS send time
- Live locations **deleted immediately** when journey/panic ends
- No government API access built in — reports are citizen-only

### Offline Resilience
- Firebase Firestore has built-in offline persistence
- Reports queued locally when no internet, synced on reconnection
- SMS panic fires via Africa's Talking — works on 2G with no data
- USSD (*384*911#) works on any phone with a SIM — zero data needed

### Zone Verification Algorithm
1. New report → severity: "medium", verified: false
2. 3+ community confirms → verified: true
3. 5+ confirms → severity: "high"
4. 10+ confirms → severity: "critical" + push notify within 30km
5. 70%+ "cleared" votes → zone deactivated automatically
6. 6h no activity → severity drops one level
7. 24h no reports → zone expires

---

## Deployment

### Firebase Hosting (recommended)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting functions
firebase deploy
```

### Cloud Run (for scalable API)
```bash
gcloud run deploy safealert-api \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production
```

### Simple VPS (cheapest option — DigitalOcean $6/month)
```bash
# On the server:
npm install -g pm2
pm2 start src/server.js --name safealert-api
pm2 startup
pm2 save
```

---

## Testing

```bash
npm test   # API integration suite (Jest + Supertest) — works out of the box

# Test individual endpoints with curl:
curl http://localhost:3000/health
curl http://localhost:3000/v1/zones
```

---

## Documentation

- **[Production reference](docs/PRODUCTION.md)** — deploy steps, API list, env vars, Firestore schema.
- **[Serious launch — budget, deployment & build guide](docs/SERIOUS_LAUNCH_DEPLOYMENT.md)** — costs (~₦260K–1.35M/mo), Phases 1–5 **implemented in code**.
- **[Proximity & citizen features](docs/PROXIMITY_ALERTS_IMPLEMENTATION.md)** — national scale architecture and roadmap.

## Production commands

```bash
npm run validate-env   # NODE_ENV=production — must pass before deploy
npm start              # production server (port from PORT)
npm run dev            # local dev with memory DB + review seed
```

## iOS & Android apps

Native apps now use **Flutter** (`flutter_app/`) while the web app remains at `/app/`.
See **[docs/MOBILE_IOS_ANDROID.md](docs/MOBILE_IOS_ANDROID.md)**. Set the API base URL with `export SAFEALERT_API=https://your-api/v1` (defaults to `http://localhost:3000/v1`).

```bash
cd flutter_app
flutter pub get
flutter run --dart-define=SAFEALERT_API=https://api.yourdomain.com/v1
```

---

*SafeAlert NG — Built by Nigerians. For every Nigerian.*
