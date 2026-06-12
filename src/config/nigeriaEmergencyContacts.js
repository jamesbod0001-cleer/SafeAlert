/**
 * Nigeria emergency directory — citizen tap-to-call only.
 * Numbers vary by state/LGA; verify locally. SafeAlert never auto-dials.
 * Grouped for messy real-world structure (no single national ambulance API).
 */
module.exports = {
  disclaimer:
    'Numbers vary by state and network. Verify locally. SafeAlert does not dispatch — you choose who to call.',
  groups: [
    {
      id: 'national',
      label: 'National',
      contacts: [
        { name: '112 — Emergency (Nigeria)', phone: '112', note: 'Police / fire / ambulance routing — availability varies' },
        {
          name: 'Nigerian Red Cross',
          phone: '08026660000',
          note: 'Disaster & first aid — not a taxi ambulance',
        },
      ],
    },
    {
      id: 'medical',
      label: 'Medical & mental health',
      contacts: [
        { name: 'Survivors Support (trauma line)', phone: '08007887799', note: 'Mental health after incidents' },
        { name: 'Lagos State Emergency (LASEMA)', phone: '767', note: 'Lagos only — verify before travel' },
        { name: 'FCT Emergency', phone: '112', note: 'Abuja — use 112 or nearest hospital' },
      ],
    },
    {
      id: 'road',
      label: 'Road & traffic',
      contacts: [
        {
          name: 'FRSC — Federal Road Safety',
          phone: '122',
          note: 'Highway crashes — response times vary; call 112 if no answer',
        },
        {
          name: 'Lagos VIS / traffic emergencies',
          phone: '112',
          note: 'Use local state traffic hotline if known',
        },
      ],
    },
    {
      id: 'tips',
      label: 'If official lines fail',
      contacts: [
        {
          name: 'Your safety circle (WhatsApp)',
          phone: '',
          note: 'Often fastest — add hospital & driver contacts before you travel',
        },
        {
          name: 'Nearest hospital (in app)',
          phone: '',
          note: 'Use Medical & crash → Nearest hospital — NGO-curated list',
        },
      ],
    },
  ],
  /** Flat list for USSD / legacy EMERGENCY_CONTACTS env */
  flat: [
    { name: '112 Emergency', phone: '112', category: 'national' },
    { name: 'Nigerian Red Cross', phone: '08026660000', category: 'medical' },
    { name: 'FRSC (road crashes)', phone: '122', category: 'road' },
    { name: 'Survivors mental health', phone: '08007887799', category: 'medical' },
    { name: 'LASEMA Lagos', phone: '767', category: 'medical', state: 'Lagos' },
  ],
};
