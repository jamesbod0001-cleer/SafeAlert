/** SafeAlert — Women's safety mode UX (preferences, home hub, panic enhancements) */
/* eslint-disable */

function womenPrefs() {
  return window.state?.preferences || {};
}

function isWomenSafetyMode() {
  return !!womenPrefs().women_mode;
}

function applyWomenSafetyMode() {
  const on = isWomenSafetyMode();
  document.documentElement.classList.toggle('women-safety-mode', on);

  const hub = document.getElementById('women-safety-hub');
  if (hub) hub.style.display = on ? 'block' : 'none';

  const sub = document.getElementById('women-safety-subopts');
  if (sub) sub.style.display = on ? 'block' : 'none';

  const panicHint = document.getElementById('panic-hint');
  if (panicHint && on && !window.panicOn) {
    panicHint.textContent = 'Hold 3s — circle + trusted helpers alerted first';
  }

  const panicWrap = document.getElementById('panic-circle-wrap');
  if (panicWrap) panicWrap.classList.toggle('women-sos-ring', on);

  syncWomenSafetyProfileUI();
}

function syncWomenSafetyProfileUI() {
  const p = womenPrefs();
  const main = document.getElementById('pref-women-mode');
  const prefer = document.getElementById('pref-women-prefer-helpers');
  const checkin = document.getElementById('pref-women-checkin-nudge');
  const responder = document.getElementById('pref-women-responder');
  if (main) main.checked = !!p.women_mode;
  if (prefer) prefer.checked = p.women_prefer_female_helpers !== false;
  if (checkin) checkin.checked = p.women_checkin_nudge !== false;
  if (responder) responder.checked = !!p.women_responder_opt_in;
}

async function saveWomenSafetyPrefs(opts = {}) {
  const women = opts.women_mode ?? !!document.getElementById('pref-women-mode')?.checked;
  const prefer = !!document.getElementById('pref-women-prefer-helpers')?.checked;
  const checkin = !!document.getElementById('pref-women-checkin-nudge')?.checked;
  const responder = !!document.getElementById('pref-women-responder')?.checked;

  if (window.state?.preferences) {
    window.state.preferences.women_mode = women;
    window.state.preferences.women_prefer_female_helpers = prefer;
    window.state.preferences.women_checkin_nudge = checkin;
    window.state.preferences.women_responder_opt_in = responder;
  }

  applyWomenSafetyMode();

  if (!window.state?.token) {
    localStorage.setItem('sa_women_mode', women ? '1' : '0');
    localStorage.setItem('sa_women_prefer_helpers', prefer ? '1' : '0');
    localStorage.setItem('sa_women_checkin_nudge', checkin ? '1' : '0');
    localStorage.setItem('sa_women_responder', responder ? '1' : '0');
    if (women) toast('Women\'s safety mode on — sign in to sync across devices', 'ok');
    return;
  }

  try {
    await api('/user/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        women_mode: women,
        women_prefer_female_helpers: prefer,
        women_checkin_nudge: checkin,
        women_responder_opt_in: responder,
      }),
    });
    if (women && opts.firstEnable) {
      toast('Women\'s safety mode on — trusted helpers prioritized on SOS', 'ok');
    } else {
      toast(women ? 'Women\'s safety preferences saved' : 'Women\'s safety mode off', 'ok');
    }
    if (women && prefer && !state.preferences.help_nearby_enabled) {
      const nudge = document.getElementById('women-help-nearby-nudge');
      if (nudge) nudge.style.display = 'block';
    }
  } catch (e) {
    toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
  }
}

async function onWomenModeToggle() {
  const wasOff = !womenPrefs().women_mode;
  await saveWomenSafetyPrefs({ women_mode: !!document.getElementById('pref-women-mode')?.checked, firstEnable: wasOff });
}

function syncWomenCheckinNudge() {
  if (!isWomenSafetyMode() || womenPrefs().women_checkin_nudge === false) return;
  if (!state.token || typeof activeCheckIn !== 'undefined' && activeCheckIn) return;
  const el = document.getElementById('women-checkin-nudge');
  if (el) el.style.display = 'block';
}

function womenQuickCheckIn(hours) {
  if (!state.token) {
    toast('Sign in to schedule check-in', 'err');
    openProfile('signin');
    return;
  }
  if (typeof scheduleCheckInWithHours === 'function') {
    scheduleCheckInWithHours(hours);
    return;
  }
  if (typeof startCheckIn === 'function') {
    startCheckIn();
    toast(`Check-in scheduled (~${hours}h)`, 'ok');
  }
}

function womenShareLiveTip() {
  const text =
    'Using SafeAlert — sharing my live location with you while I travel. If I panic, you\'ll get an alert: ' +
    `${window.location.origin}/app/`;
  if (navigator.share) {
    navigator.share({ title: 'SafeAlert — my journey', text }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
}

function womenSafetyTips() {
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('women-tips-sheet')?.classList.add('show');
}

window.applyWomenSafetyMode = applyWomenSafetyMode;
window.syncWomenSafetyProfileUI = syncWomenSafetyProfileUI;
window.saveWomenSafetyPrefs = saveWomenSafetyPrefs;
window.onWomenModeToggle = onWomenModeToggle;
window.syncWomenCheckinNudge = syncWomenCheckinNudge;
window.womenQuickCheckIn = womenQuickCheckIn;
window.womenShareLiveTip = womenShareLiveTip;
function loadGuestWomenPrefs() {
  if (state.token) return;
  if (localStorage.getItem('sa_women_mode') === '1') state.preferences.women_mode = true;
  if (localStorage.getItem('sa_women_prefer_helpers') !== '0') {
    state.preferences.women_prefer_female_helpers = true;
  }
  if (localStorage.getItem('sa_women_checkin_nudge') !== '0') {
    state.preferences.women_checkin_nudge = true;
  }
  if (localStorage.getItem('sa_women_responder') === '1') {
    state.preferences.women_responder_opt_in = true;
  }
}
window.loadGuestWomenPrefs = loadGuestWomenPrefs;
