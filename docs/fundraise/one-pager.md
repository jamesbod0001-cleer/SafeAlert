# SafeAlert NG — Investor One-Pager

**Community-powered safety intelligence for Nigeria**  
*Citizen-first · Privacy-first · Works on 2G, USSD, and offline*

---

## Problem

Nigeria faces a persistent safety gap: kidnapping, armed robbery, banditry, roadblocks, and other incidents are under-reported, slow to reach communities, and unevenly covered by formal systems. Millions of Nigerians lack timely, trusted information about danger near them — especially outside major metros and on low-bandwidth connections.

**SafeAlert NG is citizen-first by design:**

- Reports come from people on the ground, not government dispatch APIs
- Phone numbers are hashed; circle contacts are encrypted; live locations expire when journeys end
- Panic SMS goes only to your chosen **safety circle** (max 5) — not to police unless you call them yourself
- No dependency on state emergency APIs for core value

---

## Solution

**SafeAlert NG** is a neighborhood nervous system: crowdsourced risk maps, peer response, and low-tech access so Nigerians help Nigerians when formal systems are slow or absent.

| Capability | What it does |
|------------|--------------|
| **Live safety map** | OpenStreetMap zones from community reports + ACLED/HDX seed data (`GET /v1/zones`) |
| **Community reports** | Report incidents; 3+ independent confirmations → verified zone (`POST /v1/zones`, `PATCH /v1/zones/:id/confirm`) |
| **Panic SOS** | Hold-to-activate; async SMS to circle + FCM to nearby opted-in helpers (`POST /v1/panic/activate` → 202) |
| **Safety circle** | Up to 5 trusted contacts notified on panic (`PUT /v1/user/circle`) |
| **Help nearby** | Opt-in proximity alerts; default **off** (`GET/PUT /v1/user/preferences`) |
| **USSD** | Feature-phone access via Africa's Talking — `*384*911#` (`POST /v1/ussd`) |
| **Offline state packs** | Download per-state zone data for low-connectivity areas (`GET /v1/offline/packs`, `/v1/offline/packs/:state`) |

**Stack:** Node.js API on Cloud Run, Firestore, FCM (free), Africa's Talking SMS/USSD, PWA at `/app/`, Flutter apps for iOS/Android.

---

## Traction

> **Fill before investor meetings.** Pull live numbers from the transparency API (no auth required).

```bash
curl -s https://YOUR_DOMAIN/v1/transparency | jq .
```

Or open **`/app/transparency.html`** in the browser.

| Metric | Value | Source field |
|--------|-------|--------------|
| Active zones | _[fill]_ | `zones.active` |
| Community-verified zones | _[fill]_ | `zones.community_verified` |
| Community-sourced reports | _[fill]_ | `zones.by_source.community` |
| ACLED/HDX seed zones | _[fill]_ | `zones.by_source.acled_and_hdx` |
| False-report flags | _[fill]_ | `moderation.false_report_flags` |
| Verified community leaders | _[fill]_ | `community.verified_leaders` |
| Pending leader applications | _[fill]_ | `community.pending_leader_applications` |
| Active field agents | _[fill]_ | `community.active_field_agents` |
| Report generated | _[fill]_ | `generated_at` |

**Additional metrics to mention verbally (if available):**

- Registered users (MAU) — internal dashboard / Firestore `users` count
- States with ≥1 active zone — target **37/37** (36 states + FCT) at national launch
- Panic E2E latency — circle SMS p95 &lt; 5 s (see production SLOs)

---

## Unit Economics

From [SERIOUS_LAUNCH_DEPLOYMENT.md](../SERIOUS_LAUNCH_DEPLOYMENT.md). Exchange rate for planning: **₦1,500 ≈ $1 USD**.

| Scenario | MAU profile | Infra/mo | SMS/mo | **Total/mo** |
|----------|-------------|----------|--------|--------------|
| **Lean** | ~3K MAU, low panic | ~$150 | ~$25 | **~₦260K** |
| **Target** | ~8K MAU, moderate traffic | ~$400 | ~$80 | **~₦720K** |
| **Hot** | ~15K MAU, Lagos-heavy | ~$750 | ~$150 | **~₦1.35M** |

**Cost controls built in:**

- Proximity to strangers → **FCM only** (never SMS blast to radius)
- `help_nearby_enabled` default **false**
- Safety circle capped at **5** contacts
- USSD shortcode deferred until DAU justifies ₦500K–2M+ NCC setup

**Recommended 3-month cash reserve:** ₦2M–3M (covers infra + SMS spikes while tuning rate limits).

**Biggest variable cost:** SMS (circle panic + OTP), not FCM or OpenStreetMap tiles.

---

## Market

| | |
|--|--|
| **Population** | ~220M Nigerians |
| **Coverage** | All **36 states + FCT** — national launch from day one |
| **Distribution** | PWA (`/app/`), Flutter iOS/Android, USSD `*384*911#`, WhatsApp bot (`/v1/webhooks/whatsapp`) |
| **Languages** | English, Pidgin, Hausa, Yoruba, Igbo (i18n + per-state radio bulletins via `GET /v1/radio/bulletin?state=`) |
| **Positioning** | Neighborhood safety layer — complements 112/police; does not replace emergency services |

**Launch targets (90-day):** 3,000–5,000 MAU; ≥12 verified community leaders (≥2 per geopolitical zone); offline packs for ≥20 states.

---

## Ask

**₦15M–25M seed** (adjust to your deck — ~18 months runway at lean burn)

Use of funds (illustrative — adjust to your deck):

| Allocation | Purpose |
|------------|---------|
| ~40% | Engineering — mobile parity, admin moderation, notify queue scale |
| ~30% | National user acquisition — ads, field agents, community radio |
| ~20% | Infrastructure runway — ₦2M–3M reserve (Firebase, Africa's Talking SMS) |
| ~10% | Legal, leader verification, USSD/NCC shortcode when DAU supports |

**Milestones this round unlocks:** 5K+ MAU, live transparency metrics in every investor update, App Store listings, first paid telco zero-rating conversations.

---

## Team

**Founder bios — add before investor meetings.** Demo live metrics via `GET /v1/transparency` so traction slides stay current.

| Name | Role | Background |
|------|------|------------|
| _[Founder]_ | CEO / Product | Nigeria safety / civic tech |
| _[Name]_ | CTO / Engineering | _[e.g. mobile, Firebase, geospatial]_ |
| _[Name]_ | Community / Ops | _[e.g. field agents, leader network]_ |

**Advisors / partners:** _[PLACEHOLDER — NGOs, community leaders, telco contacts]_

---

## Contact

**[PLACEHOLDER]**

| | |
|--|--|
| **Email** | _founder@safealertng.com_ |
| **Phone / WhatsApp** | _+234 XXX XXX XXXX_ |
| **Demo** | `https://YOUR_DOMAIN/app/` |
| **Transparency** | `https://YOUR_DOMAIN/app/transparency.html` |
| **API health** | `GET /v1/health` |

---

*Last updated: June 2026 · Update traction table before each investor meeting.*
