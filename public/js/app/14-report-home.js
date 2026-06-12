/** SafeAlert app module — Community report + home list */
/* eslint-disable */
// ── REPORT ────────────────────────────────────────────────────────────────────
function buildTypeGrid() {
  document.getElementById('type-grid').innerHTML = types
    .map(
      (t) => `
    <div class="t-chip" id="tc-${t.id}" onclick="pickType('${t.id}')">
      <div class="t-icon">${ico(t.icon)}</div>
      <span>${t.label}</span>
    </div>`
    )
    .join('');
}

function pickType(id) {
  selectedType = id;
  document.querySelectorAll('.t-chip').forEach((c) => c.classList.remove('sel'));
  document.getElementById('tc-' + id)?.classList.add('sel');
  document.getElementById('sn1').className = 'step-num done';
  document.getElementById('sn1').textContent = '✓';
  document.getElementById('sn2').className = 'step-num curr';
  document.getElementById('sn3').className = 'step-num wait';
  document.getElementById('sn3').textContent = '3';
  const hasGps = uLat != null && uLng != null && typeof isNigeriaCoords === 'function' && isNigeriaCoords(uLat, uLng);
  document.getElementById('sub-btn').disabled = !hasGps;
  if (typeof setGPSBox === 'function' && uLat != null && uLng != null) setGPSBox(uLat, uLng, !hasGps);
}

function bindReportDescStep() {
  const ta = document.getElementById('rdesc');
  if (!ta || ta.dataset.bound) return;
  ta.dataset.bound = '1';
  ta.addEventListener('input', () => {
    if (!selectedType) return;
    const sn2 = document.getElementById('sn2');
    if (ta.value.trim().length >= 8) {
      sn2.className = 'step-num done';
      sn2.textContent = '✓';
      document.getElementById('sn3').className = 'step-num curr';
    } else {
      sn2.className = 'step-num curr';
      sn2.textContent = '2';
    }
  });
}
window.bindReportDescStep = bindReportDescStep;

function reportQuickType(typeId) {
  if (typeof go === 'function') go('report');
  setTimeout(() => {
    if (typeof pickType === 'function') pickType(typeId);
    const ta = document.getElementById('rdesc');
    if (!ta) return;
    if (typeId === 'road_accident') {
      ta.value = 'Witnessed road crash — sharing for community awareness. Roads and response vary by state.';
    } else if (typeId === 'medical_emergency') {
      ta.value = 'Medical emergency area alert — not ambulance dispatch. Verify locally.';
    } else if (typeId === 'vehicle_breakdown') {
      ta.value = 'Vehicle breakdown / stranded — community heads-up for travelers.';
    }
  }, 350);
}
window.reportQuickType = reportQuickType;

async function submitReport() {
  if (!selectedType) return;
  const { lat, lng } = effectiveCoords();
  const desc = document.getElementById('rdesc').value;
  try {
    const res = await api('/zones', {
      method: 'POST',
      body: JSON.stringify({
        lat,
        lng,
        type: selectedType,
        description: desc,
        device_id: state.deviceId,
      }),
    });
    await refreshZones();
    document.getElementById('sub-btn').disabled = true;
    document.getElementById('sn1').className = 'step-num wait';
    document.getElementById('sn1').textContent = '1';
    document.getElementById('sn2').className = 'step-num wait';
    document.querySelectorAll('.t-chip').forEach((c) => c.classList.remove('sel'));
    document.getElementById('rdesc').value = '';
    selectedType = null;
    go('map');
    if (map) map.flyTo([lat, lng], 12, { animate: true, duration: 1.2 });
    const firstMsg = res.first_in_state ? ' 🏅 First reporter in your state!' : '';
    toast(`🚨 Report submitted! Community alerted.${firstMsg}`, res.first_in_state ? 'ok' : undefined);
  } catch (e) {
    toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
  }
}

function buildHomeList() {
  const el = document.getElementById('home-list');
  if (!el) return;
  if (!zones.length) {
    el.innerHTML =
      '<p style="font-size:12px;color:var(--text3);padding:12px;text-align:center">No active alerts in your area — map is quiet. You can still report or check routes.</p>';
    return;
  }
  el.innerHTML = zones
    .slice(0, 3)
    .map((z) => {
      const c = SEV_C[z.sev];
      const ti = types.find((t) => t.id === z.type) || { icon: '⚠️' };
      const bc = z.sev === 'critical' ? 'badge-red' : z.sev === 'high' ? 'badge-amber' : 'badge-gray';
      return `<div class="alert-row" onclick="openZoneSheet('${z.id}')" style="cursor:pointer">
      <div class="alert-icon-box" style="background:${c}15;border:1px solid ${c}33">${ico(ti.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="alert-title">${escapeHtml(z.label)}</div>
        <div class="alert-meta">${escapeHtml(z.state)} · ${escapeHtml(z.time)} · ${z.reports} reports</div>
      </div>
      <span class="badge ${bc}">${z.sev.toUpperCase()}</span>
    </div>`;
    })
    .join('');
  document.getElementById('s-hot').textContent = zones.filter((z) => z.sev === 'critical').length;
}

function buildRoutes() {
  filterRoutes();
}
