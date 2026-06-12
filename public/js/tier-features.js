/**
 * Community tools UI — leaders, agents, schools, offline packs, reputation.
 */
(function () {
  const LEADER_ROLES = {
    village_head: 'Village / community head',
    union_chair: 'Drivers / union chairman',
    market_leader: 'Market association leader',
    vigilante_captain: 'Vigilante coordinator',
    religious_leader: 'Church / mosque leader',
    student_security: 'Student union security',
    ngo_partner: 'NGO partner',
    radio_partner: 'Community radio partner',
  };

  let trustTips = [];
  let trustPacks = [];
  let trustLoading = false;

  function t(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s ?? '');
  }

  async function api(path, opts = {}) {
    if (typeof window.api === 'function') return window.api(path, opts);
    throw new Error('API not ready');
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type);
  }

  function userState() {
    return (
      localStorage.getItem('safealert_state') ||
      window.state?.preferences?.home_state ||
      ''
    );
  }

  function packStorageKey(state) {
    return 'safealert_offline_' + String(state).toLowerCase().replace(/\s+/g, '_');
  }

  function isPackSaved(state) {
    try {
      return !!localStorage.getItem(packStorageKey(state));
    } catch {
      return false;
    }
  }

  async function stateOptions(selected) {
    let states = [];
    if (typeof window.loadStateList === 'function') {
      states = await window.loadStateList();
    } else if (window.publicConfig?.nigeria_states?.length) {
      states = window.publicConfig.nigeria_states;
    }
    const sel = selected || userState();
    const opts = states.map((st) => {
      const name = st.name || st;
      return `<option value="${esc(name)}"${name === sel ? ' selected' : ''}>${esc(name)}</option>`;
    });
    return (
      `<option value="">Select state…</option>` +
      opts.join('') +
      (sel && !states.some((st) => (st.name || st) === sel)
        ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>`
        : '')
    );
  }

  function openFormSheet({ title, sub, bodyHtml, onSubmit }) {
    const titleEl = document.getElementById('community-form-title');
    const subEl = document.getElementById('community-form-sub');
    const bodyEl = document.getElementById('community-form-body');
    const submitBtn = document.getElementById('community-form-submit');
    if (!titleEl || !bodyEl || !submitBtn) return;

    titleEl.textContent = title;
    if (subEl) {
      subEl.textContent = sub || '';
      subEl.style.display = sub ? 'block' : 'none';
    }
    bodyEl.innerHTML = bodyHtml;

    const handler = async () => {
      submitBtn.disabled = true;
      try {
        await onSubmit();
        if (typeof window.closeAllSheets === 'function') window.closeAllSheets();
      } catch (e) {
        toast(e.message || 'Something went wrong', 'err');
      } finally {
        submitBtn.disabled = false;
      }
    };

    submitBtn.replaceWith(submitBtn.cloneNode(true));
    const freshSubmit = document.getElementById('community-form-submit');
    freshSubmit.addEventListener('click', handler);

    if (typeof window.markSheetOpened === 'function') window.markSheetOpened();
    else window.sheetOpenedAt = Date.now();
    document.getElementById('sheet-bg')?.classList.add('show');
    document.getElementById('community-form-sheet')?.classList.add('show');
  }

  window.openLeaderApplyForm = async function openLeaderApplyForm() {
    if (!(await window.ensureAuth())) return;
    const statesHtml = await stateOptions(userState());
    openFormSheet({
      title: t('apply_leader'),
      sub: t('trust_leaders_hint'),
      bodyHtml: `
        <label class="field-lbl">Your role</label>
        <select class="field-inp" id="cf-leader-role">
          ${Object.entries(LEADER_ROLES)
            .map(([k, label]) => `<option value="${k}">${esc(label)}</option>`)
            .join('')}
        </select>
        <label class="field-lbl">Organisation / community name</label>
        <input class="field-inp" id="cf-leader-org" placeholder="e.g. Mile 12 Market Association"/>
        <label class="field-lbl">State</label>
        <select class="field-inp" id="cf-leader-state">${statesHtml}</select>
        <label class="field-lbl">LGA (optional)</label>
        <input class="field-inp" id="cf-leader-lga" placeholder="e.g. Kosofe"/>
        <label class="field-lbl">Ward (optional)</label>
        <input class="field-inp" id="cf-leader-ward" placeholder=""/>
        <label class="field-lbl">Phone (optional)</label>
        <input class="field-inp" id="cf-leader-phone" type="tel" placeholder="+234…"/>
      `,
      onSubmit: async () => {
        const role = document.getElementById('cf-leader-role')?.value;
        const org_name = document.getElementById('cf-leader-org')?.value?.trim();
        const state = document.getElementById('cf-leader-state')?.value?.trim();
        if (!org_name || !state) throw new Error('Organisation name and state are required');
        await api('/leaders/apply', {
          method: 'POST',
          body: JSON.stringify({
            role,
            org_name,
            state,
            lga: document.getElementById('cf-leader-lga')?.value?.trim() || '',
            ward: document.getElementById('cf-leader-ward')?.value?.trim() || '',
            phone: document.getElementById('cf-leader-phone')?.value?.trim() || '',
          }),
        });
        toast('Application sent — we will review it soon', 'ok');
        loadTrustScreen();
      },
    });
  };

  window.openAgentRegisterForm = async function openAgentRegisterForm() {
    if (!(await window.ensureAuth())) return;
    const statesHtml = await stateOptions(userState());
    openFormSheet({
      title: t('become_agent'),
      sub: t('trust_agents_hint'),
      bodyHtml: `
        <label class="field-lbl">Display name</label>
        <input class="field-inp" id="cf-agent-name" placeholder="Name shown to neighbours"/>
        <label class="field-lbl">State</label>
        <select class="field-inp" id="cf-agent-state">${statesHtml}</select>
        <label class="field-lbl">LGA (optional)</label>
        <input class="field-inp" id="cf-agent-lga" placeholder=""/>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:8px 0 12px">
          <input type="checkbox" id="cf-agent-read" checked/>
          I can read alerts aloud for people who cannot read
        </label>
      `,
      onSubmit: async () => {
        const display_name = document.getElementById('cf-agent-name')?.value?.trim();
        const state = document.getElementById('cf-agent-state')?.value?.trim();
        if (!display_name || !state) throw new Error('Name and state are required');
        await api('/agents/register', {
          method: 'POST',
          body: JSON.stringify({
            display_name,
            state,
            lga: document.getElementById('cf-agent-lga')?.value?.trim() || '',
            can_read_aloud: !!document.getElementById('cf-agent-read')?.checked,
          }),
        });
        toast('Registered as field agent — thank you', 'ok');
        loadTrustScreen();
      },
    });
  };

  window.openSchoolRegisterForm = async function openSchoolRegisterForm() {
    if (!(await window.ensureAuth())) return;
    const statesHtml = await stateOptions(userState());
    const coords =
      typeof window.effectiveCoords === 'function'
        ? window.effectiveCoords()
        : { lat: window.uLat, lng: window.uLng };
    const gpsNote =
      coords.lat != null && coords.lng != null
        ? `GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        : 'Turn on location for accurate school pin';
    openFormSheet({
      title: t('register_school'),
      sub: t('trust_schools_hint'),
      bodyHtml: `
        <label class="field-lbl">School name</label>
        <input class="field-inp" id="cf-school-name" placeholder="e.g. Government Secondary School"/>
        <label class="field-lbl">State</label>
        <select class="field-inp" id="cf-school-state">${statesHtml}</select>
        <label class="field-lbl">Alert radius (km)</label>
        <input class="field-inp" id="cf-school-radius" type="number" min="1" max="15" step="0.5" value="5"/>
        <p style="font-size:10px;color:var(--text3);margin-bottom:10px">${esc(gpsNote)}</p>
      `,
      onSubmit: async () => {
        const name = document.getElementById('cf-school-name')?.value?.trim();
        const state = document.getElementById('cf-school-state')?.value?.trim();
        const { lat, lng } =
          typeof window.effectiveCoords === 'function'
            ? window.effectiveCoords()
            : { lat: window.uLat, lng: window.uLng };
        if (!name || !state) throw new Error('School name and state are required');
        if (lat == null || lng == null) throw new Error('Turn on GPS to pin the school location');
        await api('/schools/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            state,
            lat,
            lng,
            radius_km: parseFloat(document.getElementById('cf-school-radius')?.value) || 5,
          }),
        });
        toast('School registered for safety alerts', 'ok');
        loadTrustScreen();
      },
    });
  };

  function renderPackButtons(packs, filter) {
    const home = userState();
    const q = (filter || '').trim().toLowerCase();
    const sorted = [...packs].sort((a, b) => String(a.state).localeCompare(String(b.state)));
    const filtered = q
      ? sorted.filter((p) => String(p.state).toLowerCase().includes(q))
      : sorted;

    if (!filtered.length) {
      return `<p class="trust-empty">${q ? 'No states match your search.' : 'No offline packs available yet.'}</p>`;
    }

    return filtered
      .map((p) => {
        const saved = isPackSaved(p.state);
        const isHome = home && p.state === home;
        const cls = ['trust-pack-btn', saved ? 'saved' : '', isHome ? 'home' : ''].filter(Boolean).join(' ');
        const label = saved ? `✓ ${p.state}` : p.state;
        return `<button type="button" class="${cls}" onclick='downloadOfflinePack(${JSON.stringify(p.state)})' title="${p.zone_count || 0} alerts">${esc(label)}</button>`;
      })
      .join('');
  }

  function filterOfflinePacks(value) {
    const grid = document.getElementById('offline-pack-grid');
    if (grid) grid.innerHTML = renderPackButtons(trustPacks, value);
  }

  async function loadTrustScreen() {
    const root = document.getElementById('trust-content');
    if (!root || trustLoading) return;
    trustLoading = true;

    root.innerHTML = `
      <div class="trust-toolbar">
        <span class="updated-chip" id="trust-updated">Loading community tools…</span>
        <button type="button" class="trust-refresh" id="trust-refresh-btn" title="Refresh" aria-label="Refresh">↻</button>
      </div>
      <div class="trust-card"><p class="trust-empty">Loading…</p></div>`;

    document.getElementById('trust-refresh-btn')?.addEventListener('click', () => {
      trustLoading = false;
      loadTrustScreen();
    });

    const lang = localStorage.getItem('safealert_lang') || 'en';
    const home = userState();

    const jobs = [
      api('/leaders').catch(() => ({ leaders: [] })),
      api('/agents').catch(() => ({ agents: [] })),
      api('/offline/packs').catch(() => ({ packs: [] })),
      api('/tips?lang=' + lang).catch(() => ({ tips: [] })),
      api('/reputation/leaderboard?limit=10').catch(() => ({ leaderboard: [] })),
      api('/partners/zero-rating').catch(() => ({})),
      window.state?.token
        ? api('/reputation/me').catch(() => ({ reputation: null }))
        : Promise.resolve({ reputation: null }),
    ];

    try {
      const [leadersRes, agentsRes, packsRes, tipsRes, repRes, zeroRes, meRes] = await Promise.all(jobs);

      const leaders = leadersRes.leaders || [];
      const agents = agentsRes.agents || [];
      trustPacks = packsRes.packs || [];
      trustTips = tipsRes.tips || [];
      const board = repRes.leaderboard || [];
      const myRep = meRes.reputation;

      const agentsInState = home
        ? agents.filter((a) => String(a.state || '').toLowerCase() === home.toLowerCase()).length
        : agents.length;

      root.innerHTML = `
      <div class="trust-toolbar">
        <span class="updated-chip" id="trust-updated">${t('trust_refreshed')} ${new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
        <button type="button" class="trust-refresh" id="trust-refresh-btn" title="Refresh" aria-label="Refresh">↻</button>
      </div>

      <div class="trust-card">
        <div class="trust-card-head">
          <div class="trust-card-title">❓ Legal &amp; safety FAQ</div>
        </div>
        <p class="trust-card-hint">How the app works, data collected, helper safety, and bad-actor prevention — for users and partners.</p>
        <div class="trust-actions">
          <a class="btn btn-outline btn-sm" href="faq.html">Read FAQ</a>
          <a class="btn btn-outline btn-sm" href="privacy.html">Privacy</a>
          <a class="btn btn-outline btn-sm" href="terms.html">Terms</a>
        </div>
      </div>

      <div class="trust-card">
        <div class="trust-card-head">
          <div class="trust-card-title">💰 ${t('budget_free_tools')}</div>
        </div>
        <p class="trust-card-hint">${t('budget_free_tools_hint')}</p>
        <div class="trust-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick="typeof shareApp==='function'&&shareApp()">${t('budget_share_app')}</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="go('map')">🗺 ${t('map')}</button>
        </div>
      </div>

      ${
        myRep
          ? `<div class="trust-card">
        <div class="trust-card-head">
          <div class="trust-card-title">🎖 ${t('trust_your_score')}</div>
          <span class="trust-score-pill">${myRep.score ?? 0} pts</span>
        </div>
        <p class="trust-card-hint">${esc(myRep.display_name || 'You')} · ${esc(myRep.badge || t('trust_reporter'))}</p>
      </div>`
          : ''
      }

      <div class="trust-card" style="cursor:pointer" onclick="go('circle')">
        <div class="trust-card-head">
          <div>
            <div class="trust-card-title">🏘 ${t('estate_title')}</div>
            <p class="trust-card-hint" style="margin-bottom:0">${t('estate_hint')}</p>
          </div>
          <span style="font-size:20px;color:var(--text3)">›</span>
        </div>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">📊 ${t('trust_transparency')}</div>
        <p class="trust-card-hint">${t('trust_transparency_hint')}</p>
        <a class="btn btn-outline btn-sm" href="transparency.html" style="display:inline-block;text-decoration:none">↗ ${t('open_transparency')}</a>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">🏅 ${t('trust_leaderboard')}</div>
        ${
          board.length
            ? board
                .map(
                  (r) => `<div class="trust-row">
          <span>#${r.rank} ${esc(r.display_name)}</span>
          <span style="font-weight:700;color:var(--green)">${r.score} pts</span>
        </div>`
                )
                .join('')
            : `<p class="trust-empty">${t('trust_leaderboard_empty')}</p>`
        }
      </div>

      <div class="trust-card">
        <div class="trust-card-title">⭐ ${t('trust_leaders')}</div>
        <p class="trust-card-hint">${t('trust_leaders_hint')}</p>
        ${
          leaders.length
            ? leaders
                .slice(0, 8)
                .map(
                  (l) => `<div class="trust-row" style="flex-direction:column;align-items:flex-start;gap:2px">
            <strong>${esc(l.org_name || l.role_label)}</strong>
            <span style="color:var(--text3);font-size:11px">${esc(l.role_label || l.role)} · ${esc(l.state)}${l.lga ? ' · ' + esc(l.lga) : ''}</span>
          </div>`
                )
                .join('')
            : `<p class="trust-empty">${t('trust_leaders_empty')}</p>`
        }
        <div class="trust-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick="openLeaderApplyForm()">${t('apply_leader')}</button>
        </div>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">📡 ${t('trust_offline')}</div>
        <p class="trust-card-hint">${t('trust_offline_hint')}${home ? ` · ${t('trust_your_state')}: <strong>${esc(home)}</strong>` : ''}</p>
        <input type="search" class="search-inp" placeholder="${t('trust_search_states')}" oninput="filterOfflinePacks(this.value)" style="margin-bottom:10px"/>
        <div class="trust-pack-grid" id="offline-pack-grid">${renderPackButtons(trustPacks)}</div>
        <p id="offline-pack-status" class="trust-empty" style="margin-top:8px"></p>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">🤝 ${t('trust_agents')}</div>
        <p class="trust-card-hint">${t('trust_agents_hint')}</p>
        <p style="font-size:13px;font-weight:700;margin-bottom:4px">${agentsInState} ${home ? `in ${esc(home)}` : t('agents_nearby')}</p>
        <p style="font-size:11px;color:var(--text3);margin-bottom:8px">${agents.length} nationwide</p>
        <button type="button" class="btn btn-outline btn-sm" onclick="openAgentRegisterForm()">${t('become_agent')}</button>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">🏫 ${t('trust_schools')}</div>
        <p class="trust-card-hint">${t('trust_schools_hint')}</p>
        <button type="button" class="btn btn-outline btn-sm" onclick="openSchoolRegisterForm()">${t('register_school')}</button>
      </div>

      <div class="trust-card">
        <div class="trust-card-title">💚 ${t('trust_wellbeing')}</div>
        ${trustTips
          .slice(0, 3)
          .map(
            (tip, i) => `<div class="trust-tip">
          <div style="font-size:12px;font-weight:700">${esc(tip.title)}</div>
          <p style="font-size:11px;color:var(--text2);line-height:1.5;margin:6px 0">${esc(tip.body)}</p>
          <button type="button" class="btn btn-outline btn-sm" onclick="playWellbeingTip(${i})">🔊 ${t('listen')}</button>
        </div>`
          )
          .join('') || `<p class="trust-empty">${t('trust_tips_empty')}</p>`}
      </div>

      <div class="trust-card">
        <div class="trust-card-title">📻 ${t('trust_radio')}</div>
        <p class="trust-card-hint">${t('trust_radio_hint')}</p>
        <div class="trust-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick="copyRadioBulletin(false)">${t('copy_radio_script')}</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="copyRadioBulletin(true)">${t('trust_show_script')}</button>
        </div>
        <pre id="radio-script" style="font-size:10px;color:var(--text2);white-space:pre-wrap;margin-top:10px;display:none;line-height:1.5"></pre>
      </div>

      <div class="ussd-banner">
        <div class="ussd-icon">💬</div>
        <div>
          <div class="ussd-title">WhatsApp</div>
          <div class="ussd-body">${t('whatsapp_hint')}</div>
        </div>
      </div>

      <div class="trust-card">
        <div style="font-size:12px;font-weight:700;color:var(--amber)">${t('zero_rating_title')}</div>
        <p class="trust-card-hint" style="margin-bottom:0;margin-top:6px">${esc(zeroRes.message || t('zero_rating_body'))}</p>
      </div>`;

      document.getElementById('trust-refresh-btn')?.addEventListener('click', () => {
        trustLoading = false;
        loadTrustScreen();
      });

      if (typeof window.applyI18n === 'function') window.applyI18n();
    } catch (e) {
      root.innerHTML = `
        <div class="trust-card">
          <p class="trust-empty" style="color:var(--red)">${esc(e.message || 'Could not load community tools')}</p>
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="loadTrustScreen()">Try again</button>
        </div>`;
    } finally {
      trustLoading = false;
    }
  }

  window.loadTrustScreen = loadTrustScreen;
  window.filterOfflinePacks = filterOfflinePacks;

  window.playWellbeingTip = function playWellbeingTip(index) {
    const tip = trustTips[index];
    const text = tip?.voice_hint || tip?.body;
    if (text && window.SafeAlertVoice) window.SafeAlertVoice.speak(text);
    else if (text) toast(text.slice(0, 120), 'ok');
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
    const btn = [...document.querySelectorAll('.trust-pack-btn')].find((b) =>
      b.textContent.includes(state)
    );
    if (btn) btn.disabled = true;
    if (el) el.textContent = `Downloading ${state}…`;
    try {
      const pack = await api('/offline/packs/' + encodeURIComponent(state));
      localStorage.setItem(packStorageKey(state), JSON.stringify(pack));
      if (el) el.textContent = `✓ ${state}: ${pack.zone_count ?? pack.zones?.length ?? 0} alerts saved offline`;
      toast(`Offline map saved: ${state}`, 'ok');
      filterOfflinePacks(document.querySelector('#trust-content input[type=search]')?.value || '');
    } catch (e) {
      if (el) el.textContent = e.message;
      toast(e.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.applyCommunityLeader = window.openLeaderApplyForm;
  window.registerFieldAgent = window.openAgentRegisterForm;
  window.registerSchoolSafety = window.openSchoolRegisterForm;

  window.copyRadioBulletin = async function copyRadioBulletin(showOnly) {
    try {
      const lang = localStorage.getItem('safealert_lang') || 'en';
      const state = userState();
      const q = `/radio/bulletin?lang=${encodeURIComponent(lang)}${state ? '&state=' + encodeURIComponent(state) : ''}`;
      const b = await api(q);
      const pre = document.getElementById('radio-script');
      if (pre && (showOnly || !navigator.clipboard)) {
        pre.style.display = 'block';
        pre.textContent = b.script;
      }
      if (!showOnly && navigator.clipboard) {
        await navigator.clipboard.writeText(b.script);
        toast(`Radio script copied (~${b.duration_estimate_sec}s read)`, 'ok');
      } else if (showOnly && pre) {
        toast(`Script ready (~${b.duration_estimate_sec}s read)`, 'ok');
      }
    } catch (e) {
      toast(e.message || 'Copy failed', 'err');
    }
  };

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
            else toast(msg, 'err');
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
