/** Citizen SOS reason — drives messaging and helper matching (not government dispatch). */
const PANIC_REASONS = ['medical', 'road_accident', 'security', 'other'];

const PANIC_REASON_LABELS = {
  medical: 'Medical emergency',
  road_accident: 'Road accident',
  security: 'Security / crime',
  other: 'Other emergency',
};

function normalizePanicReason(raw) {
  const r = String(raw || 'security').toLowerCase().replace(/\s+/g, '_');
  if (r === 'crash' || r === 'accident') return 'road_accident';
  if (PANIC_REASONS.includes(r)) return r;
  return 'security';
}

module.exports = { PANIC_REASONS, PANIC_REASON_LABELS, normalizePanicReason };
