/** SafeAlert app module — Circle, groups, check-in, nearby panic */
/* eslint-disable */
function buildCircle() {
  document.getElementById('circle-list').innerHTML = circle
    .map((m) => {
      const sc = m.status === 'safe' ? 'green' : m.status === 'traveling' ? 'amber' : 'gray';
      const ab =
        m.status === 'safe'
          ? 'rgba(18,183,106,0.1)'
          : m.status === 'traveling'
            ? 'rgba(247,144,9,0.1)'
            : 'rgba(255,255,255,0.05)';
      const bd =
        m.status === 'safe'
          ? 'rgba(18,183,106,0.25)'
          : m.status === 'traveling'
            ? 'rgba(247,144,9,0.3)'
            : 'var(--border)';
      const isSignIn = m.name === 'Sign in';
      return `<div class="member-card" ${isSignIn ? 'role="button" tabindex="0" style="cursor:pointer" onclick="openProfile()"' : ''}>
      <div class="member-av" style="background:${ab};border:1px solid ${bd}">${ico(m.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-sub">${escapeHtml(m.rel)} · ${escapeHtml(isSignIn ? 'Opens account login' : m.last)}</div>
      </div>
      <span class="badge badge-${sc}">${isSignIn ? 'LOGIN' : m.status.toUpperCase()}</span>
    </div>`;
    })
    .join('');
  syncCircleSetupNudge();
}

async function joinGroup(id, name) {
  if (!(await ensureAuth())) {
    toast('Sign in to join groups', 'err');
    openProfile();
    return;
  }
  try {
    await api(`/groups/${id}/join`, { method: 'POST', body: '{}' });
    toast(`Joined ${name}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function loadResources() {
  const el = document.getElementById('resources-list');
  if (!el) return;
  try {
    let url = '/resources?limit=20';
    if (uLat != null && uLng != null) url = `/resources/nearby?lat=${uLat}&lng=${uLng}&radius_km=50`;
    const { resources } = await api(url);
    if (!resources?.length) {
      el.innerHTML = '<p style="font-size:12px;color:var(--text3)">No resources loaded yet.</p>';
      return;
    }
    el.innerHTML = resources
      .map(
        (r) => `<div class="group-row" style="cursor:default">
        <span style="font-size:20px">${r.type === 'hospital' ? '🏥' : r.type === 'legal' ? '⚖️' : r.type === 'safe_house' ? '🏠' : '📋'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHtml(r.name)}</div>
          <div style="font-size:11px;color:var(--text2)">${escapeHtml(r.state || '')}${r.distance_km != null ? ` · ${r.distance_km} km` : ''}</div>
        </div>
        <a href="tel:${escapeHtml(r.phone)}" style="font-size:12px;color:var(--green);font-weight:700">Call</a>
      </div>`
      )
      .join('');
  } catch (_) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text3)">Resources unavailable</p>';
  }
}

async function startCheckIn() {
  return scheduleCheckInWithHours(2);
}

async function scheduleCheckInWithHours(hours) {
  if (!state.token) return toast('Sign in for check-in', 'err');
  const h = Math.max(0.5, Math.min(24, Number(hours) || 2));
  try {
    const due = new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
    const { check_in } = await api('/check-in', {
      method: 'POST',
      body: JSON.stringify({ due_at: due, notify_circle: true }),
    });
    state.activeCheckIn = check_in;
    syncCheckInUI();
    syncWomenCheckinNudge?.();
    toast(`Check-in in ${h}h — confirm before deadline`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function confirmCheckIn() {
  if (!state.token || !state.activeCheckIn?.id) return;
  try {
    await api(`/check-in/${state.activeCheckIn.id}/confirm`, { method: 'POST', body: '{}' });
    state.activeCheckIn = null;
    syncCheckInUI();
    toast('Check-in confirmed — you are safe', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function loadActiveCheckIn() {
  if (!state.token) return;
  try {
    const { check_in } = await api('/check-in/active');
    state.activeCheckIn = check_in;
    syncCheckInUI();
  } catch (_) {
    /* ignore */
  }
}

function syncCheckInUI() {
  const idle = document.getElementById('checkin-idle');
  const active = document.getElementById('checkin-active');
  const due = document.getElementById('checkin-due');
  if (!idle || !active) return;
  if (state.activeCheckIn) {
    idle.style.display = 'none';
    active.style.display = 'block';
    if (due) {
      const t = new Date(state.activeCheckIn.due_at);
      due.textContent = `Due ${t.toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
    }
  } else {
    idle.style.display = 'block';
    active.style.display = 'none';
  }
}

async function saveResponderProfile() {
  if (!state.token) return toast('Sign in first', 'err');
  const available = !!document.getElementById('pref-responder-available')?.checked;
  const skills = [...document.querySelectorAll('#responder-skills input[data-skill]:checked')].map(
    (el) => el.getAttribute('data-skill')
  );
  try {
    const d = await api('/user/responder-profile', {
      method: 'PUT',
      body: JSON.stringify({ skills, available }),
    });
    state.preferences.responder_skills = d.responder?.skills || skills;
    state.preferences.responder_available = d.responder?.available;
    toast('Helper settings saved', 'ok');
    syncNearbyPanicCard();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function rescheduleRefreshTimers() {
  clearInterval(refreshIv);
  clearInterval(nearbyPanicIv);
  refreshIv = setInterval(() => {
    if (document.visibilityState === 'visible') refreshAll().catch(() => {});
  }, ds().refreshIntervalMs());
  const nearbyMs = ds().nearbyPanicPollMs();
  if (nearbyMs > 0) {
    nearbyPanicIv = setInterval(() => {
      if (
        state.token &&
        state.preferences?.help_nearby_enabled &&
        document.visibilityState === 'visible'
      ) {
        syncNearbyPanicCard().catch(() => {});
      }
    }, nearbyMs);
  }
}

async function syncNearbyPanicCard() {
  const card = document.getElementById('nearby-panic-card');
  const list = document.getElementById('nearby-panic-list');
  if (!card || !list) return;
  if (ds().isEnabled() && ds().pushLikelyWorks()) {
    card.style.display = state.preferences.help_nearby_enabled ? 'block' : 'none';
    if (state.preferences.help_nearby_enabled) {
      list.innerHTML =
        '<p style="font-size:11px;color:var(--text3)">Push alerts on — panics will notify you without polling.</p>';
    }
    return;
  }
  if (!state.token || !state.preferences.help_nearby_enabled || uLat == null) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  try {
    const radius = state.preferences.help_nearby_radius_km || 5;
    const { panics } = await api(`/panic/nearby?lat=${uLat}&lng=${uLng}&radius_km=${radius}`);
    if (!panics?.length) {
      list.innerHTML = 'No active panics nearby right now.';
      return;
    }
    list.innerHTML = panics
      .map((p) => {
        const sid = escapeHtml(p.short_id || p.id?.slice(-6) || '????');
        const dist = p.distance_km != null ? `${p.distance_km} km away` : '';
        const when = p.started_at ? timeAgo(p.started_at) : '';
        const responders =
          p.responder_count > 0
            ? `<span style="color:var(--green);font-size:10px">${p.responder_count} helper${p.responder_count > 1 ? 's' : ''} en route</span>`
            : '';
        const mapsBtn =
          p.lat != null && p.lng != null
            ? `<button class="btn btn-outline btn-sm" style="margin-top:6px;margin-right:6px" onclick="openMapsForPanic(${p.lat},${p.lng},'Panic #${sid}')">🗺 Maps</button>`
            : '';
        const btn = p.already_responding
          ? `<div style="margin-top:8px;font-size:11px;font-weight:700;color:var(--green)">✓ You're on the way</div>${mapsBtn}`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          <button class="btn btn-green btn-sm" onclick="respondToPanic('${escapeHtml(p.id)}','${sid}')">I'm on my way</button>
          ${mapsBtn}
          <button class="btn btn-outline btn-sm" style="color:var(--text3)" onclick="dismissPanicHelper('${escapeHtml(p.id)}')">Can't help</button>
        </div>`;
        return `<div class="panic-alert-card" data-panic-id="${escapeHtml(p.id)}" style="padding:12px;margin-bottom:8px;border-radius:12px;border:1px solid var(--red-border);background:var(--red-soft)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span style="font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--red);background:rgba(240,62,62,0.2);padding:2px 8px;border-radius:6px">PANIC #${sid}</span>
            <div style="font-weight:700;font-size:13px;margin-top:6px">${escapeHtml(p.victim_label || 'Someone nearby')}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px">${escapeHtml(p.state || '')}${dist ? ' · ' + dist : ''}${when ? ' · ' + when : ''}</div>
          </div>
        </div>
        ${responders}
        ${btn}
      </div>`;
      })
      .join('');
  } catch (e) {
    list.textContent = e.message;
  }
}

async function respondToPanic(id, shortId) {
  if (!state.token) return toast('Sign in first', 'err');
  const proceed = await ensureHelperSafetyAccepted();
  if (!proceed) return;
  try {
    const d = await api(`/panic/${id}/respond`, { method: 'POST', body: '{}' });
    const tag = shortId || d.short_id || '';
    toast(d.message || (d.push_sent ? `Alert #${tag}: they were notified` : `Marked en route for #${tag}`), 'ok');
    syncNearbyPanicCard();
  } catch (e) {
    toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
  }
}

function ensureHelperSafetyAccepted() {
  if (localStorage.getItem('sa_helper_safety') === '1') return Promise.resolve(true);
  return new Promise((resolve) => {
    const sheet = document.getElementById('helper-safety-sheet');
    const bg = document.getElementById('sheet-bg');
    const accept = document.getElementById('helper-safety-accept');
    const cancel = document.getElementById('helper-safety-cancel');
    if (!sheet || !bg || !accept || !cancel) return resolve(true);

    const cleanup = () => {
      accept.removeEventListener('click', onAccept);
      cancel.removeEventListener('click', onCancel);
    };
    const onAccept = () => {
      localStorage.setItem('sa_helper_safety', '1');
      sheet.classList.remove('show');
      if (!document.querySelector('.sheet.show')) bg.classList.remove('show');
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      sheet.classList.remove('show');
      if (!document.querySelector('.sheet.show')) bg.classList.remove('show');
      cleanup();
      resolve(false);
    };

    markSheetOpened();
    bg.classList.add('show');
    sheet.classList.add('show');
    accept.addEventListener('click', onAccept);
    cancel.addEventListener('click', onCancel);
  });
}

async function reportFalseZone(id) {
  try {
    const d = await api(`/zones/${id}/report-false`, {
      method: 'POST',
      body: JSON.stringify({ device_id: state.deviceId, reason: 'Suspected false report' }),
    });
    toast(d.message || 'Report recorded', 'ok');
    await refreshAll();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function buildGroups() {
  const el = document.getElementById('groups-list');
  if (!el) return;
  if (!groups.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text2);line-height:1.5;padding:8px 0">${escapeHtml(window.groupsApiNote || 'No community groups yet — create one above for your union, market, or estate.')}</p>`;
    return;
  }
  el.innerHTML = groups
    .map((g) => {
      const badge = g.verified
        ? '<span class="badge badge-green" style="font-size:9px;margin-left:6px">Verified</span>'
        : g.source === 'community'
          ? '<span class="badge badge-gray" style="font-size:9px;margin-left:6px">Community</span>'
          : '';
      const members =
        g.members === 1 ? '1 member' : `${g.members.toLocaleString()} members`;
      return `
    <div class="group-row" onclick='joinGroup(${JSON.stringify(g.id)}, ${JSON.stringify(g.name)})'>
      <span style="font-size:24px">${g.icon}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;margin-bottom:2px">${escapeHtml(g.name)}${badge}</div>
        <div style="font-size:11px;color:var(--text2)">${members}</div>
      </div>
      ${g.alerts ? `<div style="background:var(--red);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${g.alerts}</div>` : ''}
    </div>`;
    })
    .join('');
}

async function createCommunityGroup() {
  if (!(await ensureAuth())) {
    toast('Sign in to create a group', 'err');
    openProfile();
    return;
  }
  const name = document.getElementById('group-create-name')?.value?.trim();
  const radius_km = parseFloat(document.getElementById('group-create-radius')?.value) || 5;
  if (!name) return toast('Enter a group name', 'err');
  const { lat, lng } =
    typeof effectiveCoords === 'function' ? effectiveCoords() : { lat: uLat, lng: uLng };
  if (lat == null || lng == null) return toast('Turn on GPS to set the group area', 'err');
  try {
    await api('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name,
        geofence_center: { lat, lng },
        geofence_radius_km: Math.min(25, Math.max(1, radius_km)),
      }),
    });
    toast(`Group "${name}" created`, 'ok');
    document.getElementById('group-create-name').value = '';
    await loadGroupsData();
    buildGroups();
  } catch (e) {
    toast(e.message, 'err');
  }
}
