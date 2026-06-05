/**
 * Estate / area / street watch — bulk neighbor safety (no government).
 */
(function () {
  function t(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s || '');
  }

  async function api(path, opts = {}) {
    if (typeof window.api === 'function') return window.api(path, opts);
    throw new Error('API not ready');
  }

  function inviteUrl(code) {
    const base = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
    return `${base}/app/?estate=${encodeURIComponent(code)}`;
  }

  function shareEstateInvite(estate) {
    const link = inviteUrl(estate.join_code);
    const text = `Join our area safety watch on SafeAlert NG — "${estate.name}". Code: ${estate.join_code}\n${link}\nWhen anyone panics, neighbors get SOS. No government.`;
    if (navigator.share) {
      navigator.share({ title: estate.name, text, url: link }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  async function loadEstatePanel() {
    const root = document.getElementById('estate-area-panel');
    if (!root) return;

    if (!window.state?.token) {
      root.innerHTML = `<p style="font-size:12px;color:var(--text2);line-height:1.5">${t('estate_sign_in')}</p>`;
      return;
    }

    root.innerHTML = '<p style="font-size:12px;color:var(--text3)">Loading area watch…</p>';

    let mine = [];
    let nearby = [];
    try {
      const mineRes = await api('/estates/mine');
      mine = mineRes.estates || [];
    } catch (_) {
      /* ignore */
    }

    try {
      const lat = window.uLat;
      const lng = window.uLng;
      const q =
        lat != null && lng != null
          ? `/estates?lat=${lat}&lng=${lng}&radius_km=30`
          : '/estates?limit=15';
      const nearRes = await api(q);
      nearby = (nearRes.estates || []).filter((e) => !mine.some((m) => m.id === e.id));
    } catch (_) {
      /* ignore */
    }

    const mineHtml = mine.length
      ? mine
          .map(
            (e) => `<div class="card card-sm" style="margin-bottom:8px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:800">${esc(e.name)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">${esc(e.type || 'estate')} · ${e.member_count || 0} members · code <strong>${esc(e.join_code)}</strong></div>
          </div>
          ${e.is_admin ? '<span class="badge badge-green" style="font-size:9px">Admin</span>' : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button type="button" class="btn btn-green btn-sm" onclick='SafeAlertEstate.shareInvite(${JSON.stringify(e.id)})'>📤 ${t('estate_invite')}</button>
          <button type="button" class="btn btn-outline btn-sm" onclick='SafeAlertEstate.copyCode(${JSON.stringify(e.join_code)})'>Copy code</button>
          <button type="button" class="btn btn-outline btn-sm" style="color:var(--text3)" onclick='SafeAlertEstate.leave(${JSON.stringify(e.id)})'>${t('estate_leave')}</button>
        </div>
      </div>`
          )
          .join('')
      : `<p style="font-size:12px;color:var(--text3);margin-bottom:10px">${t('estate_none')}</p>`;

    const nearHtml = nearby.length
      ? nearby
          .slice(0, 5)
          .map(
            (e) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span>${esc(e.name)} <span style="color:var(--text3)">(${e.member_count || 0})</span></span>
        <button type="button" class="btn btn-outline btn-sm" style="font-size:10px;padding:4px 8px" onclick='SafeAlertEstate.joinCode(${JSON.stringify(e.join_code)})'>${t('estate_join')}</button>
      </div>`
          )
          .join('')
      : '';

    root.innerHTML = `
      <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:12px">${t('estate_hint')}</p>
      ${mineHtml}
      <details style="margin-top:12px">
        <summary style="font-size:13px;font-weight:700;cursor:pointer;margin-bottom:10px">${t('estate_register')}</summary>
        <label class="field-lbl">${t('estate_name')}</label>
        <input class="field-inp" id="estate-reg-name" placeholder="e.g. Royal Garden Estate Phase 2"/>
        <label class="field-lbl">${t('estate_type')}</label>
        <select class="field-inp" id="estate-reg-type">
          <option value="estate">Estate / gated community</option>
          <option value="area">Area / neighborhood</option>
          <option value="street">Street / close</option>
          <option value="market">Market / plaza</option>
        </select>
        <label class="field-lbl">State</label>
        <input class="field-inp" id="estate-reg-state" placeholder="Lagos"/>
        <label class="field-lbl">LGA (optional)</label>
        <input class="field-inp" id="estate-reg-lga" placeholder="Ikeja"/>
        <label class="field-lbl">${t('estate_radius')}</label>
        <input class="field-inp" id="estate-reg-radius" type="number" min="0.5" max="15" step="0.5" value="2.5"/>
        <p style="font-size:10px;color:var(--text3);margin-bottom:10px">${t('estate_gps_hint')}</p>
        <button type="button" class="btn btn-green btn-sm" onclick="SafeAlertEstate.register()">${t('estate_create')}</button>
      </details>
      <details style="margin-top:12px">
        <summary style="font-size:13px;font-weight:700;cursor:pointer;margin-bottom:10px">${t('estate_join_code')}</summary>
        <input class="field-inp" id="estate-join-code" placeholder="6-letter code e.g. AB12CD" style="text-transform:uppercase"/>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" onclick="SafeAlertEstate.joinFromInput()">${t('estate_join')}</button>
      </details>
      ${nearHtml ? `<div style="margin-top:14px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">${t('estate_nearby')}</div>${nearHtml}</div>` : ''}
    `;

    window._estateCache = Object.fromEntries(mine.map((e) => [e.id, e]));
  }

  async function register() {
    if (!window.state?.token) {
      window.openProfile?.();
      return window.toast?.(t('estate_sign_in'), 'err');
    }
    const name = document.getElementById('estate-reg-name')?.value?.trim();
    if (!name) return window.toast?.('Enter estate or area name', 'err');
    const { lat, lng } =
      typeof window.effectiveCoords === 'function'
        ? window.effectiveCoords()
        : { lat: window.uLat, lng: window.uLng };
    if (lat == null || lng == null) return window.toast?.('Turn on GPS for estate location', 'err');
    try {
      const res = await api('/estates/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: document.getElementById('estate-reg-type')?.value || 'estate',
          state: document.getElementById('estate-reg-state')?.value?.trim() || '',
          lga: document.getElementById('estate-reg-lga')?.value?.trim() || '',
          lat,
          lng,
          radius_km: parseFloat(document.getElementById('estate-reg-radius')?.value) || 2.5,
        }),
      });
      window.toast?.(`Created — share code ${res.estate.join_code} with neighbors`, 'ok');
      await loadEstatePanel();
      shareEstateInvite(res.estate);
    } catch (e) {
      window.toast?.(e.message, 'err');
    }
  }

  async function joinCode(code) {
    if (!window.state?.token) {
      sessionStorage.setItem('safealert_estate_pending', code);
      window.openProfile?.();
      return window.toast?.(t('estate_sign_in'), 'err');
    }
    try {
      const res = await api('/estates/join', {
        method: 'POST',
        body: JSON.stringify({ join_code: code }),
      });
      window.toast?.(res.message || t('estate_joined'), 'ok');
      await loadEstatePanel();
    } catch (e) {
      window.toast?.(e.message, 'err');
    }
  }

  function joinFromInput() {
    const code = document.getElementById('estate-join-code')?.value?.trim();
    if (!code) return window.toast?.('Enter join code', 'err');
    joinCode(code);
  }

  function copyCode(code) {
    navigator.clipboard?.writeText(code).then(() => window.toast?.('Code copied', 'ok'));
  }

  function shareInvite(estateId) {
    const e = window._estateCache?.[estateId];
    if (e) shareEstateInvite(e);
  }

  async function leave(estateId) {
    if (!confirm(t('estate_leave_confirm'))) return;
    try {
      await api(`/estates/${estateId}/leave`, { method: 'POST', body: '{}' });
      window.toast?.('Left area watch', 'ok');
      await loadEstatePanel();
    } catch (e) {
      window.toast?.(e.message, 'err');
    }
  }

  function handlePendingInvite() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('estate') || sessionStorage.getItem('safealert_estate_pending');
    if (!code) return;
    sessionStorage.setItem('safealert_estate_pending', code.toUpperCase());
    if (window.state?.token) {
      sessionStorage.removeItem('safealert_estate_pending');
      joinCode(code);
    } else {
      window.toast?.(`${t('estate_join_code')}: ${code.toUpperCase()} — sign in to join`, 'ok');
      setTimeout(() => window.openProfile?.(), 800);
    }
  }

  window.SafeAlertEstate = {
    loadEstatePanel,
    register,
    joinCode,
    joinFromInput,
    copyCode,
    shareInvite,
    leave,
    shareEstateInvite,
    handlePendingInvite,
  };

  window.addEventListener('safealert:signed-in', () => {
    const pending = sessionStorage.getItem('safealert_estate_pending');
    if (pending) {
      sessionStorage.removeItem('safealert_estate_pending');
      joinCode(pending);
    }
    loadEstatePanel();
  });

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handlePendingInvite, 1200);
  });
})();
