/** SafeAlert app module — Panic SOS flow (guest-first: local help before auth) */
/* eslint-disable */

function startPanicOverlayTimer() {
  panicSecs = 0;
  document.getElementById('pov-timer').textContent = fmt(0);
  clearInterval(panicTmr);
  panicTmr = setInterval(() => {
    panicSecs++;
    document.getElementById('pov-timer').textContent = fmt(panicSecs);
    if (uLat && uLng) {
      document.getElementById('pov-coords').textContent = `${uLat.toFixed(5)}°N, ${uLng.toFixed(5)}°E`;
    }
  }, 1000);
}

function showPanicOverlay(opts = {}) {
  const { localOnly = false, serverQueued = false } = opts;
  panicOn = true;
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  startLocationPing();
  document.getElementById('pov')?.classList.add('show');
  const sub = document.querySelector('#pov .pov-sub');
  if (sub) {
    sub.textContent = localOnly
      ? 'Local SOS — use WhatsApp & calls below. Sign in to reach nearby helpers.'
      : serverQueued
        ? 'Your circle + nearby helpers — not government dispatch'
        : 'Your circle + nearby helpers — not government dispatch';
  }
  document.getElementById('pov-members').innerHTML = circle
    .slice(0, 5)
    .filter((m) => m.name !== 'Sign in')
    .map(
      (m) => `
    <div class="pov-member">
      <div class="pov-member-dot"></div>
      <span style="font-size:12px;color:rgba(255,255,255,0.85);flex:1">${escapeHtml(m.name)} — ${escapeHtml(m.rel || m.relation || '')}</span>
      <span style="font-size:10px;color:var(--green);font-weight:700">${localOnly ? 'Use WA below' : 'Alerting ✓'}</span>
    </div>`
    )
    .join('');
  window.SafeAlertCitizenSOS?.renderPovCircleActions?.();
  window.SafeAlertMedical?.applyReasonUI?.('security');
  startPanicOverlayTimer();
}

function ensurePanicDisclaimerAccepted() {
  if (localStorage.getItem('sa_panic_disclaimer') === '1') return Promise.resolve(true);
  return new Promise((resolve) => {
    const sheet = document.getElementById('panic-disclaimer-sheet');
    const bg = document.getElementById('sheet-bg');
    const accept = document.getElementById('panic-disclaimer-accept');
    const cancel = document.getElementById('panic-disclaimer-cancel');
    if (!sheet || !bg || !accept || !cancel) return resolve(true);

    const cleanup = () => {
      accept.removeEventListener('click', onAccept);
      cancel.removeEventListener('click', onCancel);
    };
    const onAccept = () => {
      localStorage.setItem('sa_panic_disclaimer', '1');
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

    sheetOpenedAt = Date.now();
    window.sheetOpenedAt = sheetOpenedAt;
    bg.classList.add('show');
    sheet.classList.add('show');
    accept.addEventListener('click', onAccept);
    cancel.addEventListener('click', onCancel);
  });
}

function holdStart() {
  holdProg = 0;
  const arc = document.getElementById('panic-arc');
  const hint = document.getElementById('panic-hint');
  const btn = document.getElementById('panic-btn');
  btn.classList.add('holding');
  holdTmr = setInterval(() => {
    holdProg += 100 / 60;
    const circ = 2 * Math.PI * 55;
    const fill = (holdProg / 100) * circ;
    arc.setAttribute('stroke-dasharray', `${fill} ${circ}`);
    const s = Math.max(0, Math.ceil(3 - (holdProg / 100) * 3));
    hint.textContent = holdProg >= 100 ? 'Activating…' : `Hold ${s}s more to activate`;
    if (window.SafeAlertVoice?.isEnabled?.()) {
      window.SafeAlertVoice.speak(hint.textContent);
    }
    if (holdProg >= 100) {
      clearInterval(holdTmr);
      doPanic();
    }
  }, 50);
}

function holdStop() {
  clearInterval(holdTmr);
  document.getElementById('panic-arc').setAttribute('stroke-dasharray', '0 345.4');
  document.getElementById('panic-hint').textContent = 'Hold 3 seconds to activate';
  document.getElementById('panic-btn').classList.remove('holding');
  holdProg = 0;
}

async function doPanic() {
  holdStop();
  if (!(await ensurePanicDisclaimerAccepted())) return;

  window.SafeAlertMedical?.setPendingReason?.('security');

  const contacts = window.SafeAlertCitizenSOS?.getCircleContacts?.() || [];
  showPanicOverlay({ localOnly: !state.token });

  if (!contacts.length) {
    setTimeout(() => window.SafeAlertCitizenSOS?.sharePanicWhatsApp?.(), 900);
  }

  if (!state.token) {
    toast('SOS active — WhatsApp your circle now. Sign in to alert nearby helpers.', 'ok');
    return;
  }

  try {
    const { lat, lng } = effectiveCoords();
    const panicRes = await api('/panic/activate', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, reason: 'security' }),
    });
    const pid = panicRes.short_id || panicRes.panic_id?.slice(-6)?.toUpperCase() || '';
    toast(
      panicRes.notifications_async
        ? `Panic #${pid} — your circle & nearby helpers are being notified`
        : `Panic #${pid} activated`,
      'ok'
    );
    if (panicRes.panic_id) {
      window.SafeAlertUX = window.SafeAlertUX || {};
      window.SafeAlertUX.activePanicId = panicRes.panic_id;
      window.SafeAlertUX.activePanicShortId = pid;
      const hint = document.getElementById('panic-hint');
      if (hint) hint.textContent = `Alert #${pid} — tap WhatsApp SOS if no one responds in 2 min`;
      const mapsBtn = document.getElementById('pov-open-maps');
      if (mapsBtn && uLat != null) {
        mapsBtn.style.display = 'flex';
        mapsBtn.onclick = () => openMapsForPanic(uLat, uLng, `Panic #${pid}`);
      }
      if (typeof refreshPovResponders === 'function') refreshPovResponders();
    }
    const sub = document.querySelector('#pov .pov-sub');
    if (sub) sub.textContent = 'Your circle + nearby helpers — not government dispatch';
    setTimeout(() => window.SafeAlertCitizenSOS?.sharePanicWhatsApp?.(), 1500);
  } catch (e) {
    if (e.status === 409) {
      document.getElementById('pov')?.classList.add('show');
      toast(e.message, 'err');
      window.SafeAlertCitizenSOS?.renderPovCircleActions?.();
      return;
    }
    window.SafeAlertCitizenSOS?.activateLocalFallback?.(e.message, { alreadyVisible: true });
  }
}

async function deactivatePanic() {
  panicOn = false;
  clearInterval(panicTmr);
  clearInterval(window._povResponderIv);
  window._povResponderIv = null;
  if (window.SafeAlertUX) {
    window.SafeAlertUX.activePanicId = null;
    window.SafeAlertUX.activePanicShortId = null;
  }
  if (!journeyOn) stopLocationPing();
  document.getElementById('pov').classList.remove('show');
  const mapsBtn = document.getElementById('pov-open-maps');
  if (mapsBtn) mapsBtn.style.display = 'none';
  if (state.token) {
    try {
      await api('/panic/deactivate', { method: 'POST', body: '{}' });
    } catch (_) {
      /* ignore */
    }
  }
  toast('✓ Panic deactivated. Stay safe.');
}

async function broadcastPanicNearby() {
  if (!panicOn) return toast('Activate panic first', 'err');
  if (!state.token) {
    window.SafeAlertCitizenSOS?.sharePanicWhatsApp?.();
    return toast('Share on WhatsApp to reach more people', 'ok');
  }
  try {
    const d = await api('/panic/broadcast', {
      method: 'POST',
      body: JSON.stringify(effectiveCoords()),
    });
    toast(d.message || '📢 Broadcast queued for nearby helpers', 'ok');
  } catch (e) {
    toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
  }
}
