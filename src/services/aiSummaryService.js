/**
 * Plain-language insights summary — template fallback + optional OpenAI.
 */
const appConfig = require('../config/appConfig');

function templateSummary({ stats, area, lang }) {
  const total = stats.total_active_zones || 0;
  const critical = stats.critical_zones || 0;
  const panics = stats.active_panics || 0;
  const lines = [];

  if (lang === 'pcm') {
    if (panics > 0) lines.push(`${panics} person dey need help now — check map.`);
    if (area?.near50 > 0) {
      lines.push(`Near you: ${area.near50} alert${area.near50 > 1 ? 's' : ''}${area.nearHigh ? ` (${area.nearHigh} serious)` : ''}.`);
    } else if (area?.hasGps) {
      lines.push('Your area quiet for now — still dey watch.');
    }
    if (critical > 0) lines.push(`${critical} critical area — avoid if you fit.`);
    lines.push(`Nigeria wide: ${total} active alert${total !== 1 ? 's' : ''}.`);
    return lines.join(' ');
  }

  if (panics > 0) {
    lines.push(
      `${panics} active panic${panics > 1 ? 's' : ''} right now — open the map if you can help safely.`
    );
  }
  if (area?.hasGps) {
    if (area.near50 > 0) {
      lines.push(
        `Around you: ${area.near50} alert${area.near50 > 1 ? 's' : ''} within 50 km${area.nearHigh ? `, including ${area.nearHigh} high-risk` : ''}.`
      );
      if (area.userState) {
        lines.push(
          `You appear to be in ${area.userState} (${area.inState} alerts in that state, ${total} nationwide).`
        );
      }
    } else {
      lines.push('No active alerts within 50 km of you — your immediate area looks relatively quiet.');
    }
  } else {
    lines.push('Turn on location to see a summary for your area.');
  }
  if (critical > 0) {
    lines.push(`${critical} critical alert${critical > 1 ? 's' : ''} nationwide — treat these as avoid if possible.`);
  } else if (total > 0) {
    lines.push(`${total} active community and verified alerts on the map. Stay alert on major roads.`);
  }
  if (!lines.length) {
    lines.push('Data is still growing — report what you see to help others.');
  }
  return lines.join(' ');
}

async function callOpenAi({ stats, area, lang }) {
  const key = appConfig.openaiApiKey;
  if (!key) return null;

  const prompt = `You are SafeAlert NG, a citizen safety app for Nigeria. Write 2-3 short sentences in ${lang === 'pcm' ? 'Nigerian Pidgin' : lang === 'ha' ? 'Hausa' : 'simple English'} for everyday users (not technical). Be calm, practical, no fear-mongering. Data: ${JSON.stringify({ stats: { total_active_zones: stats.total_active_zones, critical_zones: stats.critical_zones, active_panics: stats.active_panics }, area })}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: appConfig.openaiModel,
      messages: [
        { role: 'system', content: 'Reply with only the summary text, no bullet labels.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 180,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function generateInsightsSummary({ stats, area, lang = 'en' }) {
  const template = templateSummary({ stats, area, lang });
  if (!appConfig.aiInsightsEnabled) {
    return { summary: template, source: 'template' };
  }
  if (!appConfig.aiInsightsUseOpenAi) {
    return { summary: template, source: 'template' };
  }
  try {
    const ai = await callOpenAi({ stats, area, lang });
    if (ai) return { summary: ai, source: 'openai' };
  } catch (err) {
    require('../utils/logger').warn('[AI] summary failed:', err.message);
  }
  return { summary: template, source: 'template' };
}

module.exports = { generateInsightsSummary, templateSummary };
