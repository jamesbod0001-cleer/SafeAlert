# Production credentials setup

Step-by-step guide to fill `.env` with **Firebase**, **Africa's Talking**, **strong secrets**, and **CORS** — then redeploy to App Runner.

**Time:** ~30–45 minutes (first time)

---

## Quick checklist

| Step | What | Status in `.env` |
|------|------|------------------|
| 1 | Strong secrets | ✅ Generated / synced from App Runner |
| 2 | CORS | ✅ App Runner + safealertng.com |
| 3 | Firebase Admin (Firestore) | ⏳ You add `serviceAccountKey.json` → `npm run setup:firebase` |
| 4 | Firebase Web (FCM in browser) | ⏳ You add `firebase-web-config.json` → `npm run setup:firebase-web` |
| 5 | Africa's Talking (SMS/OTP) | ⏳ You add username + API key → `npm run setup:at` |
| 6 | Redeploy | `./scripts/aws/deploy-apprunner.sh` |

---

## 1. Strong secrets (JWT, hash, encryption)

Already set in `.env` (synced with your live App Runner deployment).

To rotate:

```bash
npm run setup:secrets
./scripts/aws/deploy-apprunner.sh
```

| Variable | Requirement |
|----------|-------------|
| `JWT_SECRET` | 64+ hex chars |
| `HASH_SECRET` | 64+ hex chars |
| `ENCRYPTION_KEY` | Exactly 32 hex chars (AES-256) |

---

## 2. CORS

Production allows:

- `https://qrhtc5kg79.us-east-1.awsapprunner.com` (current API + web UI)
- `https://safealertng.com` (custom domain when DNS is pointed)

To add another origin, edit `CORS_ORIGINS` in `.env` (comma-separated, no spaces), then redeploy.

---

## 3. Firebase — Firestore + Admin SDK

### 3.1 Create project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. **Add project** → name e.g. `safealert-ng` → enable **Google Analytics** (optional)
3. Upgrade to **Blaze (pay as you go)** — required for production Firestore scale  
   - [Blaze upgrade](https://console.firebase.google.com/project/_/overview?billing)

### 3.2 Enable Firestore

1. **Build → Firestore Database → Create database**
2. Mode: **Production**
3. Region: `eur3` or `nam5` (pick closest; `eur3` is fine for Nigeria latency via Google backbone)

### 3.3 Service account key (server)

1. **Project settings** (gear) → **Service accounts**
2. **Generate new private key** → download JSON
3. Save as:

   ```
   credentials/serviceAccountKey.json
   ```

4. Run:

   ```bash
   npm run setup:firebase
   ```

   This sets `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `USE_MEMORY_DB=false`.

### 3.4 Deploy Firestore rules & indexes

Install Firebase CLI once:

```bash
npm install -g firebase-tools
firebase login
```

From project root (create `firebase.json` if missing — see below):

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Repo files: `firestore.rules`, `firestore.indexes.json`

### 3.5 Firebase Web app (FCM push in browser)

1. **Project settings → Your apps → Add app → Web** (`</>`)
2. Register app nickname: `SafeAlert Web`
3. Copy the `firebaseConfig` object into `credentials/firebase-web-config.json` (use `credentials/firebase-web-config.template.json` as guide)

4. **Build → Cloud Messaging**
   - **Web Push certificates** → generate key pair → copy **Key pair** into `vapidKey` in the same JSON

5. Run:

   ```bash
   npm run setup:firebase-web
   ```

### 3.6 Mobile (Flutter) — optional

- Android: download `google-services.json` → `flutter_app/android/app/google-services.json`
- iOS: download `GoogleService-Info.plist` → `flutter_app/ios/Runner/GoogleService-Info.plist`
- Then:

  ```bash
  cd flutter_app
  flutter pub get
  flutter run --dart-define=SAFEALERT_API=https://qrhtc5kg79.us-east-1.awsapprunner.com/v1
  ```

See [MOBILE_IOS_ANDROID.md](./MOBILE_IOS_ANDROID.md).

---

## 4. Africa's Talking — SMS & OTP

### 4.1 Create account

1. [https://account.africastalking.com/auth/register](https://account.africastalking.com/auth/register)
2. Create an app (e.g. `safealertng`)
3. For testing: use **Sandbox** (username `sandbox`, sandbox API key on dashboard)
4. For production: switch to **Live**, top up wallet, register sender ID `SafeAlertNG` (approval may take days)

### 4.2 Add credentials

Dashboard → **Settings → API Key** and **Username**.

```bash
npm run setup:at -- YOUR_USERNAME YOUR_API_KEY
```

Or:

```bash
AT_USERNAME=your_username AT_API_KEY=your_api_key npm run setup:at
```

### 4.3 Webhooks (after deploy)

In AT dashboard, set:

| Webhook | URL |
|---------|-----|
| SMS inbound | `https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/sms/inbound` |
| USSD | `https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/ussd` |

---

## 5. Validate locally

```bash
# After Firebase + secrets are in .env:
USE_MEMORY_DB=false NODE_ENV=production npm run validate-env
npm start
```

Health should show `"database": "firestore"`.

---

## 6. Redeploy to AWS

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...    # if using SSO
export AWS_DEFAULT_REGION=us-east-1

./scripts/aws/deploy-apprunner.sh
```

The deploy script reads `.env` and pushes variables to App Runner.

---

## 7. Verify production

```bash
curl -s https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/health | jq .
```

Expect:

- `"database": "firestore"` (not `memory`)
- `"production_env_ok": true`

Test OTP (uses real SMS when AT is configured):

```bash
curl -X POST https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"08012345678"}'
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `database: memory` in production | `FIREBASE_PRIVATE_KEY` missing or invalid; re-run `npm run setup:firebase` |
| `Production environment invalid` | Run `NODE_ENV=production npm run validate-env` and fix listed errors |
| FCM not registering in browser | Set all `FIREBASE_WEB_*`; allow notifications in browser |
| SMS not sent | Check `AT_USERNAME` / `AT_API_KEY`; sandbox only sends to whitelisted numbers |
| CORS error in browser | Add your exact origin to `CORS_ORIGINS` and redeploy |

---

## Security

- Never commit `.env`, `credentials/serviceAccountKey.json`, or API keys to git.
- Rotate AWS SSO keys if they were shared in chat.
- Rotate `JWT_SECRET` / `HASH_SECRET` if `.env` was exposed.
