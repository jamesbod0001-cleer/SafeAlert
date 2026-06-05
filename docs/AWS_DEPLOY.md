# AWS deployment (App Runner)

SafeAlert NG is deployed as a **Docker container on AWS App Runner**, with images built in **ECR** (via **CodeBuild** when Docker is not available locally).

## Live endpoints (account `682718097244`, `us-east-1`)

| Resource | Value |
|----------|--------|
| App Runner URL | `https://qrhtc5kg79.us-east-1.awsapprunner.com` |
| App UI | `https://qrhtc5kg79.us-east-1.awsapprunner.com/app/` |
| Health | `https://qrhtc5kg79.us-east-1.awsapprunner.com/v1/health` |
| ECR | `682718097244.dkr.ecr.us-east-1.amazonaws.com/safealert-ng` |
| Service name | `safealert-ng` |

## Redeploy

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # if using SSO/temporary creds
export AWS_DEFAULT_REGION=us-east-1

# Optional: put Firebase, AT, and strong secrets in .env (quoted values)
./scripts/aws/deploy-apprunner.sh
```

The script loads `.env`, builds via CodeBuild, updates App Runner env, and starts a new deployment.

## Production secrets

Store these in **AWS Secrets Manager** (or SSM Parameter Store) and map them into App Runner environment variables. Do **not** commit them.

First deploy generated:

- `JWT_SECRET` — 64-char hex
- `HASH_SECRET` — 64-char hex  
- `ENCRYPTION_KEY` — 32-char hex (AES-256)

## Flutter app API URL

Use this same deployed API URL when running/building Flutter:

```bash
cd flutter_app
flutter run --dart-define=SAFEALERT_API=https://qrhtc5kg79.us-east-1.awsapprunner.com/v1
```

## Credentials (Firebase, SMS, secrets, CORS)

Full walkthrough: **[CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md)**

```bash
# After placing JSON files in credentials/
npm run setup:firebase
npm run setup:firebase-web
npm run setup:at -- YOUR_AT_USERNAME YOUR_AT_API_KEY
./scripts/aws/deploy-apprunner.sh
```

## Firebase (persistent data)

Until `npm run setup:firebase` is run, the API **falls back to in-memory storage**. After setup you need:

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Update the service in the AWS Console → App Runner → `safealert-ng` → Configuration → Environment variables, or re-run the deploy script with those values set.

## IAM resources created

- `SafeAlertAppRunnerECRAccess` — pull images from ECR
- `SafeAlertAppRunnerInstanceRole` — runtime instance role
- `SafeAlertCodeBuildRole` — build and push Docker image
- S3 bucket `safealert-deploy-682718097244` — source zip for CodeBuild
- Amplify app `safealert-ng` (`d4gezikur40wa`) — optional static hosting; API is on App Runner

## Security

- Rotate any AWS credentials that were shared in chat or logs.
- Restrict `CORS_ORIGINS` from `*` to your real web/app origins before public launch.
