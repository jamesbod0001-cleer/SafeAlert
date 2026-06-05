/**
 * Safety Insights — your-area summary + state → LGA → event drill-down
 */
(function () {
  function pool() {
    return window.allZones?.length ? window.allZones : window.zones || [];
  }

  function t(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function getAreaSummary(s) {
    const p = pool();
    const hasGps =
      typeof window.isNigeriaCoords === 'function' && window.isNigeriaCoords(window.uLat, window.uLng);
    const near50 = hasGps && typeof window.zonesNearUser === 'function' ? window.zonesNearUser(50, p) : [];
    const near100 = hasGps && typeof window.zonesNearUser === 'function' ? window.zonesNearUser(100, p) : [];
    let userState = '';
    if (hasGps && near100.length && typeof window.haversineKm === 'function') {
      const closest = [...near100].sort(
        (a, b) =>
          window.haversineKm(window.uLat, window.uLng, a.lat, a.lng) -
          window.haversineKm(window.uLat, window.uLng, b.lat, b.lng)
      )[0];
      userState = window.normState(closest.state);
    }
    const inState = userState ? p.filter((z) => window.normState(z.state) === userState).length : 0;
    return {
      hasGps,
      near50: near50.length,
      nearHigh: near50.filter((z) => z.sev === 'critical' || z.sev === 'high').length,
      userState,
      inState,
      national: s.total_active_zones || p.length,
    };
  }

  function clickableBars(entries, color, fn) {
    if (!entries.length) return '<p style="font-size:12px;color:var(--text3)">No data yet</p>';
    const max = Math.max(...entries.map((e) => e.value), 1);
    return entries
      .map((e) => {
        const key = encodeURIComponent(String(e.key));
        return `<div class="dash-bar-row" style="cursor:pointer" onclick="${fn}('${key}')" role="button">
  <span class="dash-bar-lbl">${window.escapeHtml(e.label)}</span>
  <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round((e.value / max) * 100)}%;background:${e.color || color}"></div></div>
  <span class="dash-bar-val">${e.value} ›</span>
</div>`;
      })
      .join('');
  }

  function eventRow(z) {
    const icons = window.TYPE_ICONS || {};
    const ti = icons[z.type] || '⚠️';
    const bc = z.sev === 'critical' ? 'badge-red' : z.sev === 'high' ? 'badge-amber' : 'badge-gray';
    let dist = '';
    if (typeof window.isNigeriaCoords === 'function' && window.isNigeriaCoords(window.uLat, window.uLng)) {
      dist = ` · ${Math.round(window.haversineKm(window.uLat, window.uLng, z.lat, z.lng))} km`;
    }
    const loc = [z.place || z.lga, window.normState(z.state)].filter(Boolean).join(', ');
    return `<div class="alert-row" onclick="openEventOnMap('${z.id}')">
  <div class="alert-icon-box" style="background:var(--surface2)">${ti}</div>
  <div style="flex:1;min-width:0">
    <div class="alert-title">${window.escapeHtml(window.formatTypeLabel(z.type))}</div>
    <div class="alert-meta">${window.escapeHtml(loc)}${dist}</div>
  </div>
  <span class="badge ${bc}">${z.sev.toUpperCase()}</span>
</div>`;
  }

  window.openEventOnMap = function openEventOnMap(id) {
    if (typeof window.go === 'function') window.go('map');
    if (typeof window.loadMapZones === 'function') window.loadMapZones().catch(() => {});
    setTimeout(() => {
      if (typeof window.flyTo === 'function') window.flyTo(id);
      else if (typeof window.openZoneSheet === 'function') window.openZoneSheet(id);
    }, 400);
  };

  window.drillInsightsState = async function drillInsightsState(encoded) {
    window.insightsDrill = { level: 'state', state: decodeURIComponent(encoded), lga: '' };
    if (typeof loadAllZonesData === 'function') {
      await loadAllZonesData(window.insightsDrill.state).catch(() => {});
    }
    window.buildInsights();
  };

  window.drillInsightsLga = function drillInsightsLga(encoded) {
    window.insightsDrill = { ...window.insightsDrill, level: 'lga', lga: decodeURIComponent(encoded) };
    window.buildInsights();
  };

  window.drillInsightsBack = function drillInsightsBack() {
    const d = window.insightsDrill || { level: 'root' };
    if (d.level === 'lga') {
      window.insightsDrill = { level: 'state', state: d.state, lga: '' };
    } else {
      window.insightsDrill = { level: 'root', state: '', lga: '' };
    }
    window.buildInsights();
  };

  let nigeriaStatesCache = null;

  async function ensureNigeriaStates() {
    if (nigeriaStatesCache?.length) return nigeriaStatesCache;
    const cfg = window.publicConfig || window.SAFEALERT_PUBLIC_CONFIG;
    if (cfg?.nigeria_states?.length) {
      nigeriaStatesCache = cfg.nigeria_states;
      return nigeriaStatesCache;
    }
    if (typeof window.loadStateList === 'function') {
      nigeriaStatesCache = await window.loadStateList();
      return nigeriaStatesCache;
    }
    try {
      const res = await window.api('/config/public');
      window.publicConfig = res;
      nigeriaStatesCache = res.nigeria_states || [];
      return nigeriaStatesCache;
    } catch {
      return [];
    }
  }

  function buildStateEntries(s, allStates) {
    const byState = s.by_state || {};
    const norm = (name) => (typeof window.normState === 'function' ? window.normState(name) : name);
    const countFor = (name) => {
      const n = norm(name);
      return byState[n] ?? byState[name] ?? 0;
    };

    if (!allStates?.length) {
      return (s.top_states || []).map((st) => ({
        key: st.name,
        label: st.name,
        value: st.count,
        color: 'var(--amber)',
      }));
    }

    return allStates
      .map((st) => {
        const name = st.name || st.state || st;
        const count = countFor(name);
        return {
          key: name,
          label: count > 0 ? name : `${name} — Be the first to report`,
          value: count,
          color: count > 0 ? 'var(--amber)' : 'var(--text3)',
        };
      })
      .sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
  }

  function renderDrillPanel(s) {
    const drill = window.insightsDrill || { level: 'root' };
    const p = pool();
    const el = document.getElementById('insights-drill');
    const head = document.getElementById('insights-drill-head');
    if (!el) return;

    if (drill.level === 'root') {
      if (head) {
        head.innerHTML = `${t('hot_states')} <span style="font-weight:400;color:var(--text3)">· ${t('tap_to_explore')}</span>`;
      }
      const allStates =
        nigeriaStatesCache ||
        window.publicConfig?.nigeria_states ||
        window.SAFEALERT_PUBLIC_CONFIG?.nigeria_states ||
        [];
      const entries = buildStateEntries(s, allStates);
      el.innerHTML = entries.length
        ? clickableBars(entries, 'var(--amber)', 'drillInsightsState')
        : '<p style="font-size:12px;color:var(--text3)">No state data yet</p>';
      if (!allStates.length) {
        ensureNigeriaStates().then((states) => {
          if (!states.length) return;
          const merged = buildStateEntries(s, states);
          if (merged.length) el.innerHTML = clickableBars(merged, 'var(--amber)', 'drillInsightsState');
        });
      }
      return;
    }

    const stateName = drill.state;
    const inState = p.filter((z) => window.normState(z.state) === window.normState(stateName));

    if (drill.level === 'state') {
      if (head) {
        head.innerHTML = `<button type="button" class="btn btn-outline btn-sm" style="width:auto;padding:6px 12px;margin-bottom:8px" onclick="drillInsightsBack()">← ${t('back')}</button>
        <div style="font-size:14px;font-weight:800">${window.escapeHtml(stateName)} · ${inState.length} ${t('alerts_label')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${t('tap_lga')}</div>`;
      }
      const lgaCounts = {};
      inState.forEach((z) => {
        const lga = z.lga || z.place || t('other_areas');
        lgaCounts[lga] = (lgaCounts[lga] || 0) + 1;
      });
      const lgaEntries = Object.entries(lgaCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ key: name, label: name, value: count, color: 'var(--blue)' }));
      el.innerHTML =
        clickableBars(lgaEntries, 'var(--blue)', 'drillInsightsLga') +
        `<div class="sec-head" style="margin-top:14px">${t('all_in_state')}</div>` +
        inState
          .slice()
          .sort(
            (a, b) =>
              ({ critical: 0, high: 1, medium: 2, low: 3 }[a.sev] ?? 9) -
              ({ critical: 0, high: 1, medium: 2, low: 3 }[b.sev] ?? 9)
          )
          .slice(0, 15)
          .map((z) => eventRow(z))
          .join('');
      return;
    }

    if (drill.level === 'lga') {
      const lgaName = drill.lga;
      const inLga = inState.filter((z) => (z.lga || z.place || t('other_areas')) === lgaName);
      if (head) {
        head.innerHTML = `<button type="button" class="btn btn-outline btn-sm" style="width:auto;padding:6px 12px;margin-bottom:8px" onclick="drillInsightsBack()">← ${window.escapeHtml(lgaName)}</button>
        <div style="font-size:14px;font-weight:800">${window.escapeHtml(lgaName)}, ${window.escapeHtml(stateName)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${t('tap_event_map')}</div>`;
      }
      el.innerHTML = inLga.length
        ? inLga.map((z) => eventRow(z)).join('')
        : `<p style="font-size:12px;color:var(--text3)">${t('no_events_here')}</p>`;
    }
  }

  async function loadAiInsightsSummary(s, area) {
    const banner = document.getElementById('insight-banner');
    if (!banner || typeof window.apiGetCached !== 'function') return;
    const lang =
      typeof window.getLang === 'function'
        ? window.getLang()
        : localStorage.getItem('safealert_lang') || 'en';
    const q = new URLSearchParams({
      lang,
      has_gps: area.hasGps ? '1' : '0',
      near50: String(area.near50 || 0),
      nearHigh: String(area.nearHigh || 0),
      in_state: String(area.inState || 0),
      user_state: area.userState || '',
    });
    try {
      const data = await window.apiGetCached(`/insights/summary?${q}`, 'insights-summary');
      if (data.summary) {
        banner.innerHTML = `<span>${window.escapeHtml(data.summary)}</span>`;
        if (data.source === 'openai') {
          banner.setAttribute('title', 'AI summary');
        }
      }
    } catch {
      /* keep template banner from buildInsights */
    }
  }

  function patchBuildInsights() {
    const origBuild = window.buildInsights;
    if (!origBuild || origBuild._insightsPatched) return;

    function enhanced() {
      origBuild();
      const s = window.SafeAlertUX?.lastStats || {};
      const area = getAreaSummary(s);
      const yourArea = document.getElementById('insights-your-area');
      if (yourArea) {
        if (!area.hasGps) {
          yourArea.innerHTML = `<div class="card card-sm" style="border-color:var(--amber-border);background:var(--amber-soft)">
            <div style="font-size:13px;font-weight:700;color:var(--amber);margin-bottom:6px">📍 ${t('enable_location')}</div>
            <p style="font-size:12px;color:var(--text2);line-height:1.5">${t('enable_location_hint')}</p>
          </div>`;
        } else {
          const riskLine = area.nearHigh
            ? `<strong style="color:var(--red)">${area.nearHigh} high-risk</strong> within 50 km. `
            : '';
          const stateLine = area.userState
            ? `You appear to be in <strong>${window.escapeHtml(area.userState)}</strong> (${area.inState} alerts statewide). `
            : '';
          yourArea.innerHTML = `<div class="card" style="background:linear-gradient(145deg,rgba(18,183,106,0.1),rgba(59,130,246,0.08));border-color:var(--green-border)">
            <div style="font-size:11px;font-weight:700;color:var(--green);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${t('your_area')}</div>
            <div style="font-size:22px;font-weight:900;line-height:1.2;margin-bottom:6px">${area.near50} ${t('alerts_near_you')}</div>
            <p style="font-size:12px;color:var(--text2);line-height:1.55">${riskLine}${stateLine}${area.national} alerts across Nigeria.</p>
            <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="go('map');loadMapZones()">${t('see_on_map')}</button>
          </div>`;
        }
      }

      renderDrillPanel(s);

      const statesLegacy = document.getElementById('insights-states-wrap');
      if (statesLegacy) statesLegacy.style.display = 'none';

      const nearbyEl = document.getElementById('insights-nearby');
      if (nearbyEl && area.hasGps) {
        const near =
          typeof window.zonesNearUser === 'function' ? window.zonesNearUser(50, pool()) : [];
        if (near.length) {
          nearbyEl.innerHTML = near
            .sort(
              (a, b) =>
                ({ critical: 0, high: 1, medium: 2, low: 3 }[a.sev] ?? 9) -
                ({ critical: 0, high: 1, medium: 2, low: 3 }[b.sev] ?? 9)
            )
            .slice(0, 8)
            .map((z) => eventRow(z))
            .join('');
        }
      }

      loadAiInsightsSummary(s, area);

      if (typeof window.applyI18n === 'function') window.applyI18n();
    }
    enhanced._insightsPatched = true;
    window.buildInsights = enhanced;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchBuildInsights);
  } else {
    patchBuildInsights();
  }
  setTimeout(patchBuildInsights, 500);
})();
