/** Demo/starter broadcast groups — hidden when BLOCK_SIMULATED_DATA=true */
const STARTER_GROUP_IDS = new Set([
  'grp_nurtw_lagos',
  'grp_haulage_north',
  'grp_market_enugu',
]);

const STARTER_GROUP_SOURCES = new Set(['safealert_starter', 'review_fixture']);

function isDemoGroup(group) {
  if (!group) return false;
  if (STARTER_GROUP_IDS.has(group.id)) return true;
  if (STARTER_GROUP_SOURCES.has(group.source)) return true;
  if ((group.member_count || 0) > 500 && !group.verified_partner && group.source !== 'community') {
    return true;
  }
  return false;
}

module.exports = { STARTER_GROUP_IDS, STARTER_GROUP_SOURCES, isDemoGroup };
