/** SafeAlert app module — Profile, OTP, circle, location ping */
/* eslint-disable */
function openProfile(mode = 'auto') {
  showLoader(false);
  try {
    updateProfileUI(mode);
    window.SafeAlertZeroBudget?.applyPublicConfig?.(window.SAFEALERT_PUBLIC_CONFIG || {});
  } catch (err) {
    console.warn('[SafeAlert] openProfile setup:', err);
  }
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('profile-sheet')?.classList.add('show');
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('profile-sheet'));
  window.SafeAlertMedical?.syncIceProfileUI?.();
  if (!state.token && mode !== 'settings') {
    setTimeout(() => document.getElementById('p-phone')?.focus(), 350);
  }
}

function openCircleAdd() {
  if (!state.token) {
    toast('Sign in to add someone you trust', 'err');
    openProfile();
    return;
  }
  openProfile();
}

async function loadPreferences() {
  if (!state.token) return;
  try {
    const { preferences: p } = await api('/user/preferences');
    state.preferences = { ...state.preferences, ...p };
    if (p.language) {
      localStorage.setItem('safealert_lang', p.language);
      if (typeof applyI18n === 'function') applyI18n();
    }
    if (p.data_saver !== undefined) ds().setEnabled(!!p.data_saver);
    syncPreferencesUI();
    syncHelpNearbyPing();
  } catch (_) {
    /* ignore */
  }
}

const RESPONDER_SKILLS = [
  { id: 'first_aid', label: 'First aid' },
  { id: 'escort', label: 'Escort' },
  { id: 'mechanic', label: 'Mechanic' },
  { id: 'driver', label: 'Driver' },
  { id: 'security', label: 'Security' },
  { id: 'translator', label: 'Translator' },
];

function syncDataSaverUI() {
  const cb = document.getElementById('pref-data-saver');
  const on = ds().isEnabled();
  if (cb) cb.checked = on;
  document.documentElement.classList.toggle('data-saver', on);
  const banner = document.getElementById('data-saver-banner');
  if (banner) banner.style.display = on ? 'block' : 'none';
  if (on && !ds().shouldLoadGoogleFonts?.()) {
    document.getElementById('font-plus-jakarta')?.setAttribute('media', 'print');
  } else {
    document.getElementById('font-plus-jakarta')?.setAttribute('media', 'all');
  }
}

async function saveDataSaver() {
  const on = !!document.getElementById('pref-data-saver')?.checked;
  ds().setEnabled(on);
  syncDataSaverUI();
  rescheduleRefreshTimers();
  syncHelpNearbyPing();
  if (state.token) {
    try {
      await api('/user/preferences', {
        method: 'PUT',
        body: JSON.stringify({ data_saver: on }),
      });
    } catch (_) {
      /* ignore */
    }
  }
  toast(on ? 'Data Saver on — less background usage' : 'Data Saver off — live updates', 'ok');
}

function syncPreferencesUI() {
  if (state.preferences.data_saver !== undefined) {
    ds().setEnabled(!!state.preferences.data_saver);
  }
  syncDataSaverUI();
  const voiceCb = document.getElementById('pref-voice-mode');
  if (voiceCb && window.SafeAlertVoice) voiceCb.checked = window.SafeAlertVoice.isEnabled();
  const iconCb = document.getElementById('pref-icon-only');
  if (iconCb && window.SafeAlertIconMode) iconCb.checked = window.SafeAlertIconMode.isEnabled();
  const lang = document.getElementById('pref-language');
  if (lang) lang.value = state.preferences.language || localStorage.getItem('safealert_lang') || 'en';
  const night = document.getElementById('pref-night-mode');
  if (night) night.checked = !!state.preferences.night_mode;
  const women = document.getElementById('pref-women-mode');
  if (women) women.checked = !!state.preferences.women_mode;
  document.documentElement.classList.toggle('night-mode', !!state.preferences.night_mode);
  syncWomenSafetyProfileUI?.();
  applyWomenSafetyMode?.();
  const cb = document.getElementById('pref-help-nearby');
  const range = document.getElementById('pref-help-radius');
  const lbl = document.getElementById('pref-radius-lbl');
  if (!cb || !range) return;
  cb.checked = !!state.preferences.help_nearby_enabled;
  const ew = document.getElementById('pref-estate-watch');
  if (ew) ew.checked = state.preferences.estate_watch_enabled !== false;
  range.value = state.preferences.help_nearby_radius_km || 5;
  if (lbl) lbl.textContent = range.value;

  const rav = document.getElementById('pref-responder-available');
  if (rav) rav.checked = !!state.preferences.responder_available;
  const skillsEl = document.getElementById('responder-skills');
  if (skillsEl) {
    const selected = new Set(state.preferences.responder_skills || []);
    skillsEl.innerHTML = RESPONDER_SKILLS.map(
      (s) =>
        `<label style="font-size:11px;padding:6px 10px;border-radius:20px;border:1px solid var(--border);cursor:pointer;background:${selected.has(s.id) ? 'var(--green-soft)' : 'transparent'}">
          <input type="checkbox" data-skill="${s.id}" ${selected.has(s.id) ? 'checked' : ''} style="margin-right:4px"/>${s.label}
        </label>`
    ).join('');
  }
  syncNearbyPanicCard();
  applyWomenSafetyMode?.();
  syncWomenCheckinNudge?.();
}

async function savePreferences() {
  if (!state.token) return toast('Sign in first', 'err');
  const help_nearby_enabled = !!document.getElementById('pref-help-nearby')?.checked;
  const estate_watch_enabled = !!document.getElementById('pref-estate-watch')?.checked;
  const help_nearby_radius_km = parseInt(document.getElementById('pref-help-radius')?.value || '5', 10);
  const lbl = document.getElementById('pref-radius-lbl');
  if (lbl) lbl.textContent = String(help_nearby_radius_km);
  try {
    const d = await api('/user/preferences', {
      method: 'PUT',
      body: JSON.stringify({ help_nearby_enabled, help_nearby_radius_km, estate_watch_enabled }),
    });
    state.preferences = d.preferences || state.preferences;
    if (help_nearby_enabled) {
      toast('Help nearby on — allow notifications for push alerts', 'ok');
      if (window.SafeAlertFCM && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
    syncHelpNearbyPing();
    if (!help_nearby_enabled) toast('Help nearby alerts off', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function syncHelpNearbyPing() {
  clearInterval(locationPingIv);
  if (!state.token || !state.preferences.help_nearby_enabled) return;
  const intervalMs = ds().helpNearbyPingMs();
  pingLocation();
  locationPingIv = setInterval(pingLocation, intervalMs);
}

function updateProfileUI(mode = 'auto') {
  const out = document.getElementById('profile-signed-out');
  const inn = document.getElementById('profile-signed-in');
  const card = document.getElementById('profile-card');
  const guestFooter = document.getElementById('profile-legal-footer-guest');
  const settingsWrap = document.getElementById('profile-settings-wrap');
  const title = document.querySelector('#profile-sheet .sheet-title');
  const sub = document.querySelector('#profile-sheet .sheet-sub');
  const signinOnly = mode === 'signin';
  const settingsOnly = mode === 'settings';

  if (state.token) {
    out.style.display = 'none';
    inn.style.display = 'block';
    if (guestFooter) guestFooter.style.display = 'none';
    card.innerHTML = `<div style="font-size:14px;font-weight:700">Signed in</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px">Device ${escapeHtml(state.deviceId.slice(0, 16))}…</div>`;
    if (settingsWrap) settingsWrap.style.display = signinOnly ? 'none' : 'block';
    if (title) title.textContent = signinOnly ? 'Account' : 'Settings';
    if (sub && !signinOnly) {
      sub.textContent = 'Your people, alerts, data saver, and helper settings.';
    }
    syncPreferencesUI();
  } else {
    out.style.display = 'block';
    inn.style.display = 'none';
    if (guestFooter) guestFooter.style.display = 'block';
    if (settingsWrap) settingsWrap.style.display = 'none';
    if (title) title.textContent = signinOnly ? 'Sign in' : 'Your account';
    if (sub) {
      sub.textContent = signinOnly
        ? 'Optional — SOS works without sign-in. Sign in to save your people list and reach nearby helpers.'
        : 'Browse the map and report danger without sign-in. Sign in with phone + OTP to save your people and share trips.';
    }
  }
  window.SafeAlertZeroBudget?.renderGuestBanner?.(window.SAFEALERT_PUBLIC_CONFIG || {});
  syncCircleSetupNudge();
  updateGuestSosBanner?.();
}

function syncCircleSetupNudge() {
  const el = document.getElementById('circle-setup-nudge');
  if (!el) return;
  const contacts = window.SafeAlertCitizenSOS?.getCircleContacts?.() || [];
  const show = contacts.length < 2;
  el.style.display = show ? 'block' : 'none';
}

let otpBusy = false;

async function requestOtp() {
  if (otpBusy) return;
  const phone = document.getElementById('p-phone')?.value?.trim();
  const btn = document.getElementById('btn-send-otp');
  const hint = document.getElementById('auth-hint');
  if (!phone) return toast('Enter your phone number', 'err');

  otpBusy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }
  if (hint) hint.textContent = 'Requesting OTP…';

  localStorage.setItem('safealert_phone', phone);

  try {
    const d = await api('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
    setOtpToken(d.otp_token);
    if (d.sandbox_otp) {
      const el = document.getElementById('p-otp');
      if (el) el.value = d.sandbox_otp;
      if (hint) {
        const sandboxNote = d.at_sandbox
          ? `<br/><span style="font-size:10px;color:var(--text3)">Africa's Talking sandbox — whitelist 080… in AT dashboard for real SMS. Code is always shown here.</span>`
          : '';
        hint.innerHTML = `Your code: <strong style="color:var(--green)">${escapeHtml(d.sandbox_otp)}</strong> — tap <strong>Sign in</strong>${sandboxNote}`;
      }
      toast(`Sandbox code ${d.sandbox_otp} — tap Sign in`, 'ok');
    } else if (state.sandboxMode) {
      if (hint) {
        hint.textContent =
          'Sandbox: no code returned. Hard-refresh the page, then Send OTP again. Try 123456 if your server uses a fixed test OTP.';
      }
      toast('No code returned — hard refresh (Cmd+Shift+R) and try again', 'err');
    } else {
      const devHint = isLocalDev() ? ' (dev: try 123456 if configured)' : '';
      toast((d.message || 'OTP sent') + devHint, 'ok');
      if (hint) hint.textContent = 'Check SMS, then tap Sign in.';
    }
    if (d.sms_warning) toast(d.sms_warning, 'err');
  } catch (e) {
    setOtpToken(null);
    if (hint) hint.textContent = e.message || 'Could not send OTP. Try again.';
    toast(e.message || 'Could not send OTP', 'err');
  } finally {
    otpBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send OTP';
    }
  }
}

async function verifyOtp() {
  if (otpBusy) return;
  const phone = document.getElementById('p-phone')?.value?.trim();
  const otp = document.getElementById('p-otp')?.value?.trim().replace(/\D/g, '');
  const btn = document.getElementById('btn-verify-otp');
  if (!phone || !otp) return toast('Phone and OTP required', 'err');
  if (otp.length !== 6) return toast('Enter the 6-digit OTP from SMS', 'err');

  otpBusy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in…';
  }

  try {
    const d = await api('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, ...(state.otpToken ? { otp_token: state.otpToken } : {}) }),
    });
    state.token = d.token;
    localStorage.setItem('safealert_token', d.token);
    localStorage.setItem('safealert_phone', phone);
    setOtpToken(null);
    updateProfileUI();
    updateGuestSosBanner?.();
    await loadPreferences();
    await loadData();
    buildCircle();
    closeSheets();
    updateSignInBanner();
    window.dispatchEvent(new CustomEvent('safealert:signed-in'));
    toast('Welcome — you are signed in', 'ok');
  } catch (e) {
    const msg = e.message || 'Sign in failed';
    if (/otp not found|incorrect otp|expired/i.test(msg)) {
      if (/otp not found|expired/i.test(msg)) setOtpToken(null);
      toast(`${msg} — tap Send OTP again`, 'err');
    } else {
      toast(msg, 'err');
    }
  } finally {
    otpBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }
}

function signOut() {
  state.token = null;
  localStorage.removeItem('safealert_token');
  setOtpToken(null);
  circle = [{ name: 'Sign in', rel: 'Tap profile', status: 'unknown', icon: '👤', last: 'Add trusted contacts' }];
  updateProfileUI();
  updateGuestSosBanner?.();
  buildCircle();
  document.getElementById('s-circle').textContent = '0';
  closeSheets();
  updateSignInBanner();
  toast('Signed out');
}

async function deleteMyAccount() {
  if (!state.token) return toast('Sign in first', 'err');
  const ok = window.confirm(
    'Delete your SafeAlert account permanently?\n\nThis removes your profile, people list, and settings. This cannot be undone.'
  );
  if (!ok) return;
  try {
    await api('/user/account', { method: 'DELETE' });
    signOut();
    toast('Account deleted', 'ok');
  } catch (e) {
    toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
  }
}
window.deleteMyAccount = deleteMyAccount;

function circlePhoneStore() {
  try {
    return JSON.parse(localStorage.getItem('safealert_circle_phones') || '{}');
  } catch {
    return {};
  }
}

async function saveCircleMember() {
  if (!(await ensureAuth())) return toast('Sign in first', 'err');
  const name = document.getElementById('c-name')?.value?.trim();
  const phone = document.getElementById('c-phone')?.value?.trim();
  const relation = document.getElementById('c-rel')?.value?.trim();
  if (!name || !phone || !relation) return toast('Name, phone, and relation required', 'err');
  const store = circlePhoneStore();
  store[name] = phone;
  localStorage.setItem('safealert_circle_phones', JSON.stringify(store));
  const payload = circle
    .filter((m) => m.name !== 'Sign in')
    .map((m) => ({
      name: m.name,
      phone: store[m.name] || m.phone,
      relation: m.relation || m.rel,
    }))
    .filter((m) => m.phone);
  if (!payload.some((m) => m.name === name)) payload.push({ name, phone, relation });
  try {
    await api('/user/circle', {
      method: 'PUT',
      body: JSON.stringify({ circle: payload.slice(0, 5) }),
    });
    const { circle: c } = await api('/user/circle');
    circle = (c || []).map((m) => ({
      name: m.name,
      rel: m.relation,
      relation: m.relation,
      status: 'safe',
      icon: '🏠',
        last: 'Trusted contact',
    }));
    document.getElementById('c-name').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-rel').value = '';
    buildCircle();
    document.getElementById('s-circle').textContent = circle.length;
    window.SafeAlertCitizenSOS?.cacheCircle?.(circle);
    toast('Contact saved', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function pingLocation() {
  const helpNearby = !!state.preferences?.help_nearby_enabled;
  if (!state.token || (!panicOn && !journeyOn && !helpNearby)) return;
  const { lat, lng } = effectiveCoords();
  try {
    await api('/user/location', {
      method: 'PUT',
      body: JSON.stringify({
        lat,
        lng,
        accuracy: 25,
        journey_active: journeyOn,
        panic_active: panicOn,
      }),
    });
  } catch (e) {
    if (e.status === 403 && helpNearby) {
      toast('Turn on Help nearby in profile, or start journey/panic to share location', 'err');
    } else if (e.status === 429) {
      /* throttled — expected */
    } else if (e.status !== 400) {
      console.warn('[location]', e.message);
    }
  }
}

function startLocationPing() {
  clearInterval(locationPingIv);
  pingLocation();
  const ms = panicOn ? 60000 : ds().journeyLocationPingMs();
  locationPingIv = setInterval(pingLocation, ms);
}

function stopLocationPing() {
  if (panicOn || journeyOn) return;
  if (state.preferences?.help_nearby_enabled) {
    syncHelpNearbyPing();
    return;
  }
  clearInterval(locationPingIv);
  locationPingIv = null;
  if (state.token) {
    api('/user/location', { method: 'DELETE' }).catch(() => {});
  }
}
