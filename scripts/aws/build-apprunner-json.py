#!/usr/bin/env python3
"""Build App Runner create/update JSON from .env with safe JSON escaping."""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), '../..')
ENV_PATH = os.path.join(ROOT, '.env')


def load_env(path):
    env = {}
    if not os.path.isfile(path):
        return env
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip()
            if (val.startswith('"') and val.endswith('"')) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            # Keep \n as two-char sequence for FIREBASE_PRIVATE_KEY (server replaces)
            env[key] = val
    return env


def main():
    account = os.environ.get('AWS_ACCOUNT_ID') or sys.argv[1]
    region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    service_name = os.environ.get('SERVICE_NAME', 'safealert-ng')
    image_tag = os.environ.get('IMAGE_TAG', 'latest')
    ecr_uri = f"{account}.dkr.ecr.{region}.amazonaws.com/safealert-ng:{image_tag}"
    access_role = os.environ.get(
        'ACCESS_ROLE_ARN',
        f"arn:aws:iam::{account}:role/SafeAlertAppRunnerECRAccess",
    )
    instance_role = os.environ.get(
        'INSTANCE_ROLE_ARN',
        f"arn:aws:iam::{account}:role/SafeAlertAppRunnerInstanceRole",
    )

    file_env = load_env(ENV_PATH)
    runtime = {
        'NODE_ENV': 'production',
        'PORT': '8080',
        'SEED_REVIEW_DATA': 'false',
        'USE_MEMORY_DB': file_env.get('USE_MEMORY_DB', 'false'),
        'FIREBASE_PROJECT_ID': file_env.get('FIREBASE_PROJECT_ID', ''),
        'FIRESTORE_DATABASE_ID': file_env.get('FIRESTORE_DATABASE_ID', 'safealert'),
        'FIREBASE_CLIENT_EMAIL': file_env.get('FIREBASE_CLIENT_EMAIL', ''),
        'FIREBASE_PRIVATE_KEY': file_env.get('FIREBASE_PRIVATE_KEY', ''),
        'FIREBASE_WEB_API_KEY': file_env.get('FIREBASE_WEB_API_KEY', ''),
        'FIREBASE_WEB_AUTH_DOMAIN': file_env.get('FIREBASE_WEB_AUTH_DOMAIN', ''),
        'FIREBASE_WEB_MESSAGING_SENDER_ID': file_env.get('FIREBASE_WEB_MESSAGING_SENDER_ID', ''),
        'FIREBASE_WEB_APP_ID': file_env.get('FIREBASE_WEB_APP_ID', ''),
        'FIREBASE_WEB_VAPID_KEY': file_env.get('FIREBASE_WEB_VAPID_KEY', ''),
        'AT_USERNAME': file_env.get('AT_USERNAME', ''),
        'AT_API_KEY': file_env.get('AT_API_KEY', ''),
        'AT_SENDER_ID': file_env.get('AT_SENDER_ID', ''),
        'EXPOSE_SANDBOX_OTP': (
            'true'
            if file_env.get('AT_USERNAME', '').strip().lower() == 'sandbox'
            else file_env.get('EXPOSE_SANDBOX_OTP', 'true')
        ),
        'AT_TRY_SMS_IN_SANDBOX': file_env.get(
            'AT_TRY_SMS_IN_SANDBOX',
            'false' if file_env.get('AT_USERNAME', '').strip().lower() == 'sandbox' else 'true',
        ),
        'DEV_FIXED_OTP': (
            file_env.get('DEV_FIXED_OTP', '')
            if file_env.get('AT_USERNAME', '').strip().lower() == 'sandbox'
            and file_env.get('EXPOSE_SANDBOX_OTP', '').lower() == 'true'
            else ''
        ),
        'JWT_SECRET': file_env.get('JWT_SECRET') or os.environ.get('JWT_SECRET', ''),
        'HASH_SECRET': file_env.get('HASH_SECRET') or os.environ.get('HASH_SECRET', ''),
        'ENCRYPTION_KEY': file_env.get('ENCRYPTION_KEY') or os.environ.get('ENCRYPTION_KEY', ''),
        'PROXIMITY_ALERTS_ENABLED': file_env.get('PROXIMITY_ALERTS_ENABLED', 'true'),
        'PANIC_AUTO_BROADCAST_ENABLED': file_env.get('PANIC_AUTO_BROADCAST_ENABLED', 'true'),
        'PANIC_SMS_ENABLED': file_env.get('PANIC_SMS_ENABLED', 'true'),
        'PUSH_NOTIFICATIONS_ENABLED': file_env.get('PUSH_NOTIFICATIONS_ENABLED', 'true'),
        'LOCATION_TTL_MINUTES': file_env.get('LOCATION_TTL_MINUTES', '45'),
        'LOCATION_MIN_INTERVAL_SEC': file_env.get('LOCATION_MIN_INTERVAL_SEC', '300'),
        'HELP_NEARBY_MAX_RADIUS_KM': file_env.get('HELP_NEARBY_MAX_RADIUS_KM', '15'),
        'PANIC_BROADCAST_RADIUS_KM': file_env.get('PANIC_BROADCAST_RADIUS_KM', '10'),
        'CORS_ORIGINS': file_env.get(
            'CORS_ORIGINS',
            'https://qrhtc5kg79.us-east-1.awsapprunner.com,https://safealertng.com',
        ),
        'INCIDENT_TYPES': file_env.get(
            'INCIDENT_TYPES',
            'kidnapping,armed_robbery,banditry,terror,roadblock,suspicious,scam,one_chance,checkpoint',
        ),
        'APP_NAME': file_env.get('APP_NAME', 'SafeAlert NG'),
        'RATE_LIMIT_MAX': file_env.get('RATE_LIMIT_MAX', '300'),
        'RATE_LIMIT_AUTH_MAX': file_env.get('RATE_LIMIT_AUTH_MAX', '40'),
        'LIVE_DATA_SYNC_ENABLED': file_env.get('LIVE_DATA_SYNC_ENABLED', 'true'),
        'LIVE_DATA_SYNC_INTERVAL_MS': file_env.get('LIVE_DATA_SYNC_INTERVAL_MS', '21600000'),
        'LIVE_DATA_SYNC_INITIAL_DELAY_MS': file_env.get('LIVE_DATA_SYNC_INITIAL_DELAY_MS', '180000'),
        'ACLED_API_KEY': file_env.get('ACLED_API_KEY', ''),
        'ACLED_EMAIL': file_env.get('ACLED_EMAIL', ''),
        'ACLED_PASSWORD': file_env.get('ACLED_PASSWORD', ''),
        'ACLED_LOOKBACK_DAYS': file_env.get('ACLED_LOOKBACK_DAYS', '30'),
        'ACLED_SYNC_LIMIT': file_env.get('ACLED_SYNC_LIMIT', '500'),
        'BLOCK_SIMULATED_DATA': file_env.get('BLOCK_SIMULATED_DATA', 'true'),
        'HDX_UCDP_ENABLED': file_env.get('HDX_UCDP_ENABLED', 'true'),
        'HDX_UCDP_LOOKBACK_DAYS': file_env.get('HDX_UCDP_LOOKBACK_DAYS', '730'),
        'HDX_UCDP_SYNC_LIMIT': file_env.get('HDX_UCDP_SYNC_LIMIT', '2000'),
        'AI_INSIGHTS_ENABLED': file_env.get('AI_INSIGHTS_ENABLED', 'true'),
        'OPENAI_API_KEY': file_env.get('OPENAI_API_KEY', ''),
        'OPENAI_MODEL': file_env.get('OPENAI_MODEL', 'gpt-4o-mini'),
        'WHATSAPP_VERIFY_TOKEN': file_env.get('WHATSAPP_VERIFY_TOKEN', ''),
        'WHATSAPP_WEBHOOK_SECRET': file_env.get('WHATSAPP_WEBHOOK_SECRET', ''),
        'ZERO_RATING_INFO_URL': file_env.get('ZERO_RATING_INFO_URL', ''),
        'ZONES_MAX_PER_QUERY': file_env.get('ZONES_MAX_PER_QUERY', '300'),
        'STATS_CACHE_TTL_MS': file_env.get('STATS_CACHE_TTL_MS', '900000'),
        'STATS_REBUILD_MAX_PAGES': file_env.get('STATS_REBUILD_MAX_PAGES', '8'),
        'DAILY_IMPORT_ENABLED': file_env.get('DAILY_IMPORT_ENABLED', 'false'),
        'IMPORT_JOB_SECRET': file_env.get('IMPORT_JOB_SECRET') or os.environ.get('IMPORT_JOB_SECRET', ''),
        'ADMIN_SECRET': file_env.get('ADMIN_SECRET') or os.environ.get('ADMIN_SECRET', ''),
    }
    # Drop empty optional keys
    runtime = {k: v for k, v in runtime.items() if v is not None and str(v) != ''}

    doc = {
        'ServiceName': service_name,
        'SourceConfiguration': {
            'AuthenticationConfiguration': {'AccessRoleArn': access_role},
            'ImageRepository': {
                'ImageIdentifier': ecr_uri,
                'ImageRepositoryType': 'ECR',
                'ImageConfiguration': {
                    'Port': '8080',
                    'RuntimeEnvironmentVariables': runtime,
                },
            },
        },
        'InstanceConfiguration': {
            'Cpu': '1024',
            'Memory': '2048',
            'InstanceRoleArn': instance_role,
        },
        'HealthCheckConfiguration': {
            'Protocol': 'HTTP',
            'Path': '/v1/health',
            'Interval': 10,
            'Timeout': 5,
            'HealthyThreshold': 1,
            'UnhealthyThreshold': 10,
        },
    }
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/safealert-apprunner.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2)
    print(out)


if __name__ == '__main__':
    main()
