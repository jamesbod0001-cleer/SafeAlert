/**
 * Public transparency reports — uses stats cache (low read cost).
 */
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const statsCacheService = require('./statsCacheService');
const fallbackData = require('./fallbackDataService');

async function getTransparencyReport() {
  try {
    const { stats, fallback } = await statsCacheService.getStats();

    let false_report_flags = 0;
    let verified_leaders = 0;
    let pending_leaders = 0;
    let active_field_agents = 0;

    try {
      const flagsSnap = await db().collection('zone_flags').orderBy('created_at', 'desc').limit(100).get();
      false_report_flags = flagsSnap.size;
    } catch {
      /* optional */
    }
    try {
      const leadersSnap = await db().collection('community_leaders').limit(50).get();
      const leaders = leadersSnap.docs.map((d) => d.data());
      verified_leaders = leaders.filter((l) => l.verified).length;
      pending_leaders = leaders.filter((l) => l.status === 'pending').length;
    } catch {
      /* optional */
    }
    try {
      const agentsSnap = await db()
        .collection('field_agents')
        .where('status', '==', 'active')
        .limit(50)
        .get();
      active_field_agents = agentsSnap.size;
    } catch {
      /* optional */
    }

    const community = stats.by_source?.community || 0;
    const acled = (stats.by_source?.hdx_ucdp || 0) + (stats.by_source?.acled || 0) + (stats.by_source?.ucdp || 0);

    return {
      generated_at: stats.last_updated || new Date().toISOString(),
      period: fallback ? 'cached_hdx' : 'live_cache',
      zones: {
        total_in_db: stats.total_active_zones,
        active: stats.total_active_zones,
        community_verified: stats.verified_zones,
        by_source: { community, acled_and_hdx: acled },
        hidden_after_false_reports: 0,
      },
      moderation: {
        false_report_flags,
        simulated_data_blocked: appConfig.blockSimulatedData,
      },
      community: {
        verified_leaders,
        pending_leader_applications: pending_leaders,
        active_field_agents,
      },
      privacy: {
        government_dispatch: false,
        police_auto_alert: false,
        location_sold: false,
        anonymous_reports: true,
        note: 'Panic SMS goes only to your chosen circle — not to police unless you call them yourself.',
      },
      open_data: {
        stats_api: '/v1/stats',
        sources_api: '/v1/data/sources',
        zones_api: '/v1/zones',
      },
    };
  } catch (err) {
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      const stats = fallbackData.getStats();
      const meta = fallbackData.getMeta();
      return {
        generated_at: meta.generated_at,
        period: 'cached_hdx',
        zones: {
          total_in_db: stats.total_active_zones,
          active: stats.total_active_zones,
          community_verified: stats.verified_zones,
          by_source: stats.by_source,
          hidden_after_false_reports: 0,
        },
        moderation: { false_report_flags: 0, simulated_data_blocked: appConfig.blockSimulatedData },
        community: { verified_leaders: 0, pending_leader_applications: 0, active_field_agents: 0 },
        privacy: {
          government_dispatch: false,
          police_auto_alert: false,
          location_sold: false,
          anonymous_reports: true,
          note: 'Panic SMS goes only to your chosen circle.',
        },
        open_data: { stats_api: '/v1/stats', sources_api: '/v1/data/sources', zones_api: '/v1/zones' },
        data_note: 'Firestore quota exceeded — HDX bundled statistics only.',
      };
    }
    throw err;
  }
}

module.exports = { getTransparencyReport };
