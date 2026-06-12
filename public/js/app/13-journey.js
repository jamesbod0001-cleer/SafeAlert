/** SafeAlert app module — Journey watch + route feedback */
/* eslint-disable */
// ── JOURNEY ───────────────────────────────────────────────────────────────────
function routeIdFromCities(from, to) {
  const norm = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const slug = (s) =>
    norm(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  return `${slug(from)}_${slug(to)}`;
}

function captureJourneyRoute() {
  const from =
    document.getElementById('j-from')?.value?.trim() ||
    document.getElementById('j-start-from')?.value?.trim() ||
    '';
  const to =
    document.getElementById('j-to')?.value?.trim() ||
    document.getElementById('j-start-to')?.value?.trim() ||
    '';
  if (from) journeyFrom = from;
  if (to) journeyTo = to;
}

function showJourneyFeedbackPrompt() {
  if (!journeyFrom || !journeyTo) return;
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  const el = document.getElementById('journey-feedback-prompt');
  if (el) {
    el.style.display = 'block';
    el.classList.add('show');
  }
}

function dismissJourneyFeedbackPrompt() {
  document.getElementById('journey-feedback-prompt')?.classList.remove('show');
  document.getElementById('journey-feedback-prompt').style.display = 'none';
  closeSheets();
}

async function submitJourneyQuickFeedback(rating) {
  if (!journeyFrom || !journeyTo) return dismissJourneyFeedbackPrompt();
  const routeId = routeIdFromCities(journeyFrom, journeyTo);
  try {
    const res = await api(`/routes/${routeId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({
        safe: rating >= 4,
        safety_rating: rating,
        from: journeyFrom,
        to: journeyTo,
      }),
    });
    dismissJourneyFeedbackPrompt();
    const scoreMsg = res.route?.safety_score != null ? ` Route score: ${res.route.safety_score}/100.` : '';
    toast(`✓ Thanks for rating your trip.${scoreMsg}`, 'ok');
    routesLoaded = false;
    loadRoutesData().catch(() => {});
  } catch (e) {
    dismissJourneyFeedbackPrompt();
    toast(e.message || 'Could not save rating', 'err');
  }
}

async function startJourney() {
  if (!(await ensureAuth())) {
    toast('Sign in required for journey');
    return;
  }
  journeyFrom = document.getElementById('j-start-from')?.value?.trim() || '';
  journeyTo = document.getElementById('j-start-to')?.value?.trim() || '';
  try {
    await api('/journey/start', { method: 'POST', body: '{}' });
    journeyOn = true;
    jSecs = 0;
    document.getElementById('j-start-ui').style.display = 'none';
    document.getElementById('j-live-ui').style.display = 'block';
    jTmr = setInterval(() => {
      jSecs++;
      document.getElementById('j-timer').textContent = fmt(jSecs);
    }, 1000);
    startLocationPing();
    toast('🚗 Journey started — your circle is watching', 'ok');
  } catch (e) {
    toast(e.message);
  }
}

function resetJourneyUi() {
  journeyOn = false;
  journeyRating = 0;
  journeyFrom = '';
  journeyTo = '';
  clearInterval(jTmr);
  if (!panicOn) stopLocationPing();
  document.getElementById('j-start-ui').style.display = 'block';
  document.getElementById('j-live-ui').style.display = 'none';
  document.querySelectorAll('.j-rate').forEach((b) => {
    b.classList.remove('btn-green');
    b.classList.add('btn-outline');
  });
}

function openJourneyEndSheet() {
  if (!journeyOn) return;
  if (!state.token) {
    resetJourneyUi();
    toast('✓ Journey ended.');
    return;
  }
  captureJourneyRoute();
  journeyRating = 0;
  document.querySelectorAll('.j-rate').forEach((b) => {
    b.classList.remove('btn-green');
    b.classList.add('btn-outline');
  });
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('journey-end-sheet')?.classList.add('show');
  setTimeout(() => document.getElementById('j-from')?.focus(), 300);
}

function pickJourneyRating(n) {
  journeyRating = n;
  document.querySelectorAll('.j-rate').forEach((b) => {
    const r = parseInt(b.dataset.rating, 10);
    const on = r === n;
    b.classList.toggle('btn-green', on);
    b.classList.toggle('btn-outline', !on);
  });
}

async function submitJourneyEnd() {
  const from = document.getElementById('j-from')?.value?.trim();
  const to = document.getElementById('j-to')?.value?.trim();
  const via = document.getElementById('j-via')?.value?.trim() || '';
  if (!from || !to) return toast('Enter From and To cities', 'err');
  journeyFrom = from;
  journeyTo = to;
  if (!journeyRating) return toast('Pick a safety score 1–5', 'err');
  try {
    const res = await api('/journey/end', {
      method: 'POST',
      body: JSON.stringify({ from, to, via, safety_rating: journeyRating }),
    });
    closeSheets();
    resetJourneyUi();
    const routeMsg = res.route_feedback?.route
      ? ` Route score: ${res.route_feedback.route.safety_score}/100.`
      : '';
    toast(`✓ Thanks! Journey ended.${routeMsg}`, 'ok');
    routesLoaded = false;
    loadRoutesData().catch(() => {});
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function endJourneySkipRating() {
  captureJourneyRoute();
  const savedFrom = journeyFrom || document.getElementById('j-from')?.value?.trim() || '';
  const savedTo = journeyTo || document.getElementById('j-to')?.value?.trim() || '';
  if (state.token) {
    try {
      await api('/journey/end', { method: 'POST', body: '{}' });
    } catch (_) {
      /* ignore */
    }
  }
  closeSheets();
  resetJourneyUi();
  toast('✓ Journey ended.');
  if (savedFrom && savedTo) {
    journeyFrom = savedFrom;
    journeyTo = savedTo;
    showJourneyFeedbackPrompt();
  }
}

async function endJourney() {
  if (journeyOn && state.token) {
    openJourneyEndSheet();
    return;
  }
  resetJourneyUi();
  toast('✓ Journey ended.');
}
