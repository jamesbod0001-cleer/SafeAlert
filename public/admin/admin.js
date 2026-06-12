(function () {
  const API =
    location.origin && location.origin !== 'null'
      ? location.origin + '/v1/admin'
      : 'http://localhost:3000/v1/admin';
  const STORAGE_KEY = 'safealert_admin_secret';

  const authGate = document.getElementById('auth-gate');
  const dashboard = document.getElementById('dashboard');
  const secretInput = document.getElementById('secret-input');
  const authBtn = document.getElementById('auth-btn');
  const authError = document.getElementById('auth-error');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshBtn = document.getElementById('admin-refresh-btn');
  const statusEl = document.getElementById('admin-status');
  const leadersPanel = document.getElementById('leaders-panel');
  const flagsPanel = document.getElementById('flags-panel');
  const proximityToggle = document.getElementById('proximity-toggle');
  const pushToggle = document.getElementById('push-toggle');
  const proximityNote = document.getElementById('proximity-note');
  const pushNote = document.getElementById('push-note');

  function getSecret() {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  }

  function setSecret(value) {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = isError ? 'error' : 'note';
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Admin-Secret': getSecret(),
      ...(options.headers || {}),
    };
    const res = await fetch(API + path, { ...options, headers });
    if (res.status === 401) {
      setSecret('');
      showAuth();
      throw new Error('Invalid admin secret');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed (' + res.status + ')');
    }
    return res.json();
  }

  function showAuth(msg) {
    authGate.classList.remove('hidden');
    dashboard.classList.add('hidden');
    authError.textContent = msg || '';
    authError.classList.toggle('hidden', !msg);
  }

  function showDashboard() {
    authGate.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadAll();
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-NG', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }

  async function loadSettings() {
    const data = await api('/settings');
    proximityToggle.checked = !!data.proximity_alerts_enabled;
    if (pushToggle) pushToggle.checked = !!data.push_notifications_enabled;
    proximityNote.textContent = data.proximity_alerts_enabled
      ? 'Nearby panic & zone alerts are ON.'
      : 'Proximity alerts are OFF — circle SMS may still send.';
    if (pushNote) {
      pushNote.textContent = data.push_notifications_enabled
        ? 'FCM push notifications enabled.'
        : 'Push notifications disabled at runtime.';
    }
  }

  async function loadLeaders() {
    leadersPanel.innerHTML = '<p class="empty">Loading applications…</p>';
    const { leaders } = await api('/leaders/pending');
    if (!leaders.length) {
      leadersPanel.innerHTML = '<p class="empty">No pending applications — all caught up.</p>';
      return;
    }
    const rows = leaders
      .map(
        (l) =>
          '<tr>' +
          '<td><strong>' +
          esc(l.org_name || '—') +
          '</strong><div class="cell-sub">' +
          esc(l.role || '') +
          '</div></td>' +
          '<td>' +
          esc([l.state, l.lga].filter(Boolean).join(', ') || '—') +
          '</td>' +
          '<td>' +
          esc(l.phone || '—') +
          '</td>' +
          '<td class="actions">' +
          '<button class="btn btn-sm" data-verify="' +
          esc(l.id) +
          '" data-verified="1">Approve</button>' +
          '<button class="btn btn-sm btn-danger" data-verify="' +
          esc(l.id) +
          '" data-verified="0">Reject</button>' +
          '</td>' +
          '</tr>'
      )
      .join('');
    leadersPanel.innerHTML =
      '<p class="note">' +
      leaders.length +
      ' pending</p><table><thead><tr><th>Applicant</th><th>Location</th><th>Phone</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
    leadersPanel.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-verify');
        const verified = btn.getAttribute('data-verified') === '1';
        const label = verified ? 'Approve this leader?' : 'Reject this application?';
        if (!confirm(label)) return;
        btn.disabled = true;
        try {
          await api('/leaders/' + id + '/verify', {
            method: 'POST',
            body: JSON.stringify({
              verified,
              note: verified ? 'Approved via admin UI' : 'Rejected via admin UI',
            }),
          });
          setStatus(verified ? 'Leader approved.' : 'Application rejected.', false);
          await loadLeaders();
        } catch (err) {
          setStatus(err.message, true);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadFlags() {
    flagsPanel.innerHTML = '<p class="empty">Loading flags…</p>';
    const { flags } = await api('/false-reports');
    if (!flags.length) {
      flagsPanel.innerHTML = '<p class="empty">No false-report flags.</p>';
      return;
    }
    const rows = flags
      .map(
        (f) =>
          '<tr>' +
          '<td><code style="font-size:11px">' +
          esc(f.zone_id || '—') +
          '</code></td>' +
          '<td>' +
          esc(f.reason || '—') +
          '</td>' +
          '<td style="font-family:monospace;font-size:11px">' +
          esc((f.device_hash || '').slice(0, 12)) +
          '…</td>' +
          '<td>' +
          esc(fmtWhen(f.created_at)) +
          '</td>' +
          '</tr>'
      )
      .join('');
    flagsPanel.innerHTML =
      '<p class="note">' +
      flags.length +
      ' recent flags</p><table><thead><tr><th>Zone ID</th><th>Reason</th><th>Device</th><th>When</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
  }

  async function loadAll() {
    setStatus('Refreshing…', false);
    try {
      await Promise.all([loadSettings(), loadLeaders(), loadFlags()]);
      setStatus('Updated ' + new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }), false);
    } catch (err) {
      if (err.message !== 'Invalid admin secret') {
        setStatus(err.message, true);
        leadersPanel.innerHTML = '<p class="error">' + esc(err.message) + '</p>';
      }
    }
  }

  proximityToggle.addEventListener('change', async () => {
    const enabled = proximityToggle.checked;
    proximityToggle.disabled = true;
    try {
      const result = await api('/settings/proximity', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      proximityNote.textContent = result.note || (enabled ? 'Proximity alerts ON.' : 'Proximity alerts OFF.');
      setStatus('Proximity setting saved.', false);
    } catch (err) {
      proximityToggle.checked = !enabled;
      setStatus(err.message, true);
    } finally {
      proximityToggle.disabled = false;
    }
  });

  if (pushToggle) {
    pushToggle.addEventListener('change', async () => {
      const enabled = pushToggle.checked;
      pushToggle.disabled = true;
      try {
        const result = await api('/settings/push', {
          method: 'PUT',
          body: JSON.stringify({ enabled }),
        });
        if (pushNote) pushNote.textContent = result.note || (enabled ? 'Push ON.' : 'Push OFF.');
        setStatus('Push setting saved.', false);
      } catch (err) {
        pushToggle.checked = !enabled;
        setStatus(err.message, true);
      } finally {
        pushToggle.disabled = false;
      }
    });
  }

  authBtn.addEventListener('click', async () => {
    const secret = secretInput.value.trim();
    if (!secret) {
      showAuth('Enter the admin secret.');
      return;
    }
    setSecret(secret);
    authBtn.disabled = true;
    try {
      await api('/settings');
      showDashboard();
    } catch (err) {
      setSecret('');
      showAuth(err.message);
    } finally {
      authBtn.disabled = false;
    }
  });

  secretInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authBtn.click();
  });

  logoutBtn.addEventListener('click', () => {
    setSecret('');
    secretInput.value = '';
    showAuth();
  });

  refreshBtn?.addEventListener('click', () => loadAll());

  if (getSecret()) {
    showDashboard();
  } else {
    showAuth();
  }
})();
