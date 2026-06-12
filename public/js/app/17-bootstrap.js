/** SafeAlert app module — window exports + DOMContentLoaded */
/* eslint-disable */
// Expose for inline handlers in HTML
window.go = go;
window.holdStart = holdStart;
window.holdStop = holdStop;
window.state = state;
window.api = api;
window.apiGetCached = apiGetCached;
window.loadData = loadData;
window.doPanic = doPanic;
window.activatePanic = doPanic;
window.ensurePanicDisclaimerAccepted = ensurePanicDisclaimerAccepted;
window.deactivatePanic = deactivatePanic;
window.syncNearbyPanicCard = syncNearbyPanicCard;
window.respondToPanic = respondToPanic;
window.startJourney = startJourney;
window.endJourney = endJourney;
window.openJourneyEndSheet = openJourneyEndSheet;
window.pickJourneyRating = pickJourneyRating;
window.submitJourneyEnd = submitJourneyEnd;
window.endJourneySkipRating = endJourneySkipRating;
window.submitJourneyQuickFeedback = submitJourneyQuickFeedback;
window.dismissJourneyFeedbackPrompt = dismissJourneyFeedbackPrompt;
window.pickType = pickType;
window.submitReport = submitReport;
window.filt = filt;
window.togglePin = togglePin;
window.locateMe = locateMe;
window.flyTo = flyTo;
window.confirmZ = confirmZ;
window.clearZ = clearZ;
window.toast = toast;
window.refreshAll = refreshAll;
window.saveDataSaver = saveDataSaver;
window.ensureMapLoaded = ensureMapLoaded;
window.loadStatsOnly = loadStatsOnly;
window.buildInsights = buildInsights;
window.loadInsightsData = loadInsightsData;
window.loadMapZones = loadMapZones;
window.loadAllZonesData = loadAllZonesData;
window.normState = normState;
window.haversineKm = haversineKm;
window.zonesNearUser = zonesNearUser;
window.formatTypeLabel = formatTypeLabel;
window.insightsDrill = insightsDrill;
window.searchZones = searchZones;
window.filterRoutes = filterRoutes;
window.openZoneSheet = openZoneSheet;
window.closeSheets = closeSheets;
window.openProfile = openProfile;
window.onSheetBackdropClick = onSheetBackdropClick;
window.clearStuckOverlays = clearStuckOverlays;
window.markSheetOpened = markSheetOpened;
window.openCircleAdd = openCircleAdd;
window.requestOtp = requestOtp;
window.verifyOtp = verifyOtp;
window.signOut = signOut;
window.saveCircleMember = saveCircleMember;
window.joinGroup = joinGroup;
window.savePreferences = savePreferences;
window.broadcastPanicNearby = broadcastPanicNearby;
window.startCheckIn = startCheckIn;
window.confirmCheckIn = confirmCheckIn;
window.saveResponderProfile = saveResponderProfile;
window.respondToPanic = respondToPanic;
window.reportFalseZone = reportFalseZone;

function bindAuthButtons() {
  document.getElementById('btn-send-otp')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    requestOtp();
  });
  document.getElementById('btn-verify-otp')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    verifyOtp();
  });
  document.getElementById('p-otp')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyOtp();
  });

  const profileBtn = document.getElementById('btn-profile');
  if (profileBtn && !profileBtn.dataset.bound) {
    profileBtn.dataset.bound = '1';
    let lastTap = 0;
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 280) return;
      lastTap = now;
      openProfile();
    };
    profileBtn.addEventListener('click', open);
    profileBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  }
}

function updateSignInBanner() {
  const btn = document.getElementById('btn-profile');
  if (!btn) return;
  if (state.token) {
    btn.title = 'Account';
    btn.style.borderColor = '';
  } else if (state.sandboxMode) {
    btn.title = 'Sign in (sandbox — OTP shown in app)';
    btn.style.borderColor = 'var(--green)';
  } else {
    btn.title = 'Sign in';
    btn.style.borderColor = 'var(--amber)';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  clearStuckOverlays();
  bindAuthButtons();
  try {
    try {
      const health = await api('/health');
      state.sandboxMode = !!(health.sandbox_otp_in_api || health.at_sandbox);
      updateSignInBanner();
      const savedPhone = localStorage.getItem('safealert_phone');
      if (savedPhone) {
        const phoneEl = document.getElementById('p-phone');
        if (phoneEl && !phoneEl.value) phoneEl.value = savedPhone;
      }
      const hint = document.getElementById('auth-hint');
      if (hint && state.sandboxMode) {
        hint.textContent =
          'Sandbox: enter 080… → Send OTP → code fills in → Sign in. Same code works for 10 min.';
      }
      updateGuestSosBanner();
    } catch {
      /* health optional */
    }
    if (state.token) {
      await loadPreferences();
    }
    ds().applyDom();
    syncDataSaverUI();
    await loadData({ full: !ds().isEnabled() });
    loadAllZonesData().catch(() => {});
    await loadActiveCheckIn();
    buildHomeList();
    if (routesLoaded) {
      buildRoutes();
      filterRoutes();
    }
    if (groupsLoaded) {
      buildCircle();
      buildGroups();
    }
    buildTypeGrid();
    if (typeof bindReportDescStep === 'function') bindReportDescStep();
    if (typeof hydrateIcons === 'function') hydrateIcons();
    updateProfileUI();
    updateGuestSosBanner?.();
    loadGuestWomenPrefs?.();
    applyWomenSafetyMode?.();
    syncWomenCheckinNudge?.();
    updateSignInBanner();
    startGPS();
    syncHelpNearbyPing();
    rescheduleRefreshTimers();
    window.addEventListener('safealert:panic-nearby', () => syncNearbyPanicCard().catch(() => {}));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadStatsOnly().catch(() => {});
        refreshAll().catch(() => {});
      }
    });
  } catch (e) {
    console.error(e);
    setConn(false);
    try {
      await loadData({ full: false });
      toast('Using offline/saved data — server unavailable', 'err');
    } catch {
      toast('Could not load API — try offline packs in Community tools', 'err');
    }
  }
});
