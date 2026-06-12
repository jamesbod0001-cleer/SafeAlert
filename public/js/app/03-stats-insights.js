/** SafeAlert app module — Dashboard stats and insights */
/* eslint-disable */
function applyStats(s) {
  window.SafeAlertUX = window.SafeAlertUX || {};
  window.SafeAlertUX.lastStats = s;
  const hotEl = document.getElementById('s-hot');
  if (hotEl) hotEl.textContent = s.critical_zones ?? zones.filter((z) => z.sev === 'critical').length;
  liveN = s.live_count ?? (s.active_panics ?? 0) + (s.critical_zones ?? 0);
  const liveEl = document.getElementById('live-n');
  if (liveEl) liveEl.textContent = String(liveN);
  const liveLbl = document.getElementById('live-lbl');
  if (liveLbl) {
    liveLbl.textContent = 'ACTIVE';
    liveLbl.title = `${s.active_panics ?? 0} active panic(s) · ${s.critical_zones ?? 0} critical zone(s)`;
  }
  if (currentScreen === 'insights') buildInsights();
}

function formatTypeLabel(type) {
  return String(type || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSourceLabel(src) {
  const map = {
    ucdp: 'UCDP (verified)',
    acled: 'ACLED (live)',
    community: 'Community reports',
    user_report: 'User reports',
    import: 'Imported data',
  };
  return map[src] || formatTypeLabel(src);
}

function renderDashBars(entries, color = 'var(--green)') {
  if (!entries.length) {
    return '<p style="font-size:12px;color:var(--text3)">No data yet</p>';
  }
  const max = Math.max(...entries.map((e) => e.value), 1);
  return entries
    .map(
      (e) => `<div class="dash-bar-row">
  <span class="dash-bar-lbl" title="${escapeHtml(e.label)}">${escapeHtml(e.label)}</span>
  <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round((e.value / max) * 100)}%;background:${e.color || color}"></div></div>
  <span class="dash-bar-val">${e.value}</span>
</div>`
    )
    .join('');
}

function generateInsightLines(s, nearbyCount) {
  const lines = [];
  const total = s.total_active_zones || 0;
  const critical = s.critical_zones || 0;
  const verified = s.verified_zones || 0;
  const panics = s.active_panics || 0;

  if (panics > 0) {
    lines.push(`<strong>${panics} active panic${panics > 1 ? 's' : ''}</strong> — someone may need help nearby.`);
  }
  if (critical > 0) {
    lines.push(`<strong>${critical} critical alert${critical > 1 ? 's' : ''}</strong> — avoid these areas if you can.`);
  } else if (total > 0) {
    lines.push('No critical zones right now — stay aware of high-risk areas on the map.');
  }
  if (total > 0 && verified > 0) {
    const pct = Math.round((verified / total) * 100);
    lines.push(`${pct}% of active alerts are <strong>verified</strong> (${verified} of ${total}).`);
  }
  const topStates = s.top_states || [];
  if (topStates[0]) {
    lines.push(`Most reported activity: <strong>${escapeHtml(topStates[0].name)}</strong> (${topStates[0].count} alerts).`);
  }
  const byType = s.by_type || {};
  const topType = Object.entries(byType)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (topType) {
    lines.push(`Top incident type: <strong>${escapeHtml(formatTypeLabel(topType[0]))}</strong> (${topType[1]}).`);
  }
  if (nearbyCount > 0) {
    lines.push(`<strong>${nearbyCount}</strong> alert${nearbyCount > 1 ? 's' : ''} within ~50 km of you.`);
  }
  if (!lines.length) {
    lines.push('Community data is still building — report incidents or check back soon.');
  }
  return lines.join(' ');
}

function countZonesNearUser(km = 50) {
  const src = allZones.length ? allZones : zones;
  return zonesNearUser(km, src).length;
}

function buildInsights() {
  const body = document.getElementById('insights-body');
  const loading = document.getElementById('insights-loading');
  if (!body) return;

  const s = window.SafeAlertUX?.lastStats || {};
  loading.style.display = 'none';
  body.style.display = 'block';

  const nearbyCount = countZonesNearUser(50);
  const banner = document.getElementById('insight-banner');
  if (banner) banner.innerHTML = generateInsightLines(s, nearbyCount);

  const kpis = document.getElementById('insights-kpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--red)">${s.total_active_zones ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_active_zones')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--amber)">${s.total_reports ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_reports')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--green)">${s.verified_zones ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_verified')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--blue)">${s.live_count ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_live')}</div></div>`;
  }

  const crit = s.critical_zones || 0;
  const high = s.high_zones || 0;
  const med = s.medium_zones || 0;
  const low = s.low_zones || 0;
  const sevTotal = crit + high + med + low || 1;
  const stack = document.getElementById('insights-sev-stack');
  if (stack) {
    stack.innerHTML = `
      <div class="sev-seg" style="flex:${crit};background:var(--red)" title="Critical"></div>
      <div class="sev-seg" style="flex:${high};background:var(--amber)" title="High"></div>
      <div class="sev-seg" style="flex:${med};background:#FFB300" title="Medium"></div>
      <div class="sev-seg" style="flex:${low};background:var(--green)" title="Low"></div>`;
  }
  const legend = document.getElementById('insights-sev-legend');
  if (legend) {
    legend.innerHTML = [
      ['Critical', crit, 'var(--red)'],
      ['High', high, 'var(--amber)'],
      ['Medium', med, '#FFB300'],
      ['Low', low, 'var(--green)'],
    ]
      .map(
        ([lbl, n, c]) =>
          `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px"></span>${lbl}: ${n}</span>`
      )
      .join('');
  }

  const typeEntries = Object.entries(s.by_type || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({
      label: formatTypeLabel(type),
      value,
      color: type === 'banditry' || type === 'terror' ? 'var(--red)' : type === 'armed_robbery' ? 'var(--amber)' : 'var(--blue)',
    }));
  const typesEl = document.getElementById('insights-types');
  if (typesEl) typesEl.innerHTML = renderDashBars(typeEntries);

  const stateEntries = (s.top_states || []).map((st) => ({
    label: st.name,
    value: st.count,
    color: 'var(--amber)',
  }));
  const statesEl = document.getElementById('insights-states');
  if (statesEl) {
    statesEl.innerHTML = stateEntries.length
      ? renderDashBars(stateEntries, 'var(--amber)')
      : '<p style="font-size:12px;color:var(--text3)">No state breakdown yet</p>';
  }

  const sourceEntries = Object.entries(s.by_source || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([src, value]) => ({ label: formatSourceLabel(src), value, color: 'var(--blue)' }));
  const sourcesEl = document.getElementById('insights-sources');
  if (sourcesEl) {
    sourcesEl.innerHTML = sourceEntries.length
      ? renderDashBars(sourceEntries, 'var(--blue)')
      : '<p style="font-size:12px;color:var(--text3)">Community reports only</p>';
  }

  const safeRoutes = routes.filter((r) => r.score >= 65).length;
  const riskyRoutes = routes.filter((r) => r.score < 35).length;
  const routesEl = document.getElementById('insights-routes');
  if (routesEl) {
    if (!routes.length) {
      routesEl.innerHTML =
        '<p style="font-size:12px;color:var(--text2);line-height:1.5">No traveller-rated routes yet. Scores appear when people share journey safety.</p>';
    } else {
      routesEl.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:10px">
          <div><span style="font-size:22px;font-weight:900;color:var(--green)">${safeRoutes}</span><div style="font-size:10px;color:var(--text3)">${t('routes_safe')}</div></div>
          <div><span style="font-size:22px;font-weight:900;color:var(--red)">${riskyRoutes}</span><div style="font-size:10px;color:var(--text3)">${t('routes_risky')}</div></div>
          <div><span style="font-size:22px;font-weight:900;color:var(--text)">${routes.length}</span><div style="font-size:10px;color:var(--text3)">${t('routes_total')}</div></div>
        </div>
        ${renderDashBars(
          routes
            .slice()
            .sort((a, b) => a.score - b.score)
            .slice(0, 5)
            .map((r) => ({
              label: `${r.from} → ${r.to}`,
              value: r.score,
              color: r.score >= 65 ? 'var(--green)' : r.score < 35 ? 'var(--red)' : 'var(--amber)',
            })),
          'var(--green)'
        )}`;
    }
  }
  const safeEl = document.getElementById('s-safe');
  if (safeEl) safeEl.textContent = String(safeRoutes);

  const nearbyEl = document.getElementById('insights-nearby');
  if (nearbyEl) {
    if (!isNigeriaCoords(uLat, uLng)) {
      nearbyEl.innerHTML =
        '<div class="card card-sm"><p style="font-size:12px;color:var(--text2)">Enable location to see alerts near you.</p></div>';
    } else if (!nearbyCount) {
      nearbyEl.innerHTML =
        '<div class="card card-sm"><p style="font-size:12px;color:var(--green);font-weight:600">No active alerts within 50 km — relatively quiet around you.</p></div>';
    } else {
      const near = zones
        .filter((z) => {
          const R = 6371;
          const dLat = ((z.lat - uLat) * Math.PI) / 180;
          const dLng = ((z.lng - uLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((uLat * Math.PI) / 180) * Math.cos((z.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 50;
        })
        .sort((a, b) => {
          const rank = { critical: 0, high: 1, medium: 2, low: 3 };
          return (rank[a.sev] ?? 9) - (rank[b.sev] ?? 9);
        })
        .slice(0, 5);
      nearbyEl.innerHTML = near
        .map(
          (z) => `<div class="alert-row" onclick="flyTo(${z.lat},${z.lng});go('map')">
  <div class="alert-icon-box" style="background:var(--surface2)">${ico(z.type)}</div>
  <div style="flex:1;min-width:0">
    <div class="alert-title">${escapeHtml(z.label)}</div>
    <div class="alert-meta">${escapeHtml(z.state)} · ${z.reports} reports · ${z.time}</div>
  </div>
  <span class="badge badge-${z.sev === 'critical' ? 'red' : z.sev === 'high' ? 'amber' : 'gray'}">${z.sev.toUpperCase()}</span>
</div>`
        )
        .join('');
    }
  }

  const updated = document.getElementById('insights-updated');
  if (updated && s.last_updated) {
    const d = new Date(s.last_updated);
    updated.textContent = `${t('last_updated')}: ${d.toLocaleString()}`;
  }
}

async function loadInsightsData() {
  const loading = document.getElementById('insights-loading');
  const body = document.getElementById('insights-body');
  if (loading) loading.style.display = 'block';
  if (body) body.style.display = 'none';
  insightsDrill = { level: 'root', state: '', lga: '' };
  await loadStatsOnly();
  await loadZonesData();
  if (!allZones.length) await loadAllZonesData().catch(() => {});
  if (!routesLoaded) {
    try {
      await loadRoutesData();
    } catch {
      /* optional */
    }
  }
  insightsLoaded = true;
  buildInsights();
}

function showDataNote(note) {
  if (!note) return;
  let bar = document.getElementById('data-status-banner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'data-status-banner';
    bar.style.cssText =
      'margin:0 18px 10px;padding:10px 12px;font-size:11px;line-height:1.45;background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:var(--r-sm);color:var(--amber)';
    const home = document.getElementById('screen-home');
    if (home) home.insertBefore(bar, home.querySelector('.card'));
  }
  bar.textContent = note;
  bar.style.display = 'block';
}

async function loadStatsOnly() {
  const statsRes = await apiGetCached('/stats', 'stats');
  applyStats(statsRes.stats || {});
  if (statsRes.data_note) showDataNote(statsRes.data_note);
}
