/**
 * Community radio bulletin scripts — uses stats cache + small zone sample.
 */
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const statsCacheService = require('./statsCacheService');
const zoneService = require('./zoneService');

const TYPE_LABELS = {
  kidnapping: 'kidnapping risk',
  armed_robbery: 'armed robbery',
  banditry: 'bandit activity',
  terror: 'security threat',
  roadblock: 'roadblock',
  checkpoint: 'checkpoint',
  suspicious: 'suspicious activity',
};

function scriptIntro(lang) {
  if (lang === 'ha') return 'Sanarwar SafeAlert NG.';
  if (lang === 'pcm') return 'SafeAlert NG community alert.';
  return 'SafeAlert NG community safety bulletin.';
}

async function generateBulletin({ lang = 'en', state, maxItems = 5 }) {
  const { stats } = await statsCacheService.getStats();
  let top = [];

  if (state) {
    const zones = await zoneService.getZones({
      state,
      severity: 'critical',
      limit: maxItems * 2,
    });
    top = zones.slice(0, maxItems);
  } else if (stats.top_states?.length) {
    const st = stats.top_states[0].name;
    top = await zoneService.getZones({ state: st, limit: maxItems });
  }

  const lines = [scriptIntro(lang)];
  if (!top.length) {
    lines.push(
      lang === 'pcm'
        ? 'No new critical alert for now. Still dey watch road.'
        : 'No new critical alerts in this period. Stay alert on major roads.'
    );
  } else {
    for (const z of top) {
      const place = [z.lga, z.state].filter(Boolean).join(', ') || 'Nigeria';
      const label = TYPE_LABELS[z.type] || z.type;
      lines.push(`${label} reported near ${place}.`);
    }
    lines.push(
      lang === 'pcm'
        ? 'Check SafeAlert map before you travel.'
        : 'Check the SafeAlert map before you travel.'
    );
  }

  const script = lines.join(' ');
  const duration_estimate_sec = Math.min(90, Math.max(25, Math.ceil(script.length / 12)));

  return {
    lang,
    state: state || stats.top_states?.[0]?.name || 'Nigeria',
    generated_at: new Date().toISOString(),
    script,
    duration_estimate_sec,
    alert_count: top.length,
    items: top.map((z) => ({
      type: z.type,
      severity: z.severity,
      state: z.state,
      lga: z.lga,
    })),
  };
}

module.exports = { generateBulletin };
