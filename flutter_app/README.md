# SafeAlert NG — Flutter (full restructure)

Native iOS + Android client for [SafeAlert NG](https://qrhtc5kg79.us-east-1.awsapprunner.com/app/). The web app remains at `/app/` for browsers.

## Architecture

```
lib/
  main.dart, app.dart
  core/           api, storage, theme, constants, utils, i18n, notifications
  data/models/    Zone, Panic, Circle, Route, Estate, …
  features/
    app/          AppController + AppShell
    onboarding/   welcome + state/offline pack step
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
| Onboarding | Guest OK | State picker + optional offline pack download |

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

## Push notifications (FCM)

Firebase is optional until you add platform config files. The app degrades gracefully without them.

### Android

1. In [Firebase Console](https://console.firebase.google.com/), add an Android app with package name `com.safealert.ng.safealert_ng`.
2. Download `google-services.json`.
3. Copy it next to the example file:

   ```bash
   cp /path/to/google-services.json flutter_app/android/app/google-services.json
   ```

   See `android/app/google-services.json.example` for the expected shape. **Do not commit the real file** if the repo is public.

4. Gradle applies the `google-services` plugin only when `google-services.json` exists.

### iOS

1. Add an iOS app in Firebase Console and download `GoogleService-Info.plist`.
2. Place it at `flutter_app/ios/Runner/GoogleService-Info.plist`.
3. Enable push capabilities in Xcode (Background Modes → Remote notifications).

### Runtime behaviour

- `PushService.initialize()` runs on bootstrap when the user is signed in.
- After OTP verify, `PushService.syncToken()` registers the FCM token via `PUT /user/fcm-token`.
- Token refresh is listened for and synced automatically.

## Offline state packs

Onboarding (and Trust screen) can download per-state safety data for offline use.

- API: `GET /v1/offline/packs/:state`
- Storage: `lib/core/storage/offline_pack_storage.dart` (SharedPreferences, same key pattern as web `localStorage`)
- State detection uses `publicConfig.nigeria_states` bounding boxes (same algorithm as web `guessStateFromBounds`)

Download on Wi‑Fi before travelling — packs work when the API is unreachable.

## Internationalization

`lib/core/i18n/app_i18n.dart` includes 50+ keys in **en**, **Hausa**, **Yoruba**, **Igbo**, and **Pidgin** — nav tabs, panic/SOS, onboarding, trust, insights, and auth strings ported from `public/js/i18n.js`.

## Deep links

Query deep-link capture in router (`zone`, `panic`, `estate`) with handoff actions on home screen.

## API

Same Node `/v1` backend as the web app. See `lib/core/api/safealert_api.dart` for the full endpoint list.
