# Credentials folder (gitignored)

Place downloaded keys here, then run the setup scripts from the project root.

| File | Source | Command |
|------|--------|---------|
| `serviceAccountKey.json` | Firebase Console → Project settings → Service accounts → Generate new private key | `npm run setup:firebase` |
| `firebase-web-config.json` | Firebase Console → Project settings → Your apps → Web app config + FCM VAPID key | `npm run setup:firebase-web` |

Do **not** commit real JSON files to git.
