/** SafeAlert app module — Route list, zone sheets, overlays */
/* eslint-disable */
function searchZones(q) {
  zoneSearchQ = (q || '').trim().toLowerCase();
  buildMapList();
}

function filterRoutes() {
  const fromQ = (document.getElementById('route-search')?.value || '').trim().toLowerCase();
  const toQ = (document.getElementById('route-search-to')?.value || '').trim().toLowerCase();
  const filtered = routes.filter((r) => {
    const matchFrom = !fromQ || r.from.toLowerCase().includes(fromQ);
    const matchTo = !toQ || r.to.toLowerCase().includes(toQ);
    return matchFrom && matchTo;
  });
  renderRoutes(filtered);
}

function renderRoutes(list) {
  const empty =
    list.length === 0
      ? '<div class="card card-sm" style="text-align:center;color:var(--text2);font-size:13px">No routes match your search</div>'
      : '';
  document.getElementById('routes-list').innerHTML =
    empty +
    list
      .map((r) => {
        const c = r.score > 65 ? '#12B76A' : r.score > 35 ? '#F79009' : '#F03E3E';
        const circ = 2 * Math.PI * 24;
        const fill = (r.score / 100) * circ;
        const wClass = r.score > 65 ? 'route-safe' : r.score > 35 ? 'route-caution' : 'route-danger';
        const wTxt = r.warn || (r.score > 65 ? '✓ Route reported clear — safe to travel' : null);
        const prefix = wTxt && !wTxt.startsWith('✓') && !wTxt.startsWith('⚠') ? (r.score > 65 ? '✓ ' : '⚠️ ') : '';
        return `<div class="route-card new-flash">
      <div class="route-head">
        <div class="score-wrap">
          <svg width="60" height="60"><circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4"/><circle cx="30" cy="30" r="24" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="${fill} ${circ}" stroke-linecap="round"/></svg>
          <div class="score-num" style="color:${c}">${r.score}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="route-name">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</div>
          <div class="route-via">via ${escapeHtml(r.via || '—')}</div>
          <div class="route-pills">
            <span class="route-pill">👥 ${r.travelers}</span>
            <span class="route-pill">🕐 ${escapeHtml(r.updated)}</span>
          </div>
        </div>
      </div>
      ${wTxt ? `<div class="route-warn ${wClass}">${prefix}${escapeHtml(wTxt)}</div>` : ''}
    </div>`;
      })
      .join('');
}

function openZoneSheet(id) {
  const z = zones.find((x) => x.id === id);
  if (!z) return;
  const c = SEV_C[z.sev] || SEV_C.medium;
  const ti = types.find((t) => t.id === z.type) || { icon: '⚠️', label: z.type };
  const vTotal = (z.vd || 0) + (z.vc || 0) || 1;
  const vPct = Math.round(((z.vd || 0) / vTotal) * 100);
  document.getElementById('zone-sheet-body').innerHTML = `
    <div class="sheet-title">${escapeHtml(z.label)}</div>
    <div class="sheet-sub">${escapeHtml(z.state)} · ${escapeHtml(z.time)} · ${z.reports} reports · ${z.ver ? '✓ Community verified' : `${z.reports}/3 confirmations needed`}</div>
    <span class="badge badge-${z.sev === 'critical' ? 'red' : z.sev === 'high' ? 'amber' : 'gray'}">${z.sev.toUpperCase()}</span>
    <div style="margin:14px 0;font-size:12px;color:var(--text2)">${escapeHtml(ti.label || z.type)}</div>
    <div style="font-size:10px;color:var(--text2);margin-bottom:6px;display:flex;justify-content:space-between">
      <span>⚠️ ${z.vd} danger</span><span>✓ ${z.vc} cleared</span>
    </div>
    <div class="pu-bar"><div class="pu-bar-fill" style="width:${vPct}%;background:${c}"></div></div>
    <div class="sheet-actions">
      <button class="btn btn-outline btn-sm" onclick="confirmZ('${z.id}');closeSheets()">Still dangerous</button>
      <button class="btn btn-green btn-sm" onclick="clearZ('${z.id}');closeSheets()">Area cleared</button>
      <button class="btn btn-outline btn-sm" style="color:var(--text3)" onclick="reportFalseZone('${z.id}');closeSheets()">Flag false report</button>
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:10px;width:100%" onclick="go('map');closeSheets();setTimeout(()=>flyTo('${z.id}'),200)">${t('view_on_map')}</button>
    <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%" onclick="shareAlertById('${z.id}')">📤 ${t('share_alert')}</button>`;
  markSheetOpened();
  document.getElementById('sheet-bg').classList.add('show');
  document.getElementById('zone-sheet').classList.add('show');
}

function clearStuckOverlays() {
  document.getElementById('loader')?.classList.remove('show');
  const bg = document.getElementById('sheet-bg');
  const anySheetOpen = document.querySelector('.sheet.show');
  if (bg && !anySheetOpen) bg.classList.remove('show');
}

function onSheetBackdropClick(e) {
  if (e.target !== e.currentTarget) return;
  if (Date.now() - sheetOpenedAt < 400) return;
  closeSheets();
}

function closeSheets() {
  if (Date.now() - sheetOpenedAt < 400) return;
  document.getElementById('sheet-bg')?.classList.remove('show');
  document.getElementById('zone-sheet')?.classList.remove('show');
  document.getElementById('profile-sheet')?.classList.remove('show');
  document.getElementById('journey-end-sheet')?.classList.remove('show');
  document.getElementById('journey-feedback-prompt')?.classList.remove('show');
  const jfb = document.getElementById('journey-feedback-prompt');
  if (jfb) jfb.style.display = 'none';
  document.getElementById('panic-disclaimer-sheet')?.classList.remove('show');
  showLoader(false);
}

