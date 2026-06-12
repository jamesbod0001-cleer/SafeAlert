#!/usr/bin/env bash
# Build SafeAlert NG mobile release artifacts for Google Play (AAB) and iOS archive prep.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${SAFEALERT_API:-https://qrhtc5kg79.us-east-1.awsapprunner.com/v1}"
DEFINE="--dart-define=SAFEALERT_API=${API}"

cd "$ROOT/flutter_app"

echo "==> flutter pub get"
flutter pub get

echo "==> Analyze"
flutter analyze

if [[ "${1:-all}" == "android" || "${1:-all}" == "all" ]]; then
  echo "==> Android App Bundle (Play Store)"
  flutter build appbundle --release $DEFINE
  echo "    Output: flutter_app/build/app/outputs/bundle/release/app-release.aab"
fi

if [[ "${1:-all}" == "apk" ]]; then
  echo "==> Android APK (side-load / TestFlight-style testing)"
  flutter build apk --release $DEFINE
  echo "    Output: flutter_app/build/app/outputs/flutter-apk/app-release.apk"
fi

if [[ "${1:-all}" == "ios" || "${1:-all}" == "all" ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Skip iOS build (requires macOS + Xcode)."
  else
    echo "==> iOS release (open Xcode to Archive → Distribute)"
    flutter build ios --release $DEFINE
    echo "    Next: open ios/Runner.xcworkspace → Product → Archive"
  fi
fi

echo ""
echo "Before store upload:"
echo "  • Android: add android/app/google-services.json for FCM"
echo "  • iOS: add ios/Runner/GoogleService-Info.plist + Push capability in Xcode"
echo "  • Sign release builds (Play App Signing / Apple Distribution cert)"
