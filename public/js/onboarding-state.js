/**
 * State-aware onboarding — detect state, offer offline pack download.
 */
(function () {
  let stateListCache = null;
  let wantsPackDownload = false;

  function t(key, fallback) {
    return typeof window.t === 'function' ? window.t(key) : fallback || key;
  }

  function guessStateFromBounds(lat, lng, states) {
    if (!states?.length || lat == null || lng == null) return null;
    const match = states.find(
      (s) => lat >= s.minLat && lat <= s.maxLat && lng >= s.minLng && lng <= s.maxLng
    );
    return match ? match.name : null;
  }

  async function loadStateList() {
    if (stateListCache?.length) return stateListCache;
    try {
      const cfg = await window.api('/config/public');
      window.publicConfig = cfg;
      if (cfg.nigeria_states?.length) {
        stateListCache = cfg.nigeria_states;
        return stateListCache;
      }
    } catch {
      /* try offline packs */
    }
    try {
      const res = await window.api('/offline/packs');
      stateListCache = (res.packs || []).map((p) => ({
        name: p.state,
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0,
      }));
      return stateListCache;
    } catch {
      return [];
    }
  }

  function detectUserState() {
    const lat = typeof window.uLat !== 'undefined' ? window.uLat : null;
    const lng = typeof window.uLng !== 'undefined' ? window.uLng : null;
    if (lat == null || lng == null) return null;
    const states =
      stateListCache ||
      window.publicConfig?.nigeria_states ||
      window.SAFEALERT_PUBLIC_CONFIG?.nigeria_states ||
      [];
    return guessStateFromBounds(lat, lng, states);
  }

  async function offerOfflinePack(state) {
    if (!state) return;
    if (typeof window.downloadOfflinePack === 'function') {
      await window.downloadOfflinePack(state);
      return;
    }
    try {
      const pack = await window.api('/offline/packs/' + encodeURIComponent(state));
      const key = 'safealert_offline_' + state.toLowerCase().replace(/\s+/g, '_');
      localStorage.setItem(key, JSON.stringify(pack));
      if (window.toast) window.toast(`Offline map saved: ${state}`, 'ok');
    } catch (e) {
      if (window.toast) window.toast(e.message || 'Download failed', 'err');
    }
  }

  function getSelectedState() {
    const picker = document.getElementById('onboarding-state-picker');
    return picker?.value || window._onboardingDetectedState || '';
  }

  function updateDownloadButton(state) {
    const btn = document.getElementById('ob-download-pack');
    if (!btn) return;
    const label = state
      ? t('onboarding_download_pack', 'Download {state} offline pack').replace('{state}', state)
      : t('onboarding_download_pack', 'Download offline pack');
    btn.textContent = label;
    btn.disabled = !state;
  }

  function populatePicker(states, selected) {
    const picker = document.getElementById('onboarding-state-picker');
    if (!picker) return;
    picker.innerHTML = '';
    states.forEach((s) => {
      const name = s.name || s.state || s;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === selected) opt.selected = true;
      picker.appendChild(opt);
    });
    if (selected) picker.value = selected;
    picker.onchange = () => {
      updateDownloadButton(picker.value);
      window._onboardingDetectedState = picker.value;
    };
  }

  function showDetectedState(state) {
    const el = document.getElementById('onboarding-state-detected');
    if (!el) return;
    if (state) {
      el.style.display = 'block';
      el.textContent = `We detected you're in ${state}. Pick another state below if that's wrong.`;
    } else {
      el.style.display = 'block';
      el.textContent = 'Select your state to download a safety map for offline use.';
    }
  }

  async function initOnboardingStateStep() {
    wantsPackDownload = false;
    const states = await loadStateList();
    let detected = detectUserState();
    if (!detected && states.length) {
      await new Promise((r) => setTimeout(r, 1500));
      detected = detectUserState();
    }
    window._onboardingDetectedState = detected || states[0]?.name || '';
    populatePicker(states, window._onboardingDetectedState);
    showDetectedState(detected);
    updateDownloadButton(window._onboardingDetectedState);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ob-download-pack')?.addEventListener('click', () => {
      wantsPackDownload = true;
      document.getElementById('ob-download-pack')?.classList.add('btn-green');
      document.getElementById('ob-download-pack')?.classList.remove('btn-outline');
    });
    document.getElementById('ob-skip-state')?.addEventListener('click', (e) => {
      e.preventDefault();
      wantsPackDownload = false;
      const next = document.getElementById('ob-next');
      if (next) next.click();
    });
  });

  window.guessStateFromBounds = guessStateFromBounds;
  window.loadStateList = loadStateList;
  window.detectUserState = detectUserState;
  window.offerOfflinePack = offerOfflinePack;
  window.initOnboardingStateStep = initOnboardingStateStep;
  window.getOnboardingWantsPack = () => wantsPackDownload;
  window.setOnboardingWantsPack = (v) => {
    wantsPackDownload = !!v;
  };
  window.getOnboardingSelectedState = getSelectedState;
})();
