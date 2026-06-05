# SafeAlert NG — 5-Minute Live Demo Script

**Audience:** Seed investors  
**Format:** Live product demo on staging or production (`/app/`)  
**Duration:** ~5 minutes (+ 2 min Q&A buffer)  
**Prerequisite:** Demo account logged in; second device/browser optional for “nearby helper” view

---

## Pre-demo checklist (5 min before)

- [ ] Server healthy: `curl -s https://YOUR_DOMAIN/v1/health` → `database: firestore` (or `memory` for local)
- [ ] Sandbox OTP ready if SMS may fail (see [OTP fallback](#otp-fallback-if-sms-fails) below)
- [ ] Browser location permission granted (or demo coords enabled)
- [ ] Demo user has **1–2 contacts in safety circle** (`Profile → Safety circle`)
- [ ] Optional: second session with `help_nearby_enabled: true` for proximity demo
- [ ] Clear `localStorage` key `sa_panic_disclaimer` if you want to show disclaimer sheet live

---

## Demo flow (~5 minutes)

### 0:00 — Hook (30 sec)

> “220 million Nigerians need safety intelligence that works on 2G, feature phones, and spotty data. SafeAlert is citizen-first — your neighbors report danger, your circle gets panic SMS, and you never depend on government APIs to know what’s happening nearby.”

Open: **`https://YOUR_DOMAIN/app/`**

---

### 0:30 — Safety map (45 sec)

1. Tap **Map** in bottom nav (`go('map')`).
2. Pan/zoom to your demo state (or use **Home → Report** if map is sparse).
3. Tap an existing zone marker — show severity badge (CRITICAL / HIGH / MEDIUM) and confirmation count.

**Say:**

> “Zones come from community reports plus ACLED/HDX seed data so cold-start states aren’t empty. Three independent confirmations make a zone verified — that’s the trust signal.”

**API behind the map:** `GET /v1/zones?lat=&lng=&radius=`

---

### 1:15 — Report a zone in your state (60 sec)

1. Tap **Report** (red nav) or **Home → Submit community alert**.
2. **Step 1:** Pick incident type (e.g. Armed robbery) or quick chip.
3. **Step 2:** One-line description: _“Demo report for investor walkthrough — safe to ignore.”_
4. **Step 3:** Confirm GPS / state label shows correct state (not generic “Nigeria”).
5. Tap **Submit community alert**.

**Say:**

> “Anyone can report anonymously. The zone starts unverified; the community confirms or clears it. False reports can be flagged — we surface that on our transparency page.”

**API:** `POST /v1/zones`

---

### 2:15 — Community confirm (30 sec)

1. Tap the new zone on the map (or zone sheet).
2. Tap **Still dangerous** (`confirmZ` → `PATCH /v1/zones/:id/confirm`).

**Say:**

> “Each confirmation is independent. At three confirms, the zone becomes community-verified — that’s when we escalate severity and can push to opted-in users within radius.”

---

### 2:45 — Panic SOS + disclaimer (75 sec)

1. Tap **Panic** in bottom nav.
2. If disclaimer sheet appears (**first time only**), read it aloud:

   > “SafeAlert alerts your circle and nearby helpers. It does **not** dispatch police or ambulance. In a life-threatening emergency, call **112**.”

3. Tap **I understand**.
4. **Hold the panic button 3 seconds** to activate.
5. Show toast: `Panic #XXXXXX — your circle & nearby helpers are being notified` (async **202**).

**Say:**

> “Panic is async — API returns in under 300 ms; SMS to your circle and FCM to opted-in helpers fan out in the background. SMS only goes to your five trusted contacts, not strangers. Proximity uses free FCM, not expensive SMS blasts.”

**APIs:** `POST /v1/panic/activate`, `PUT /v1/user/circle`

**Do not skip the disclaimer** — investors should hear the citizen-first positioning explicitly.

---

### 4:00 — Nearby helper + transparency (60 sec)

**Option A — Nearby helper (if second device/session ready):**

1. On helper device: Profile → enable **Alert me when someone nearby needs help** (`PUT /v1/user/preferences`).
2. Show panic card or map marker; tap **I'm on my way** if shown (`POST /v1/panic/:id/respond`).

**Say:**

> “Helpers opt in — default is off. That’s how we keep costs predictable and avoid spam.”

**Option B — Transparency (always available):**

1. Navigate to **Community tools → Trust** or open **`/app/transparency.html`** directly.
2. Point at live stats (zones, leaders, false-report flags).

**Say:**

> “Every metric an investor cares about is public. Same data as `GET /v1/transparency` — we’ll email this monthly.”

```bash
curl -s https://YOUR_DOMAIN/v1/transparency | jq '.zones, .community, .privacy'
```

Highlight `privacy.note`: *“Panic SMS goes only to your chosen circle.”*

---

### 4:45 — Close (15 sec)

> “Map, report, confirm, panic, transparency — all live. USSD `*384*911#` and offline state packs extend this to feature phones and rural connectivity. We’re raising **[seed amount]** to scale national acquisition and mobile parity.”

---

## OTP fallback (if SMS fails)

If `POST /v1/auth/request-otp` does not deliver SMS during the demo:

### Staging / sandbox (recommended for demos)

1. Confirm health shows sandbox mode:
   ```bash
   curl -s https://YOUR_DOMAIN/v1/health | jq '.sandbox_otp_in_api, .at_sandbox'
   ```
2. Request OTP in app (Profile → Sign in → enter phone).
3. **OTP appears in the UI** — the hint shows: `Your code: 123456 — tap Sign in`
4. Paste code and tap **Sign in** (`POST /v1/auth/verify-otp`).

**Server config for demos:**

- Africa's Talking **sandbox** username, or
- `EXPOSE_SANDBOX_OTP=true` on staging (never in production)
- Local dev: `DEV_FIXED_OTP=123456` in `.env` (unset in production per deployment checklist)

**Say if SMS fails:**

> “We’re on Africa's Talking sandbox for this demo — in production, OTP is real SMS. The app surfaces the code in sandbox so demos never stall.”

### Production fallback

- Pre-login before the meeting, or
- Use a phone whitelisted in the AT dashboard for sandbox routing

---

## Investor talking points

Use these when answering questions — not necessarily in the live flow.

| Topic | Talking point |
|-------|----------------|
| **vs. government apps** | No government API dependency; citizen reports are the trust signal; complements 112, doesn’t replace it |
| **Privacy** | Phones hashed, circle AES-encrypted, locations TTL-expire, `help_nearby` default off |
| **Unit economics** | ₦260K–1.35M/mo tiers; SMS is the variable (circle + OTP only); FCM and OSM are free |
| **Scale** | Geohash proximity queries, async panic worker, kill switch `PROXIMITY_ALERTS_ENABLED` |
| **Distribution** | PWA + Flutter + USSD + WhatsApp bot; offline packs per state |
| **Moat** | Community verification, verified leaders, field agents, reputation (`GET /v1/reputation/leaderboard`) |
| **Transparency** | Public `GET /v1/transparency` — same stats as investor updates |
| **Risks** | False reports (moderation + flags), SMS cost spikes (caps + FCM-only proximity), cold-start states (ACLED seed + offline packs) |

---

## Timing cheat sheet

| Segment | Duration |
|---------|----------|
| Hook + open app | 0:30 |
| Map + existing zones | 0:45 |
| Report new zone | 1:00 |
| Community confirm | 0:30 |
| Panic + disclaimer | 1:15 |
| Helper or transparency | 1:00 |
| Close | 0:15 |
| **Total** | **~5:15** |

---

## Quick recovery lines

| If this happens… | Say this… |
|------------------|-----------|
| Map empty in demo state | “Cold-start states get ACLED seed data; let me pull an offline pack or pan to a seeded zone.” |
| OTP SMS delayed | “Sandbox mode — code is in the app. Production uses real AT SMS.” |
| Panic disclaimer already accepted | “Users accept once; copy is also in Terms and privacy policy.” |
| No nearby helper device | “Skip to transparency — same metrics investors get monthly.” |
| Guest mode only | “Sign in takes 10 seconds — phone OTP, no password.” |

---

*Pair with [one-pager.md](./one-pager.md) for leave-behind materials.*
