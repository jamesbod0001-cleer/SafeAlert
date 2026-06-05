/**
 * Tier 1–3 community features UI — leaders, agents, schools, offline, tips, reputation.
 */
(function () {
  function t(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  async function api(path, opts = {}) {
    if (typeof window.api === 'function') return window.api(path, opts);
    throw new Error('API not ready');
  }

  async function loadTrustScreen() {
    const root = document.getElementById('trust-content');
    if (!root) return;
    root.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:12px 0">Loading…</p>';

    const jobs = [
      api('/leaders').catch(() => ({ leaders: [] })),
      api('/agents').catch(() => ({ agents: [] })),
      api('/offline/packs').catch(() => ({ packs: [] })),
      api('/tips?lang=' + (localStorage.getItem('safealert_lang') || 'en')).catch(() => ({ tips: [] })),
      api('/reputation/leaderboard?limit=10').catch(() => ({ leaderboard: [] })),
      api('/partners/zero-rating').catch(() => ({})),
    ];

    const [leadersRes, agentsRes, packsRes, tipsRes, repRes, zeroRes] = await Promise.all(jobs);

    const leaders = leadersRes.leaders || [];
    const agents = agentsRes.agents || [];
    const packs = packsRes.packs || [];
    const tips = tipsRes.tips || [];
    const board = repRes.leaderboard || [];

    root.innerHTML = `
      <div class="card card-sm data-saver-banner" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">💰 ${t('budget_free_tools')}</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">${t('budget_free_tools_hint')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn btn-outline btn-sm" onclick="typeof shareApp==='function'&&shareApp()">${t('budget_share_app')}</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="go('map')">🗺 ${t('map')}</button>
        </div>
      </div>

      <div class="card card-sm" style="margin-bottom:12px;cursor:pointer" onclick="go('circle')">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <div style="font-size:14px;font-weight:800">🏘 ${t('estate_title')}</div>
            <p style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.45">${t('estate_hint')}</p>
          </div>
          <span style="font-size:20px;color:var(--text3)">›</span>
        </div>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">📊 ${t('trust_transparency')}</div>
        <p style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">${t('trust_transparency_hint')}</p>
        <a class="btn btn-outline btn-sm" href="transparency.html" style="display:inline-block;text-align:center;text-decoration:none">↗ ${t('open_transparency')}</a>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🏅 ${t('trust_leaderboard')}</div>
        ${
          board.length
            ? board
                .map(
                  (r) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span>#${r.rank} ${window.escapeHtml(r.display_name)}</span>
          <span style="font-weight:700;color:var(--green)">${r.score} pts</span>
        </div>`
                )
                .join('')
            : `<p style="font-size:12px;color:var(--text3)">${t('trust_leaderboard_empty')}</p>`
        }
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">⭐ ${t('trust_leaders')}</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:10px">${t('trust_leaders_hint')}</p>
        ${
          leaders.length
            ? leaders
                .slice(0, 8)
                .map(
                  (l) => `<div style="font-size:12px;padding:8px 0;border-bottom:1px solid var(--border)">
            <strong>${window.escapeHtml(l.org_name || l.role_label)}</strong>
            <div style="color:var(--text3)">${window.escapeHtml(l.state)}${l.lga ? ' · ' + window.escapeHtml(l.lga) : ''}</div>
          </div>`
                )
                .join('')
            : `<p style="font-size:12px;color:var(--text3)">${t('trust_leaders_empty')}</p>`
        }
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="applyCommunityLeader()">${t('apply_leader')}</button>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">📡 ${t('trust_offline')}</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:10px">${t('trust_offline_hint')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="offline-pack-btns">
          ${packs
            .slice(0, 10)
            .map(
              (p) =>
                `<button type="button" class="btn btn-outline btn-sm" onclick="downloadOfflinePack('${window.escapeHtml(p.state)}')">${window.escapeHtml(p.state)}</button>`
            )
            .join('')}
        </div>
        <p id="offline-pack-status" style="font-size:11px;color:var(--text3);margin-top:8px"></p>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🤝 ${t('trust_agents')}</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:8px">${t('trust_agents_hint')}</p>
        <p style="font-size:12px;color:var(--text3)">${agents.length} ${t('agents_nearby')}</p>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" onclick="registerFieldAgent()">${t('become_agent')}</button>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🏫 ${t('trust_schools')}</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:8px">${t('trust_schools_hint')}</p>
        <button type="button" class="btn btn-outline btn-sm" onclick="registerSchoolSafety()">${t('register_school')}</button>
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">💚 ${t('trust_wellbeing')}</div>
        ${tips
          .slice(0, 3)
          .map(
            (tip) => `<div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700">${window.escapeHtml(tip.title)}</div>
          <p style="font-size:11px;color:var(--text2);line-height:1.5">${window.escapeHtml(tip.body)}</p>
          <button type="button" class="btn btn-outline btn-sm" onclick="playWellbeingTip(this)" data-tip="${window.escapeHtml(tip.voice_hint)}">🔊 ${t('listen')}</button>
        </div>`
          )
          .join('')}
      </div>

      <div class="card card-sm" style="margin-bottom:12px">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">📻 ${t('trust_radio')}</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="copyRadioBulletin()">${t('copy_radio_script')}</button>
        <pre id="radio-script" style="font-size:10px;color:var(--text2);white-space:pre-wrap;margin-top:10px;display:none"></pre>
      </div>

      <div class="ussd-banner">
        <div class="ussd-icon">💬</div>
        <div>
          <div class="ussd-title">WhatsApp</div>
          <div class="ussd-body">${t('whatsapp_hint')}</div>
        </div>
      </div>

      <div class="card card-sm" style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;color:var(--amber)">${t('zero_rating_title')}</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-top:6px">${window.escapeHtml(zeroRes.message || '')}</p>
      </div>`;

    if (typeof window.applyI18n === 'function') window.applyI18n();
  }

  window.loadTrustScreen = loadTrustScreen;

  window.playWellbeingTip = function playWellbeingTip(btn) {
    const text = btn?.getAttribute('data-tip');
    if (text && window.SafeAlertVoice) window.SafeAlertVoice.speak(text);
  };

  window.toggleVoiceMode = function toggleVoiceMode() {
    const on = document.getElementById('pref-voice-mode')?.checked;
    if (window.SafeAlertVoice) window.SafeAlertVoice.setEnabled(!!on);
  };

  window.toggleIconMode = function toggleIconMode() {
    const on = document.getElementById('pref-icon-only')?.checked;
    if (window.SafeAlertIconMode) window.SafeAlertIconMode.setEnabled(!!on);
  };

  window.downloadOfflinePack = async function downloadOfflinePack(state) {
    const el = document.getElementById('offline-pack-status');
    try {
      const pack = await api('/offline/packs/' + encodeURIComponent(state));
      const key = 'safealert_offline_' + state.toLowerCase().replace(/\s+/g, '_');
      localStorage.setItem(key, JSON.stringify(pack));
      if (el) el.textContent = `✓ ${state}: ${pack.zone_count} alerts saved for offline use`;
      if (window.toast) window.toast(`Offline map saved: ${state}`, 'ok');
    } catch (e) {
      if (el) el.textContent = e.message;
      if (window.toast) window.toast(e.message, 'err');
    }
  };

  window.applyCommunityLeader = async function applyCommunityLeader() {
    if (!(await window.ensureAuth())) return;
    const role = prompt('Role: union_chair, market_leader, village_head, vigilante_captain, religious_leader, radio_partner');
    if (!role) return;
    const org_name = prompt('Organisation / community name');
    const state = prompt('State');
    if (!org_name || !state) return toast('Need organisation name and state', 'err');
    try {
      await api('/leaders/apply', {
        method: 'POST',
        body: JSON.stringify({ role, org_name, state, lga: '', ward: '' }),
      });
      toast('Application sent — thank you', 'ok');
      loadTrustScreen();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.registerFieldAgent = async function registerFieldAgent() {
    if (!(await window.ensureAuth())) return;
    const display_name = prompt('Your name (as shown to neighbours)');
    const state = prompt('State');
    if (!display_name || !state) return;
    try {
      await api('/agents/register', {
        method: 'POST',
        body: JSON.stringify({ display_name, state, can_read_aloud: true }),
      });
      toast('Registered as field agent', 'ok');
      loadTrustScreen();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.registerSchoolSafety = async function registerSchoolSafety() {
    if (!(await window.ensureAuth())) return;
    const name = prompt('School name');
    const state = prompt('State');
    if (!name || !state) return;
    const coords = window.effectiveCoords ? window.effectiveCoords() : { lat: 9.08, lng: 8.67 };
    try {
      await api('/schools/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          state,
          lat: coords.lat,
          lng: coords.lng,
          radius_km: 5,
        }),
      });
      toast('School registered for safety alerts', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.copyRadioBulletin = async function copyRadioBulletin() {
    try {
      const lang = localStorage.getItem('safealert_lang') || 'en';
      const b = await api('/radio/bulletin?lang=' + lang);
      const pre = document.getElementById('radio-script');
      if (pre) {
        pre.style.display = 'block';
        pre.textContent = b.script;
      }
      await navigator.clipboard.writeText(b.script);
      toast('Radio script copied (~' + b.duration_estimate_sec + 's read)', 'ok');
    } catch (e) {
      toast(e.message || 'Copy failed', 'err');
    }
  };

  /** Offline zone warning using cached pack */
  window.checkOfflineZoneWarning = function checkOfflineZoneWarning(lat, lng) {
    if (!lat || !lng) return;
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('safealert_offline_'));
    for (const key of keys) {
      try {
        const pack = JSON.parse(localStorage.getItem(key));
        for (const z of pack.zones || []) {
          if (typeof window.haversineKm !== 'function') continue;
          const d = window.haversineKm(lat, lng, z.lat, z.lng);
          if (d < 5 && (z.severity === 'critical' || z.severity === 'high')) {
            const msg = `Warning: ${z.type} alert about ${Math.round(d)} km away (offline data)`;
            if (window.SafeAlertVoice?.isEnabled()) window.SafeAlertVoice.speak(msg);
            else if (window.toast) window.toast(msg, 'err');
            return;
          }
        }
      } catch {
        /* skip */
      }
    }
  };

  const origGo = window.go;
  if (origGo && !origGo._tierPatched) {
    window.go = function (id, ...args) {
      const r = origGo(id, ...args);
      if (id === 'trust') loadTrustScreen();
      return r;
    };
    window.go._tierPatched = true;
  }
})();
