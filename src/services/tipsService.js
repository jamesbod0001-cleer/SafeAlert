/**
 * Mental health & trauma tips — voiced in local languages.
 */
const fs = require('fs');
const path = require('path');

const TIPS_PATH = path.join(__dirname, '../../data/mental-health-tips.json');

let cache = null;

function loadTips() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(TIPS_PATH, 'utf8'));
  } catch {
    cache = [];
  }
  return cache;
}

function getTips({ lang = 'en', category }) {
  const tips = loadTips();
  let filtered = tips.filter((t) => t.active !== false);
  if (lang) {
    const langTips = filtered.filter((t) => t.lang === lang);
    if (langTips.length) filtered = langTips;
    else filtered = filtered.filter((t) => t.lang === 'en');
  }
  if (category) {
    filtered = filtered.filter((t) => t.category === category);
  }
  return filtered.map((t) => ({
    id: t.id,
    category: t.category,
    title: t.title,
    body: t.body,
    lang: t.lang,
    voice_hint: t.voice_hint || t.body,
  }));
}

module.exports = { getTips, loadTips };
