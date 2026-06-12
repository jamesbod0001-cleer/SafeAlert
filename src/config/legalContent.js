/**
 * User-facing legal copy and contact details — single source (no API paths in prose).
 * Override via LEGAL_* env vars in production.
 */
function legalConfig() {
  return {
    app_name: process.env.APP_NAME || 'SafeAlert NG',
    support_email: process.env.LEGAL_SUPPORT_EMAIL || 'support@safealert.ng',
    privacy_email: process.env.LEGAL_PRIVACY_EMAIL || 'privacy@safealert.ng',
    last_updated: process.env.LEGAL_LAST_UPDATED || 'June 2026',
    account_deletion: {
      in_app: 'Settings & account → Delete my account (you must be signed in).',
      email_fallback:
        'Email us from the address linked to your account, or send your registered phone number.',
    },
    emergency_notice:
      'SafeAlert does not dispatch police, ambulance, or other emergency services. Call 112 or your local emergency number when life is at risk.',
  };
}

module.exports = { legalConfig };
