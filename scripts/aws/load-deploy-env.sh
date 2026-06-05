#!/usr/bin/env bash
# Load production vars from .env (never commit secrets). Used by deploy-apprunner.sh
ENV_FILE="$(dirname "$0")/../../.env"
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    key="${key// /}"
    if [[ "$val" == \"*\" ]]; then
      val="${val%\"}"; val="${val#\"}"
    fi
    val="${val%\'}"; val="${val#\'}"
    # Skip empty optional keys for deploy JSON
    [[ -z "$val" && "$key" =~ ^(FIREBASE_|AT_|FIREBASE_WEB_) ]] && continue
    export "$key=$val"
  done < "$ENV_FILE"
fi

# Force production runtime flags for App Runner
export NODE_ENV=production
export PORT=8080
export USE_MEMORY_DB="${USE_MEMORY_DB:-false}"
export SEED_REVIEW_DATA=false
unset DEV_FIXED_OTP

# Feature flags from docs
export PROXIMITY_ALERTS_ENABLED="${PROXIMITY_ALERTS_ENABLED:-true}"
export PANIC_AUTO_BROADCAST_ENABLED="${PANIC_AUTO_BROADCAST_ENABLED:-true}"
export PANIC_SMS_ENABLED="${PANIC_SMS_ENABLED:-true}"
export PUSH_NOTIFICATIONS_ENABLED="${PUSH_NOTIFICATIONS_ENABLED:-true}"
