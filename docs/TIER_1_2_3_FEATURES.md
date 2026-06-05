# SafeAlert NG — Tier 1, 2 & 3 features

## Tier 1 — Trust & reach (illiteracy)

| Feature | API / UI | Notes |
|---------|----------|--------|
| Voice mode | `public/js/voice-ui.js`, Profile → Voice mode | Web Speech API; Hausa/Pidgin via language setting |
| Icon-only mode | `public/js/icon-mode.js`, Profile → Icon-only | Hides text labels on nav |
| Community leaders | `POST /v1/leaders/apply`, `GET /v1/leaders`, `POST /v1/leaders/endorse-zone` | Admin verify: `POST /v1/admin/leaders/:id/verify` + `X-Import-Secret` |
| WhatsApp bot | `GET/POST /v1/webhooks/whatsapp` | Set `WHATSAPP_VERIFY_TOKEN`; commands: HELP, ALERT, ROUTE, STATUS |
| Transparency | `GET /v1/transparency`, `/app/transparency.html` | Public monthly-style stats |

## Tier 2 — Distribution & poverty

| Feature | API / UI | Notes |
|---------|----------|--------|
| Zero-rating info | `GET /v1/partners/zero-rating` | Partnership pitch; Data Saver mitigates until telco deal |
| Offline state packs | `GET /v1/offline/packs`, `GET /v1/offline/packs/:state` | Download on Community screen; cached in `localStorage` |
| Field agents | `POST /v1/agents/register`, `GET /v1/agents` | Airtime rewards tracked on agent doc |

## Tier 3 — Differentiation

| Feature | API / UI | Notes |
|---------|----------|--------|
| Reputation | `GET /v1/reputation/leaderboard`, `GET /v1/reputation/me` | Points on report + confirm |
| School safety | `POST /v1/schools/register`, `GET /v1/schools/:id/safety` | Geofenced alert count |
| Radio bulletin | `GET /v1/radio/bulletin?lang=&state=` | 30s script for community radio |
| Mental health tips | `GET /v1/tips?lang=` | `data/mental-health-tips.json` |

## App navigation

Home → **Community tools** → `#screen-trust` (`tier-features.js`)

## WhatsApp setup (Meta)

1. Create Meta Business app with WhatsApp product.
2. Set webhook URL: `https://YOUR_DOMAIN/v1/webhooks/whatsapp`
3. Verify token = `WHATSAPP_VERIFY_TOKEN` in `.env`
4. Subscribe to `messages` events

## Leader verification

```bash
curl -X POST https://YOUR_DOMAIN/v1/admin/leaders/ldr_USERID/verify \
  -H "X-Import-Secret: YOUR_IMPORT_JOB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"verified":true,"note":"NURTW Lagos branch"}'
```
