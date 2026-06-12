#!/usr/bin/env node
/**
 * Pull live transparency metrics for investor one-pager (Workstream C).
 * Usage: node scripts/fill-fundraise-metrics.js [baseUrl]
 *
 * Prints markdown table rows + JSON for docs/fundraise/one-pager.md
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function main() {
  const res = await fetch(`${BASE}/v1/transparency`);
  if (!res.ok) {
    console.error(`Failed GET /v1/transparency — HTTP ${res.status}`);
    console.error('Start server: npm run dev');
    process.exit(1);
  }

  const { report: r } = await res.json();
  const z = r.zones || {};
  const m = r.moderation || {};
  const c = r.community || {};

  const rows = [
    ['Active zones', z.active ?? '—', 'zones.active'],
    ['Community-verified zones', z.community_verified ?? '—', 'zones.community_verified'],
    ['Community-sourced reports', z.by_source?.community ?? '—', 'zones.by_source.community'],
    ['ACLED/HDX seed zones', z.by_source?.acled_and_hdx ?? '—', 'zones.by_source.acled_and_hdx'],
    ['False-report flags', m.false_report_flags ?? '—', 'moderation.false_report_flags'],
    ['Verified community leaders', c.verified_leaders ?? '—', 'community.verified_leaders'],
    ['Pending leader applications', c.pending_leader_applications ?? '—', 'community.pending_leader_applications'],
    ['Active field agents', c.active_field_agents ?? '—', 'community.active_field_agents'],
    ['Report generated', r.generated_at ?? '—', 'generated_at'],
  ];

  console.log('\n## Traction (auto-filled)\n');
  console.log('| Metric | Value | Source field |');
  console.log('|--------|-------|--------------|');
  for (const [label, val, field] of rows) {
    console.log(`| ${label} | ${val} | \`${field}\` |`);
  }

  console.log('\n```json');
  console.log(JSON.stringify({ generated_at: r.generated_at, zones: z, moderation: m, community: c }, null, 2));
  console.log('```\n');
  console.log(`Source: ${BASE}/v1/transparency`);
  console.log(`UI: ${BASE}/app/transparency.html\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
