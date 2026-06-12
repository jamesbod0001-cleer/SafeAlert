/** SafeAlert app module — HTTP client + cached GET */
/* eslint-disable */
function ds() {
  return window.SafeAlertDataSaver || { isEnabled: () => false, zonesQuery: () => '?limit=80' };
}

function handleSessionExpired() {
  if (!state.token) return;
  state.token = null;
  localStorage.removeItem('safealert_token');
  setOtpToken(null);
  updateProfileUI();
  updateSignInBanner();
  toast('Session expired — sign in again (happens after server updates)', 'err');
  setTimeout(() => {
    if (typeof openProfile === 'function') openProfile();
  }, 500);
}

function maybeHandleAuthError(status, msg) {
  if (status !== 401 || !state.token) return false;
  if (!/invalid or expired token|missing authorization/i.test(String(msg || ''))) return false;
  handleSessionExpired();
  return true;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers, body: opts.body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(data?.messages) && data.messages.length ? data.messages.join('. ') : null) ||
      data?.error ||
      (typeof data === 'string' ? data : null) ||
      `Request failed (${res.status})`;
    if (maybeHandleAuthError(res.status, msg)) {
      const err = new Error('Session expired — please sign in again');
      err.status = res.status;
      err.sessionExpired = true;
      throw err;
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiGetCached(path, cacheKey) {
  const etagKey = `safealert_etag_${cacheKey}`;
  const bodyKey = `safealert_body_${cacheKey}`;
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const etag = localStorage.getItem(etagKey);
  if (etag) headers['If-None-Match'] = etag;

  try {
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 304) {
      const cached = localStorage.getItem(bodyKey);
      if (cached) return JSON.parse(cached);
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        data?.error || (typeof data === 'string' ? data : null) || `Request failed (${res.status})`;
      if (maybeHandleAuthError(res.status, msg)) {
        const err = new Error('Session expired — please sign in again');
        err.status = res.status;
        err.sessionExpired = true;
        throw err;
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const newEtag = res.headers.get('ETag');
    if (newEtag) {
      localStorage.setItem(etagKey, newEtag);
      localStorage.setItem(bodyKey, JSON.stringify(data));
    }
    return data;
  } catch (err) {
    const offline = window.SafeAlertOffline;
    if (offline?.tryFallback) {
      const fb = await offline.tryFallback(path);
      if (fb) {
        if (fb.data_note) showDataNote(fb.data_note);
        setConn(false);
        return fb;
      }
    }
    const stale = offline?.staleBody?.(cacheKey);
    if (stale) {
      showDataNote('Using saved data — connect for live updates.');
      setConn(false);
      return stale;
    }
    throw err;
  }
}
