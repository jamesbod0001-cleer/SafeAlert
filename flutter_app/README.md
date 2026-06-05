# SafeAlert NG — Flutter (full restructure)

Native iOS + Android client for [SafeAlert NG](https://qrhtc5kg79.us-east-1.awsapprunner.com/app/). The web app remains at `/app/` for browsers.

## Architecture

```
lib/
  main.dart, app.dart
  core/           api, storage, theme, constants, utils
  data/models/    Zone, Panic, Circle, Route, Estate, …
  features/
    app/          AppController + AppShell
    onboarding/
    home/         SOS, journey, check-in, nearby alerts
    map/          flutter_map + zone/SOS markers
    insights/     stats + AI summary
    routes/       route scores + check
    circle/       circle, estates, groups, resources
    report/       community zone reports
    trust/        leaders, agents, offline packs, schools
    panic/        full-screen SOS overlay
    profile/      OTP auth + responder settings
  shared/widgets/
```

## Features (web parity)

| Screen | Auth | Notes |
|--------|------|-------|
| Home | SOS/journey/check-in need sign-in | Hold-to-SOS, USSD, trust link |
| Map | Guest OK | OSM tiles, zone + panic markers |
| Insights | Guest OK | Stats, state breakdown, AI summary |
| Routes | Guest OK | Popular routes + `/routes/check` |
| Circle | Sign-in | Circle CRUD, estates, groups, resources |
| Report | Guest OK | All zone types from `/settings` |
| Trust | Guest OK | Leaders, agents, tips, transparency |
| Panic overlay | Active SOS | WhatsApp, broadcast, responders |
| Profile sheet | OTP | Sandbox OTP shown when enabled |

## Run

```bash
cd flutter_app
flutter pub get
flutter run \
  --dart-define=SAFEALERT_API=https://qrhtc5kg79.us-east-1.awsapprunner.com/v1
```

From repo root:

```bash
npm run flutter:run
npm run flutter:build:android
npm run flutter:build:ios
```

## Build release

```bash
flutter build apk --release --dart-define=SAFEALERT_API=https://YOUR_HOST/v1
flutter build ios --release --dart-define=SAFEALERT_API=https://YOUR_HOST/v1
```

## Not yet ported (follow-ups)

- Firebase FCM push (`firebase_core`, `firebase_messaging`)
- Full i18n (en / ha / yo / ig / pcm)
- Deep links (`?zone=`, `?panic=`, `?estate=`)
- Offline pack download to device storage

## Added scaffolding now

- Push service bootstrap in `lib/core/notifications/push_service.dart` (safe no-op until Firebase platform files are configured)
- Basic language switching + string map in `lib/core/i18n/app_i18n.dart`
- Query deep-link capture in router (`zone`, `panic`, `estate`) with handoff actions on home screen

## API

Same Node `/v1` backend as the web app. See `lib/core/api/safealert_api.dart` for the full endpoint list.
