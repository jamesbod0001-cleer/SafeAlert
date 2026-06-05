/**
 * Zero-budget UX — guest mode, cost tips, free deployment hints.
 */
(function () {
  function t(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
  }

  function renderGuestBanner(cfg) {
    const host = document.getElementById('screen-home');
    if (!host || document.getElementById('guest-mode-banner')) return;

    const signedIn = !!window.state?.token;
    const el = document.createElement('div');
    el.id = 'guest-mode-banner';
    el.className = 'data-saver-banner';
    el.style.cursor = 'pointer';
    el.innerHTML = signedIn
      ? `<strong>${t('budget_signed_in')}</strong> ${t('budget_data_saver_hint')}`
      : `<strong>${t('budget_guest_title')}</strong> ${t('budget_guest_body')} <span style="text-decoration:underline">${t('budget_sign_in_link')}</span>`;

    if (!signedIn) {
      el.addEventListener('click', () => {
        if (typeof window.openProfile === 'function') window.openProfile();
      });
    }

    const firstCard = host.querySelector('.card');
    if (firstCard) host.insertBefore(el, firstCard);
    else host.prepend(el);
  }

  function renderBudgetTips(cfg) {
    const block = document.getElementById('budget-tips-block');
    if (!block) return;
    const tips = cfg?.cost_tips || [];
    if (!cfg?.budget_mode && !tips.length) {
      block.style.display = 'none';
      return;
    }
    block.style.display = 'block';
    const list = tips.length
      ? tips
      : [
          t('budget_tip_guest'),
          t('budget_tip_data_saver'),
          t('budget_tip_offline'),
          t('budget_tip_push'),
        ];
    block.innerHTML = `
      <div class="sheet-title" style="font-size:15px;margin-bottom:6px">💰 ${t('budget_tips_title')}</div>
      <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">${t('budget_tips_sub')}</p>
      <ul style="font-size:11px;color:var(--text2);line-height:1.55;padding-left:18px;margin:0;display:grid;gap:6px">
        ${list.map((tip) => `<li>${window.escapeHtml ? window.escapeHtml(tip) : tip}</li>`).join('')}
      </ul>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn-outline btn-sm" id="btn-share-app-free">${t('budget_share_app')}</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="go('trust')">${t('budget_offline_packs')}</button>
      </div>`;

    document.getElementById('btn-share-app-free')?.addEventListener('click', () => {
      if (typeof window.shareApp === 'function') window.shareApp();
    });
  }

  function applyPublicConfig(cfg) {
    window.SAFEALERT_PUBLIC_CONFIG = cfg || {};
    window.SAFEALERT_BUDGET_MODE = !!cfg?.budget_mode;
    if (cfg?.data_saver_recommended && window.SafeAlertDataSaver) {
      window.SafeAlertDataSaver.applyBudgetMode?.(!!cfg.budget_mode);
    }
    renderGuestBanner(cfg);
    renderBudgetTips(cfg);
    if (typeof window.updateSignInBanner === 'function') window.updateSignInBanner();
    if (window.SafeAlertDownload?.applyConfig) window.SafeAlertDownload.applyConfig(cfg);
  }

  async function loadPublicConfig() {
    try {
      const base =
        (window.SAFEALERT_API ? String(window.SAFEALERT_API).replace(/\/$/, '') : null) ||
        (window.location.origin && window.location.origin !== 'null'
          ? `${window.location.origin}/v1`
          : 'http://localhost:3000/v1');
      const res = await fetch(`${base}/config/public`, { cache: 'default' });
      if (!res.ok) return applyPublicConfig({ budget_mode: true, data_saver_recommended: true });
      applyPublicConfig(await res.json());
    } catch {
      applyPublicConfig({ budget_mode: true, data_saver_recommended: true });
    }
  }

  window.SafeAlertZeroBudget = { loadPublicConfig, applyPublicConfig, renderGuestBanner };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadPublicConfig());
  } else {
    loadPublicConfig();
  }
})();
