/**
 * SafeAlert NG — UX enhancements pack
 */
(function () {
  const ONBOARDING_KEY = 'safealert_onboarding_done';

  window.SafeAlertUX = {
    lastStats: null,
    activePanicId: null,
    activePanicShortId: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function openSheet(id) {
    if (typeof window.markSheetOpened === 'function') window.markSheetOpened();
    else window.sheetOpenedAt = Date.now();
    $('sheet-bg')?.classList.add('show');
    $(id)?.classList.add('show');
  }

  window.closeAllSheets = function closeAllSheets() {
    if (typeof closeSheets === 'function') {
      closeSheets();
      return;
    }
    document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
    $('sheet-bg')?.classList.remove('show');
  };

  window.openActiveStats = function openActiveStats() {
    const s = window.SafeAlertUX.lastStats || {};
    const body = $('active-stats-body');
    if (!body) return;
    body.innerHTML = `
      <div style="display:grid;gap:10px;font-size:13px">
        <div class="card card-sm"><strong style="color:var(--red)">${s.active_panics ?? 0}</strong> active panic alerts right now</div>
        <div class="card card-sm"><strong style="color:var(--amber)">${s.critical_zones ?? 0}</strong> critical danger zones</div>
        <div class="card card-sm"><strong>${s.total_active_zones ?? 0}</strong> active zones on the map</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">Header count = panics + critical zones (urgent items only). Total community reports: ${s.total_reports ?? 0}</div>
      </div>`;
    openSheet('active-stats-sheet');
  };

  window.openAlertLegend = function openAlertLegend() {
    openSheet('legend-sheet');
  };

  window.openMapsForPanic = function openMapsForPanic(lat, lng, label) {
    const q = encodeURIComponent(label || 'Emergency');
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank', 'noopener');
  };

  window.shareAlert = function shareAlert(opts = {}) {
    const id = opts.id;
    const url = id ? `${window.location.origin}/app/?zone=${id}` : `${window.location.origin}/app/`;
    const typeLbl = (opts.type || 'safety alert').replace(/_/g, ' ');
    const place = opts.label || opts.place || 'Nigeria';
    const state = opts.state ? `, ${opts.state}` : '';
    const text =
      opts.kind === 'app'
        ? `SafeAlert NG — free on iPhone & Android. Community safety before you travel: ${window.location.origin}/app/download.html`
        : `⚠️ ${typeLbl} near ${place}${state}. Check SafeAlert NG map: ${url}`;
    if (navigator.share) {
      navigator
        .share({ title: 'SafeAlert NG', text, url })
        .catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  window.shareAlertById = function shareAlertById(id) {
    const z = (window.zones || window.allZones || []).find((x) => x.id === id);
    if (!z) return;
    window.shareAlert({ id, label: z.place || z.label, state: z.state, type: z.type });
  };

  window.shareApp = function shareApp() {
    window.shareAlert({ kind: 'app' });
  };

  window.shareZoneWhatsApp = function shareZoneWhatsApp(id) {
    if (typeof window.shareAlertById === 'function') {
      window.shareAlertById(id);
      return;
    }
    const z = (window.zones || []).find((x) => x.id === id);
    if (!z) return;
    const text = encodeURIComponent(
      `⚠️ ${z.type} reported near ${z.label} (${z.state}) on SafeAlert NG — ${window.location.origin}/app/?zone=${id}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  window.shareCircleInvite = function shareCircleInvite() {
    const link = `${window.location.origin}/app/?invite=1`;
    const text = `Join my SafeAlert NG safety circle — I will see your live location when you panic or travel: ${link}`;
    if (navigator.share) {
      navigator
        .share({ title: 'SafeAlert NG — Safety Circle', text, url: link })
        .catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  window.quickReport = function quickReport(typeId) {
    if (typeof pickType === 'function') pickType(typeId);
    if (typeof go === 'function') go('report');
    const el = document.getElementById('rdesc');
    if (el && !el.value) el.value = `Quick report: ${typeId.replace(/_/g, ' ')}`;
    if (typeof toast === 'function') toast('Type selected — add details and submit', 'ok');
  };

  window.dismissPanicHelper = async function dismissPanicHelper(panicId) {
    if (!window.state?.token) return toast('Sign in first', 'err');
    try {
      await window.api(`/panic/${panicId}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'cannot_help' }),
      });
      toast('Marked — you can skip this alert', 'ok');
      if (typeof syncNearbyPanicCard === 'function') syncNearbyPanicCard();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.testPushNotification = async function testPushNotification() {
    if (!window.state?.token) return toast('Sign in first', 'err');
    try {
      const d = await window.api('/user/test-notification', { method: 'POST', body: '{}' });
      toast(d.mock ? 'Test logged (push mocked on server)' : 'Test notification sent', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.saveLanguagePref = async function saveLanguagePref() {
    const lang = document.getElementById('pref-language')?.value || 'en';
    localStorage.setItem('safealert_lang', lang);
    if (typeof applyI18n === 'function') applyI18n();
    if (window.state?.token) {
      try {
        await window.api('/user/preferences', { method: 'PUT', body: JSON.stringify({ language: lang }) });
      } catch (_) {
        /* ignore */
      }
    }
    toast('Language updated', 'ok');
  };

  window.saveModePrefs = async function saveModePrefs() {
    if (!window.state?.token) return;
    const night = !!document.getElementById('pref-night-mode')?.checked;
    try {
      await window.api('/user/preferences', {
        method: 'PUT',
        body: JSON.stringify({ night_mode: night }),
      });
      if (window.state?.preferences) {
        window.state.preferences.night_mode = night;
      }
      document.documentElement.classList.toggle('night-mode', night);
      toast('Preferences saved', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  async function refreshPovResponders() {
    const el = $('pov-responders');
    if (!el || !window.state?.token || !window.SafeAlertUX.activePanicId) return;
    try {
      const d = await window.api(`/panic/${window.SafeAlertUX.activePanicId}/responders`);
      if (!d.responders?.length) {
        el.innerHTML =
          '<p style="font-size:11px;color:rgba(255,255,255,0.6);text-align:center">Waiting for helpers to respond…</p>';
        return;
      }
      el.innerHTML = d.responders
        .map(
          (r) => `<div class="pov-member">
        <div class="pov-member-dot" style="background:var(--green)"></div>
        <span style="font-size:12px;color:rgba(255,255,255,0.9);flex:1">${escapeHtml(r.display_name)}${r.women_helper ? ' 💜' : ''}${r.is_you ? ' (you)' : ''} — en route</span>
      </div>`
        )
        .join('');
    } catch (_) {
      el.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,0.5)">Loading helpers…</p>';
    }
  }

  window.refreshPovResponders = refreshPovResponders;

  function showPostPanicFeedback() {
    const el = $('post-panic-feedback');
    if (!el) return;
    el.classList.add('show');
  }

  window.submitPanicFeedback = function submitPanicFeedback(helpful) {
    localStorage.setItem('safealert_last_panic_feedback', helpful ? 'yes' : 'no');
    $('post-panic-feedback')?.classList.remove('show');
    toast('Thanks — your feedback improves SafeAlert', 'ok');
  };

  const origDeactivate = window.deactivatePanic;
  if (typeof origDeactivate === 'function') {
    window.deactivatePanic = async function wrappedDeactivatePanic() {
      await origDeactivate();
      showPostPanicFeedback();
      window.SafeAlertUX.activePanicId = null;
    };
  }

  function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const panicId = params.get('panic');
    const zoneId = params.get('zone');
    const action = params.get('action') || params.get('open');

    if (panicId && window.state?.token) {
      if (typeof go === 'function') go('home');
      setTimeout(() => {
        if (typeof syncNearbyPanicCard === 'function') syncNearbyPanicCard();
        toast(`Opened alert — check Help nearby`, 'ok');
      }, 500);
    }
    if (zoneId) {
      if (typeof go === 'function') go('map');
      setTimeout(() => {
        if (typeof flyTo === 'function') flyTo(zoneId);
        else if (typeof openZoneSheet === 'function') openZoneSheet(zoneId);
      }, 800);
    }
    if (action === 'profile' && typeof openProfile === 'function') openProfile();
    if (action === 'report' && typeof go === 'function') go('report');
    if (action === 'legend') openAlertLegend();
  }

  function setupOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return;
    const ob = $('onboarding');
    if (!ob) return;
    ob.classList.add('show');
    let step = 0;
    const steps = ob.querySelectorAll('.ob-step');
    const show = (n) => {
      steps.forEach((s, i) => {
        s.style.display = i === n ? 'block' : 'none';
      });
    };
    show(0);
    $('ob-next')?.addEventListener('click', async () => {
      if (step === 1) {
        try {
          if (Notification.permission === 'default') await Notification.requestPermission();
        } catch (_) {
          /* ignore */
        }
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (p) => {
              if (typeof uLat !== 'undefined') {
                uLat = p.coords.latitude;
                uLng = p.coords.longitude;
              }
            },
            () => {}
          );
        }
      }
      if (step === 2) {
        if (typeof window.getOnboardingWantsPack === 'function' && window.getOnboardingWantsPack()) {
          const state =
            typeof window.getOnboardingSelectedState === 'function'
              ? window.getOnboardingSelectedState()
              : '';
          if (state && typeof window.offerOfflinePack === 'function') {
            await window.offerOfflinePack(state);
          }
        }
        if (typeof window.setOnboardingWantsPack === 'function') window.setOnboardingWantsPack(false);
      }
      step += 1;
      if (step >= steps.length) {
        localStorage.setItem(ONBOARDING_KEY, '1');
        ob.classList.remove('show');
        return;
      }
      if (step === 2 && typeof window.initOnboardingStateStep === 'function') {
        window.initOnboardingStateStep();
      }
      show(step);
    });
    $('ob-skip')?.addEventListener('click', () => {
      localStorage.setItem(ONBOARDING_KEY, '1');
      ob.classList.remove('show');
    });
  }

  function setupOfflineBar() {
    const bar = $('offline-bar');
    if (!bar) return;
    const update = () => {
      bar.style.display = navigator.onLine ? 'none' : 'flex';
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  function setupPullRefresh() {
    let startY = 0;
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.addEventListener(
        'touchstart',
        (e) => {
          if (screen.scrollTop <= 0) startY = e.touches[0].clientY;
        },
        { passive: true }
      );
      screen.addEventListener(
        'touchend',
        (e) => {
          if (screen.scrollTop > 0) return;
          if (e.changedTouches[0].clientY - startY > 90) {
            if (window.SafeAlertDataSaver?.isEnabled() && typeof loadStatsOnly === 'function') {
              loadStatsOnly().then(() => toast('Stats updated', 'ok')).catch(() => {});
            } else if (typeof refreshAll === 'function') {
              refreshAll();
              toast('Refreshing…', 'ok');
            }
          }
        },
        { passive: true }
      );
    });
  }

  function patchLoadData() {
    const orig = window.loadData;
    if (!orig) return;
    window.loadData = async function patchedLoadData() {
      await orig();
      const s = {
        active_panics: parseInt($('live-n')?.textContent || '0', 10),
        critical_zones: parseInt($('s-hot')?.textContent || '0', 10),
      };
      try {
        const statsRes = await window.api('/stats');
        window.SafeAlertUX.lastStats = statsRes.stats || {};
      } catch {
        window.SafeAlertUX.lastStats = s;
      }
      const ussd = $('ussd-code');
      if (ussd) {
        try {
          const cfg = await window.api('/config/public');
          if (cfg.ussd_service_code) ussd.textContent = cfg.ussd_service_code;
        } catch {
          ussd.textContent = '*384*911#';
        }
      }
    };
  }

  function patchDoPanic() {
    const orig = window.doPanic;
    if (!orig) return;
    window.doPanic = async function patchedDoPanic() {
      await orig();
      if (panicOn) {
        try {
          const mine = await window.api('/panic/mine/active');
          window.SafeAlertUX.activePanicId = mine.active?.id || null;
          window.SafeAlertUX.activePanicShortId = mine.short_id || null;
          refreshPovResponders();
          if (!window._povResponderIv) {
            window._povResponderIv = setInterval(() => {
              if (panicOn) refreshPovResponders();
              else clearInterval(window._povResponderIv);
            }, 12000);
          }
        } catch (_) {
          /* ignore */
        }
      }
    };
  }

  function enhanceZoneSheet() {
    const orig = window.openZoneSheet;
    if (!orig) return;
    window.openZoneSheet = function enhancedZoneSheet(id) {
      orig(id);
      const z = (window.zones || []).find((x) => x.id === id);
      if (!z) return;
      const body = $('zone-sheet-body');
      if (!body) return;
      body.innerHTML += `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          <button class="btn btn-outline btn-sm" onclick="shareAlertById('${id}')">📤 Share</button>
          <button class="btn btn-outline btn-sm" onclick="go('map');closeAllSheets();setTimeout(()=>flyTo('${id}'),200)">🗺 Map</button>
        </div>`;
    };
  }

  function enhanceButtons() {
    document.querySelectorAll('.btn').forEach((btn) => {
      if (btn.querySelector('.btn-ico') || btn.querySelector('.btn-txt') || btn.hasAttribute('data-icon')) return;
      const raw = (btn.textContent || '').trim();
      if (!raw) return;
      const m = raw.match(/^(\p{Extended_Pictographic}+)\s+(.+)$/u);
      if (!m || !m[2]) return;
      btn.textContent = '';
      const ico = document.createElement('span');
      ico.className = 'btn-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.textContent = m[1];
      const txt = document.createElement('span');
      txt.className = 'btn-txt';
      txt.textContent = m[2];
      btn.appendChild(ico);
      btn.appendChild(txt);
    });
  }

  function init() {
    setupOnboarding();
    setupOfflineBar();
    setupPullRefresh();
    patchLoadData();
    patchDoPanic();
    enhanceZoneSheet();
    handleDeepLink();
    enhanceButtons();

    $('live-pill')?.addEventListener('click', openActiveStats);

    document.getElementById('pref-language')?.addEventListener('change', saveLanguagePref);

    if (typeof applyI18n === 'function') applyI18n();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
