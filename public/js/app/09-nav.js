/** SafeAlert app module — Screen navigation */
/* eslint-disable */
// ── NAVIGATION ────────────────────────────────────────────────────────────────
async function go(id) {
  currentScreen = id;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  const screenEl = document.getElementById('screen-' + id);
  screenEl?.classList.add('active');
  if (screenEl && screenEl.classList.contains('screen')) screenEl.scrollTop = 0;
  const navBtn = document.getElementById('nb-' + id);
  navBtn?.classList.add('active');
  navBtn?.setAttribute('aria-selected', 'true');
  if (navigator.vibrate) {
    try {
      navigator.vibrate(8);
    } catch (_) {
      /* ignore */
    }
  }
  if (id === 'insights' || id === 'routes' || id === 'trust') {
    document.querySelectorAll('.nav-item').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.getElementById('nb-more')?.classList.add('active');
    document.getElementById('nb-more')?.setAttribute('aria-selected', 'true');
  }
  if (id === 'map') {
    await ensureMapLoaded();
    await loadMapZones().catch(() => {});
    if (map) setTimeout(() => map.invalidateSize(), 80);
  }
  if (id === 'insights') {
    if (typeof applyI18n === 'function') applyI18n();
    if (!insightsLoaded) {
      loadInsightsData().catch(() => {
        const loading = document.getElementById('insights-loading');
        if (loading) {
          loading.textContent = 'Could not load dashboard — pull to refresh or tap 🔄';
          loading.style.color = 'var(--red)';
        }
      });
    } else {
      buildInsights();
    }
  }
  if (id === 'routes' && !routesLoaded) {
    loadRoutesData()
      .then(() => {
        buildRoutes();
        filterRoutes();
      })
      .catch(() => {});
  }
  if (id === 'trust') {
    if (typeof applyI18n === 'function') applyI18n();
    if (typeof loadTrustScreen === 'function') loadTrustScreen();
  }
  if (id === 'circle') {
    const jobs = [];
    if (!groupsLoaded) jobs.push(loadGroupsData().then(buildGroups));
    if (!circle.length || state.token) jobs.push(loadCircleData().then(buildCircle));
    jobs.push(loadResources());
    if (typeof window.SafeAlertEstate?.loadEstatePanel === 'function') {
      jobs.push(window.SafeAlertEstate.loadEstatePanel());
    }
    Promise.all(jobs).catch(() => {});
  }
  if (id === 'report' && !settingsLoaded) loadSettingsIfNeeded().then(buildTypeGrid).catch(() => {});
}
