#!/usr/bin/env bash
# Deploy SafeAlert NG to AWS App Runner (ECR image built via CodeBuild or local Docker).
# Usage: export AWS credentials, then: ./scripts/aws/deploy-apprunner.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Load .env production values (Firebase, AT, secrets) when present
# shellcheck disable=SC1091
source "${ROOT}/scripts/aws/load-deploy-env.sh"

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
REPO="safealert-ng"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SERVICE_NAME="${SERVICE_NAME:-safealert-ng}"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:${IMAGE_TAG}"
ACCESS_ROLE_ARN="${ACCESS_ROLE_ARN:-arn:aws:iam::${ACCOUNT_ID}:role/SafeAlertAppRunnerECRAccess}"
INSTANCE_ROLE_ARN="${INSTANCE_ROLE_ARN:-arn:aws:iam::${ACCOUNT_ID}:role/SafeAlertAppRunnerInstanceRole}"

# Production secrets — keep existing App Runner secrets if .env still has dev defaults
is_weak_secret() {
  case "$1" in
    *local-dev*|*change_this*|*dev-secret*) return 0 ;;
  esac
  return 1
}

EXISTING_ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${SERVICE_NAME}'].ServiceArn | [0]" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$EXISTING_ARN" != "None" && -n "$EXISTING_ARN" ]]; then
  while IFS= read -r line; do
    key="${line%%=*}"; val="${line#*=}"
    case "$key" in
      JWT_SECRET|HASH_SECRET|ENCRYPTION_KEY)
        if is_weak_secret "${!key:-}"; then export "$key=$val"; fi ;;
    esac
  done < <(aws apprunner describe-service --service-arn "$EXISTING_ARN" --region "$REGION" \
    --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' --output json 2>/dev/null | \
    python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{k}={v}') for k,v in (d or {}).items()]" 2>/dev/null || true)
fi

if is_weak_secret "${JWT_SECRET:-}" || [[ -z "${JWT_SECRET:-}" ]] || [[ ${#JWT_SECRET} -lt 32 ]]; then
  if [[ -n "${AWS_SECRETS_ARN:-${SAFEALERT_SECRETS_ARN:-}}" ]]; then
    echo "Using AWS Secrets Manager — skipping local JWT_SECRET generation"
  else
    JWT_SECRET="$(openssl rand -hex 32)"
  fi
fi
if is_weak_secret "${HASH_SECRET:-}" || [[ -z "${HASH_SECRET:-}" ]]; then
  if [[ -z "${AWS_SECRETS_ARN:-${SAFEALERT_SECRETS_ARN:-}}" ]]; then
    HASH_SECRET="$(openssl rand -hex 32)"
  fi
fi
if is_weak_secret "${ENCRYPTION_KEY:-}" || [[ -z "${ENCRYPTION_KEY:-}" ]]; then
  if [[ -z "${AWS_SECRETS_ARN:-${SAFEALERT_SECRETS_ARN:-}}" ]]; then
    ENCRYPTION_KEY="$(openssl rand -hex 16)"
  fi
fi

echo "Account: $ACCOUNT_ID  Region: $REGION"
echo "Image:   $ECR_URI"

aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" >/dev/null

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  echo "Building and pushing with local Docker..."
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
  docker build -t "${REPO}:${IMAGE_TAG}" .
  docker tag "${REPO}:${IMAGE_TAG}" "$ECR_URI"
  docker push "$ECR_URI"
  if [[ "$IMAGE_TAG" != "latest" ]]; then
    LATEST_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:latest"
    docker tag "${REPO}:${IMAGE_TAG}" "$LATEST_URI"
    docker push "$LATEST_URI"
  fi
else
  echo "Docker not available — starting CodeBuild..."
  BUCKET="safealert-deploy-${ACCOUNT_ID}"
  aws s3 mb "s3://${BUCKET}" --region "$REGION" 2>/dev/null || true
  node "${ROOT}/scripts/write-fcm-sw.js" 2>/dev/null || true
  cp "${ROOT}/scripts/aws/buildspec.yml" "${ROOT}/buildspec.yml"
  ZIP="/tmp/safealert-src.zip"
  rm -f "$ZIP"
  zip -rq "$ZIP" . \
    -x "node_modules/*" -x "android/*" -x "ios/*" -x ".git/*" -x ".env" -x "*.zip" -x "credentials/*"
  # buildspec.yml stays in zip for CodeBuild; remove local copy only
  rm -f "${ROOT}/buildspec.yml"
  aws s3 cp "$ZIP" "s3://${BUCKET}/source.zip" --region "$REGION"
  PROJECT="safealert-ng-build"
  ROLE_NAME="SafeAlertCodeBuildRole"
  if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    aws iam create-role --role-name "$ROLE_NAME" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
    sleep 10
  fi
  BUILD_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
  PROJECT_JSON="/tmp/safealert-codebuild.json"
  cat > "$PROJECT_JSON" <<CBEOF
{
  "name": "${PROJECT}",
  "source": { "type": "S3", "location": "${BUCKET}/source.zip" },
  "artifacts": { "type": "NO_ARTIFACTS" },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
    "computeType": "BUILD_GENERAL1_MEDIUM",
    "privilegedMode": true,
    "environmentVariables": [
      { "name": "AWS_ACCOUNT_ID", "value": "${ACCOUNT_ID}", "type": "PLAINTEXT" },
      { "name": "AWS_DEFAULT_REGION", "value": "${REGION}", "type": "PLAINTEXT" },
      { "name": "IMAGE_REPO_NAME", "value": "${REPO}", "type": "PLAINTEXT" },
      { "name": "IMAGE_TAG", "value": "${IMAGE_TAG}", "type": "PLAINTEXT" }
    ]
  },
  "serviceRole": "${BUILD_ROLE}"
}
CBEOF
  if ! aws codebuild batch-get-projects --names "$PROJECT" --query 'projects[0].name' --output text 2>/dev/null | grep -q "$PROJECT"; then
    aws codebuild create-project --cli-input-json "file://${PROJECT_JSON}"
  else
    aws codebuild update-project --cli-input-json "file://${PROJECT_JSON}" >/dev/null
  fi
  BUILD_ID=$(aws codebuild start-build --project-name "$PROJECT" --query 'build.id' --output text)
  echo "CodeBuild: $BUILD_ID (waiting...)"
  for i in $(seq 1 90); do
    PHASE=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].currentPhase' --output text)
    STATUS=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].buildStatus' --output text)
    echo "  phase=$PHASE status=$STATUS"
    [[ "$STATUS" == "SUCCEEDED" ]] && break
    [[ "$STATUS" == "FAILED" || "$STATUS" == "FAULT" || "$STATUS" == "STOPPED" || "$STATUS" == "TIMED_OUT" ]] && {
      aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].[statusMessage,logs.deepLink]' --output text
      exit 1
    }
    sleep 20
  done
fi

APPRUNNER_JSON="/tmp/safealert-apprunner.json"
export IMAGE_TAG
python3 "${ROOT}/scripts/aws/build-apprunner-json.py" "$ACCOUNT_ID" "$APPRUNNER_JSON"
echo "App Runner image: $ECR_URI"

EXISTING=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${SERVICE_NAME}'].ServiceArn | [0]" --output text --region "$REGION")
if [[ "$EXISTING" != "None" && -n "$EXISTING" ]]; then
  echo "Updating App Runner (image + env from .env)..."
  SRC_ONLY="/tmp/safealert-apprunner-src.json"
  python3 -c "
import json
with open('${APPRUNNER_JSON}', encoding='utf-8') as f:
    doc = json.load(f)
with open('${SRC_ONLY}', 'w', encoding='utf-8') as f:
    json.dump(doc['SourceConfiguration'], f)
print('Image + env synced from .env')
"
  aws apprunner update-service --service-arn "$EXISTING" --region "$REGION" \
    --source-configuration "file://${SRC_ONLY}" \
    >/dev/null
  SERVICE_ARN="$EXISTING"
  for i in $(seq 1 24); do
    SSTAT=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --query 'Service.Status' --output text)
    [[ "$SSTAT" == "RUNNING" ]] && break
    echo "  waiting for RUNNING (current: $SSTAT)..."
    sleep 15
  done
  if [[ "$SSTAT" == "RUNNING" ]]; then
    echo "Starting new deployment..."
    aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$REGION" >/dev/null || true
  fi
else
  echo "Creating App Runner service..."
  SERVICE_ARN=$(aws apprunner create-service --cli-input-json "file://${APPRUNNER_JSON}" --region "$REGION" \
    --query 'Service.ServiceArn' --output text)
fi

echo "Waiting for service to be running..."
for i in $(seq 1 60); do
  STATUS=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --query 'Service.Status' --output text)
  URL=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --query 'Service.ServiceUrl' --output text)
  echo "  status=$STATUS url=$URL"
  [[ "$STATUS" == "RUNNING" ]] && break
  sleep 15
done

echo ""
echo "Deployed: https://${URL}"
echo "App UI:   https://${URL}/app/"
echo "Health:   https://${URL}/v1/health"
if [[ -n "${AWS_SECRETS_ARN:-${SAFEALERT_SECRETS_ARN:-}}" ]]; then
  echo ""
  echo "Secrets: loaded from AWS Secrets Manager at runtime (not printed)."
else
  echo ""
  echo "Tip: store production secrets in AWS Secrets Manager and set AWS_SECRETS_ARN before deploy."
  echo "     npm run secrets:push  (requires local .env — never commit)"
fi
