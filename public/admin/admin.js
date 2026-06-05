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
  const leadersPanel = document.getElementById('leaders-panel');
  const flagsPanel = document.getElementById('flags-panel');
  const proximityToggle = document.getElementById('proximity-toggle');
  const proximityNote = document.getElementById('proximity-note');

  function getSecret() {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  }

  function setSecret(value) {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
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

  async function loadSettings() {
    const data = await api('/settings');
    proximityToggle.checked = !!data.proximity_alerts_enabled;
    proximityNote.textContent =
      'Push notifications: ' +
      (data.push_notifications_enabled ? 'enabled' : 'disabled') +
      '. Env PROXIMITY_ALERTS_ENABLED wins on restart.';
  }

  async function loadLeaders() {
    const { leaders } = await api('/leaders/pending');
    if (!leaders.length) {
      leadersPanel.innerHTML = '<p class="empty">No pending applications.</p>';
      return;
    }
    const rows = leaders
      .map(
        (l) =>
          '<tr>' +
          '<td>' +
          esc(l.org_name || '—') +
          '</td>' +
          '<td>' +
          esc(l.role) +
          '</td>' +
          '<td>' +
          esc([l.state, l.lga].filter(Boolean).join(', ') || '—') +
          '</td>' +
          '<td>' +
          esc(l.phone || '—') +
          '</td>' +
          '<td class="actions">' +
          '<button class="btn btn-sm" data-verify="' +
          esc(l.id) +
          '" data-verified="1">Verify</button>' +
          '<button class="btn btn-sm btn-danger" data-verify="' +
          esc(l.id) +
          '" data-verified="0">Reject</button>' +
          '</td>' +
          '</tr>'
      )
      .join('');
    leadersPanel.innerHTML =
      '<table><thead><tr><th>Org</th><th>Role</th><th>Location</th><th>Phone</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
    leadersPanel.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-verify');
        const verified = btn.getAttribute('data-verified') === '1';
        btn.disabled = true;
        try {
          await api('/leaders/' + id + '/verify', {
            method: 'POST',
            body: JSON.stringify({ verified, note: verified ? 'Approved via admin UI' : 'Rejected via admin UI' }),
          });
          await loadLeaders();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadFlags() {
    const { flags } = await api('/false-reports');
    if (!flags.length) {
      flagsPanel.innerHTML = '<p class="empty">No false-report flags.</p>';
      return;
    }
    const rows = flags
      .map(
        (f) =>
          '<tr>' +
          '<td>' +
          esc(f.zone_id || '—') +
          '</td>' +
          '<td>' +
          esc(f.reason || '—') +
          '</td>' +
          '<td style="font-family:monospace;font-size:11px">' +
          esc((f.device_hash || '').slice(0, 12)) +
          '…</td>' +
          '<td>' +
          esc(f.created_at ? new Date(f.created_at).toLocaleString() : '—') +
          '</td>' +
          '</tr>'
      )
      .join('');
    flagsPanel.innerHTML =
      '<table><thead><tr><th>Zone</th><th>Reason</th><th>Device</th><th>When</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
  }

  async function loadAll() {
    try {
      await Promise.all([loadSettings(), loadLeaders(), loadFlags()]);
    } catch (err) {
      if (err.message !== 'Invalid admin secret') {
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
      proximityNote.textContent = result.note || 'Updated.';
    } catch (err) {
      proximityToggle.checked = !enabled;
      alert(err.message);
    } finally {
      proximityToggle.disabled = false;
    }
  });

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

  if (getSecret()) {
    showDashboard();
  } else {
    showAuth();
  }
})();
