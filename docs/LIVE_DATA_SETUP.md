# Real live data (no simulated zones)

SafeAlert now uses **real incident data** only:

| Source | Type | How |
|--------|------|-----|
| **ACLED API** | Verified conflict events (needs API access tier) | `ACLED_EMAIL` + `ACLED_PASSWORD` in `.env` |
| **HDX UCDP** | Verified UCDP events (fallback when ACLED 403) | `npm run sync:hdx` |
| **Community reports** | User submissions in the app | `POST /v1/zones` |
| **USSD tips** | Feature-phone reports | `*384*911#` pipeline |

**Simulated starter zones/routes are blocked** in the API when `BLOCK_SIMULATED_DATA=true` (default).

---

## 1. Get ACLED credentials (free)

1. Register: https://acleddata.com  
2. Log in → **My Account** → **API** (or Developer/API access)  
3. Copy your **API Key** and registered **Email**

Add to `.env`:

```env
ACLED_API_KEY=your_key_here
ACLED_EMAIL=you@example.com
ACLED_LOOKBACK_DAYS=30
LIVE_DATA_SYNC_ENABLED=true
BLOCK_SIMULATED_DATA=true
```

---

## 2. Remove old simulated data

```bash
npm run purge:simulated
```

---

## 3. Pull live incidents now

```bash
npm run sync:acled
```

If ACLED returns **403 Access denied** (login works but API tier not granted), use verified HDX data:

```bash
npm run sync:hdx
```

Production auto-sync tries ACLED first, then falls back to HDX UCDP when access is denied.

---

## 4. Deploy

Redeploy App Runner so production runs the ACLED scheduler every 6 hours:

```bash
./scripts/aws/deploy-apprunner.sh
```

---

## What you will see

- **Map zones** = ACLED events (last 30 days) + real user reports  
- **Routes** = empty until travellers submit journey safety (no fake scores)  
- **Panics** = always real-time from users  

Without ACLED API access, run **`npm run sync:hdx`** (or rely on the HDX fallback scheduler) plus community reports.
