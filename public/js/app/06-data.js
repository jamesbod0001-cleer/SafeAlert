/** SafeAlert app module — Zone/route/group loaders + refresh */
/* eslint-disable */
async function loadSettingsIfNeeded() {
  if (settingsLoaded && types.length) return;
  const settingsRes = await apiGetCached('/settings', 'settings');
  types = (settingsRes.settings?.incident_types || []).map((id) => ({
    id,
    label: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: TYPE_ICONS[id] || '⚠️',
  }));
  settingsLoaded = true;
}

async function loadZonesData() {
  const zonesRes = await apiGetCached(`/zones${ds().zonesQuery()}`, 'zones');
  zones = (zonesRes.zones || []).map(adaptZone);
  window.zones = zones;
  if (zonesRes.data_note) showDataNote(zonesRes.data_note);
  syncMapMarkers();
  updateMapPlaceholderCount();
}

async function loadMapZones() {
  const zonesRes = await api(`/zones${ds().zonesQuery('map')}`);
  zones = (zonesRes.zones || []).map(adaptZone);
  window.zones = zones;
  syncMapMarkers();
  updateMapPlaceholderCount();
}

async function loadAllZonesData(stateName) {
  const q = stateName
    ? `?state=${encodeURIComponent(stateName)}&limit=250`
    : ds().zonesQuery('full');
  const cacheKey = stateName ? `zones-state-${stateName}` : 'zones-full';
  const zonesRes = await apiGetCached(`/zones${q}`, cacheKey);
  const batch = (zonesRes.zones || []).map(adaptZone);
  if (stateName) {
    const merged = new Map((allZones.length ? allZones : zones).map((z) => [z.id, z]));
    batch.forEach((z) => merged.set(z.id, z));
    allZones = [...merged.values()];
  } else {
    allZones = batch;
  }
  window.allZones = allZones;
}

function syncMapMarkers() {
  if (!map) return;
  const ids = new Set(zones.filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng)).map((z) => z.id));
  Object.keys(markers).forEach((id) => {
    if (!ids.has(id)) {
      map.removeLayer(markers[id].circle);
      map.removeLayer(markers[id].pulse);
      delete markers[id];
    }
  });
  zones.forEach((z) => {
    if (Number.isFinite(z.lat) && Number.isFinite(z.lng)) addMk(z);
  });
  buildMapList();
}

function updateMapPlaceholderCount() {
  const el = document.getElementById('map-alert-count');
  if (!el) return;
  const n = allZones.length || zones.length;
  el.textContent = n
    ? `${n} safety alert${n !== 1 ? 's' : ''} on the map — tap to view`
    : 'Loading community alerts…';
}

async function loadRoutesData() {
  const routesRes = await apiGetCached('/routes', 'routes');
  routes = (routesRes.routes || []).map((r) => ({
    from: r.from,
    to: r.to,
    score: r.safety_score ?? 50,
    travelers: r.travelers_last_2h ?? 0,
    via: r.via || '',
    updated: timeAgo(r.last_updated),
    warn: null,
  }));
  routes.forEach((r) => {
    if (r.score < 35) r.warn = 'CRITICAL DANGER — Community strongly advises avoiding this route completely.';
    else if (r.score < 65) r.warn = 'HIGH RISK — Use extreme caution on this route.';
  });
  routesLoaded = true;
  const elSafe = document.getElementById('s-safe');
  if (elSafe) elSafe.textContent = routes.filter((r) => r.score > 65).length;
}

async function loadGroupsData() {
  const groupsRes = await apiGetCached('/groups', 'groups');
  groups = (groupsRes.groups || []).map((g, i) => ({
    id: g.id,
    name: g.name,
    members: g.member_count || 0,
    icon: g.icon || ['🚛', '🛒', '🌍', '👥'][i % 4],
    alerts: 0,
    source: g.source || '',
    verified: !!g.verified_partner,
  }));
  window.groupsApiNote = groupsRes.note || '';
  groupsLoaded = true;
}

async function loadCircleData() {
  if (state.token) {
    try {
      const { circle: c } = await api('/user/circle');
      const store = circlePhoneStore();
      circle = (c || []).map((m) => ({
        name: m.name,
        rel: m.relation,
        relation: m.relation,
        phone: store[m.name] || m.phone,
        status: 'safe',
        icon: '🏠',
        last: 'Circle member',
      }));
      window.SafeAlertCitizenSOS?.cacheCircle?.(circle);
    } catch (_) {
      /* ignore */
    }
  }
  if (!circle.length && !state.token) {
    circle = [{ name: 'Sign in', rel: 'Tap profile', status: 'unknown', icon: '👤', last: 'Add trusted contacts' }];
  }
  const elCircle = document.getElementById('s-circle');
  if (elCircle) elCircle.textContent = circle.length;
}

async function loadData(opts = {}) {
  const full = !ds().isEnabled() || opts.full;
  await loadStatsOnly();
  await loadZonesData();
  loadAllZonesData().catch(() => {});
  await loadSettingsIfNeeded();

  if (full) {
    await Promise.all([loadRoutesData(), loadGroupsData(), loadCircleData()]);
  } else {
    if (currentScreen === 'routes' || !ds().isEnabled()) await loadRoutesData();
    if (currentScreen === 'circle' || !ds().isEnabled()) {
      await loadGroupsData();
      await loadCircleData();
    }
  }

  setConn(true);
  markSynced();
}

async function refreshAll() {
  if (refreshing) return;
  if (document.visibilityState === 'hidden') return;
  refreshing = true;
  const btn = document.getElementById('btn-refresh');
  btn?.classList.add('spin');
  showLoader(true);
  try {
    if (ds().isEnabled()) {
      await loadStatsOnly();
      await loadZonesData();
      if (currentScreen === 'routes') await loadRoutesData();
      if (currentScreen === 'insights') await loadInsightsData();
      if (currentScreen === 'circle') {
        await loadGroupsData();
        await loadCircleData();
      }
    } else {
      await loadData({ full: true });
    }
    if (mapReady) await refreshZones();
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
    if (currentScreen === 'insights') buildInsights();
    if (currentScreen === 'circle') await loadResources();
    await loadActiveCheckIn();
    syncNearbyPanicCard();
    toast('↻ Data refreshed', 'ok');
  } catch (e) {
    setConn(false);
    toast(e.message || 'Refresh failed', 'err');
  } finally {
    refreshing = false;
    btn?.classList.remove('spin');
    showLoader(false);
  }
}
