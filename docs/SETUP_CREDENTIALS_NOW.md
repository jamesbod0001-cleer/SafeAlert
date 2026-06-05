# Fill `.env` lines 22–43 (about 20 minutes)

You indicated you **do not have Firebase or Africa's Talking yet**. Those values cannot be invented — each line comes from a provider dashboard after signup.

Follow this order. After each step, run the command shown and your `.env` will update automatically.

---

## Part A — Firebase (Firestore + push)

### A1. Create project (5 min)

1. Open https://console.firebase.google.com/
2. **Add project** → name: `safealert-ng` (or your choice)
3. Disable Analytics if you want (optional)
4. **Upgrade to Blaze** (required for production Firestore):  
   Project → ⚙️ **Usage and billing** → **Modify plan** → Blaze

### A2. Firestore (2 min)

1. **Build** → **Firestore Database** → **Create database**
2. **Production mode** → region `eur3` (or closest to you) → **Enable**

### A3. Service account → fills lines 25–27 (3 min)

1. ⚙️ **Project settings** → **Service accounts**
2. **Generate new private key** → download JSON
3. Move file to this repo:

   ```bash
   mv ~/Downloads/safealert-ng-*.json /Users/jamesbod/Downloads/SafeAlert/credentials/serviceAccountKey.json
   ```

4. Apply to `.env`:

   ```bash
   cd /Users/jamesbod/Downloads/SafeAlert
   npm run setup:firebase
   ```

   Sets: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `USE_MEMORY_DB=false`

### A4. Web app + FCM → fills lines 32–36 (5 min)

1. **Project settings** → **Your apps** → **</> Web**
2. App nickname: `SafeAlert Web` → Register
3. Copy the `firebaseConfig` block into a new file:

   `credentials/firebase-web-config.json`

   Example shape (use your real values):

   ```json
   {
     "apiKey": "AIza...",
     "authDomain": "your-project.firebaseapp.com",
     "projectId": "your-project-id",
     "messagingSenderId": "123456789",
     "appId": "1:123:web:abc",
     "vapidKey": "B..."
   }
   ```

4. **Build** → **Cloud Messaging** → **Web Push certificates** → **Generate key pair** → paste key as `vapidKey` in that JSON



5. Apply:

   ```bash
   npm run setup:firebase-web
   ```

### A5. Deploy Firestore rules (2 min)

```bash
npm install -g firebase-tools
firebase login
cd /Users/jamesbod/Downloads/SafeAlert
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Part B — Africa's Talking (SMS / OTP)

### B1. Sandbox (use this until Sender ID is approved)

Sandbox is **free** and does **not** need CAC or Sender ID approval.

**There is no “whitelist phones” screen anymore** on many accounts. Africa’s Talking sandbox is built around:

- **Simulator** (USSD / short code flows): https://simulator.africastalking.com:1517/
- **SMS Outbox** in the dashboard (messages may **not** arrive on your real phone)
- Or **expose OTP in the API** while testing (see step 6)

| Step | Action |
|------|--------|
| 1 | Open **only** the sandbox app: https://account.africastalking.com/apps/sandbox |
| 2 | **Settings** → **API Key** → **Generate** (sandbox key is **not** the SafeAlert production key) |
| 3 | Wait **5–20 minutes** after generating before testing |
| 4 | Save credentials: |

```bash
npm run setup:at:sandbox YOUR_SANDBOX_API_KEY
```

```bash
AT_USERNAME=sandbox
AT_API_KEY=your_sandbox_api_key_only
AT_SENDER_ID=
```

| Step | Action |
|------|--------|
| 5 | Test auth (should **not** say “invalid authentication”): |

```bash
node scripts/test-at-sms.js 08031234567
```

If you see `401` / `invalid authentication`: the key is from the wrong app or not propagated yet — regenerate on **apps/sandbox** only.

| Step | Action |
|------|--------|
| 6 | **Sign-in without real SMS** (recommended for sandbox): add to `.env` and redeploy: |

```bash
EXPOSE_SANDBOX_OTP=true
```

Then in the app: **Send OTP** → the code appears in a toast and fills the OTP field → **Sign in**.

| Step | Action |
|------|--------|
| 7 | Optional: check **Sandbox → SMS → Outbox** for sent OTP messages |
| 8 | Redeploy: `./scripts/aws/deploy-apprunner.sh` |

**Local dev only** (no AT): `DEV_FIXED_OTP=123456` with `NODE_ENV=development`.

**Do not mix keys:** `AT_USERNAME=sandbox` + **sandbox** API key only. Production `SafeAlert` key → `401`.

**Turn off before go-live:** remove `EXPOSE_SANDBOX_OTP` and switch back to production AT credentials.

---

### B2. Production (after documentation / Sender ID approval)

1. Dashboard → app **SafeAlert** → **Settings** → production **Username** + **API Key**
2. **Product Request** → **Sender ID** → request e.g. `SafeAlertNG` (OTP / transactional)
3. When approved:

```bash
npm run setup:at -- SafeAlert YOUR_PRODUCTION_API_KEY
# then in .env:
AT_SENDER_ID=YourApprovedSenderId
node scripts/test-at-sms.js 080YOURNUMBER
./scripts/aws/deploy-apprunner.sh
```

---

## Part C — Verify & deploy

```bash
# After A + B complete:
NODE_ENV=production USE_MEMORY_DB=false npm run validate-env

# Redeploy AWS with new .env
./scripts/aws/deploy-apprunner.sh

# Check production
curl -s https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/health
# Expect: "database": "firestore"
```

---

## Quick check (what's still empty)

```bash
node -e "
require('dotenv').config();
const keys=['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','FIREBASE_WEB_API_KEY','AT_USERNAME','AT_API_KEY'];
keys.forEach(k=>console.log((process.env[k]?'✅':'❌'),k));
"
```

---

## After you have the JSON files

Tell the agent: *"serviceAccountKey.json and firebase-web-config.json are in credentials/"* — it can run `npm run setup:firebase` and `npm run setup:firebase-web` for you.

Or run everything interactively:

```bash
npm run setup:credentials
```
