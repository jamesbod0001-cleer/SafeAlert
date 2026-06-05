/**
 * SafeAlert NG — iPhone, Android & PWA install helpers
 */
(function () {
  const cfg = {
    ios: null,
    android: null,
    apk: null,
    downloadPage: '/app/download.html',
    iosAppId: null,
  };

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }

  function isNativeShell() {
    const protocol = window.location.protocol;
    return protocol === 'capacitor:' || protocol === 'ionic:';
  }

  function isInstalledPwa() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function shouldPromoteDownload() {
    return !isNativeShell() && !isInstalledPwa();
  }

  function applyConfig(publicCfg) {
    const m = publicCfg?.mobile || {};
    cfg.ios = m.ios_app_store_url || null;
    cfg.android = m.android_play_store_url || null;
    cfg.apk = m.android_apk_url || null;
    cfg.downloadPage = m.download_page || cfg.downloadPage;
    cfg.iosAppId = m.ios_app_id || null;
    setSmartBanner();
    renderHomeBanner();
    renderProfileBlock();
  }

  function setSmartBanner() {
    if (!cfg.iosAppId || !shouldPromoteDownload() || detectPlatform() !== 'ios') return;
    let meta = document.querySelector('meta[name="apple-itunes-app"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'apple-itunes-app';
      document.head.appendChild(meta);
    }
    meta.content = `app-id=${cfg.iosAppId}, app-argument=${location.origin}/app/`;
  }

  function storeButtonsHtml(compact) {
    const iosHref = cfg.ios || cfg.downloadPage;
    const androidHref = cfg.android || cfg.apk || cfg.downloadPage;
    const gap = compact ? '8px' : '10px';
    const pad = compact ? '10px 14px' : '12px 16px';
    const fs = compact ? '12px' : '13px';
    return `
      <div class="store-btns" style="display:flex;flex-wrap:wrap;gap:${gap}">
        <a href="${iosHref}" class="store-btn store-btn-ios" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:8px;padding:${pad};background:#fff;color:#000;border-radius:10px;font-weight:800;font-size:${fs};text-decoration:none">
          <span aria-hidden="true"></span> iPhone / App Store
        </a>
        <a href="${androidHref}" class="store-btn store-btn-android" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:8px;padding:${pad};background:#12B76A;color:#041208;border-radius:10px;font-weight:800;font-size:${fs};text-decoration:none">
          <span aria-hidden="true">▶</span> Android / Google Play
        </a>
      </div>`;
  }

  function renderHomeBanner() {
    if (!shouldPromoteDownload()) return;
    const home = document.getElementById('screen-home');
    if (!home || document.getElementById('app-download-banner')) return;

    const platform = detectPlatform();
    const hint =
      platform === 'ios'
        ? 'Add to Home Screen for full-screen alerts, or get the iPhone app.'
        : platform === 'android'
          ? 'Install the Android app for push alerts & GPS, or add to Home Screen.'
          : 'Available on iPhone and Android — free.';

    const el = document.createElement('div');
    el.id = 'app-download-banner';
    el.className = 'card card-sm';
    el.style.marginBottom = '12px';
    el.style.borderColor = 'var(--green-border)';
    el.style.background = 'var(--green-soft)';
    el.innerHTML = `
      <div style="font-size:14px;font-weight:800;margin-bottom:6px">📱 iPhone &amp; Android</div>
      <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">${hint}</p>
      ${storeButtonsHtml(true)}
      <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px;width:100%" id="btn-open-download-page">Install help</button>`;

    home.prepend(el);
    el.querySelector('#btn-open-download-page')?.addEventListener('click', () => {
      window.location.href = cfg.downloadPage;
    });
  }

  function renderProfileBlock() {
    if (!shouldPromoteDownload()) return;
    const prefs = document.getElementById('ux-prefs-block');
    if (!prefs || document.getElementById('app-download-profile')) return;

    const block = document.createElement('div');
    block.id = 'app-download-profile';
    block.style.cssText = 'margin-bottom:14px;padding:12px;background:var(--surface2);border:1px solid var(--green-border);border-radius:var(--r-sm)';
    block.innerHTML = `
      <div class="sheet-title" style="font-size:15px;margin-bottom:6px">Get the app</div>
      <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">Native apps on iPhone &amp; Android — push alerts, GPS, works offline.</p>
      ${storeButtonsHtml(true)}`;
    prefs.insertBefore(block, prefs.firstChild);
  }

  function shareDownloadLink() {
    const url = cfg.downloadPage.startsWith('http')
      ? cfg.downloadPage
      : `${window.location.origin}${cfg.downloadPage.replace(/^\//, '/')}`;
    const text = `SafeAlert NG — free safety app for iPhone & Android. Your people, not government: ${url}`;
    if (navigator.share) {
      navigator.share({ title: 'SafeAlert NG', text, url }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  window.SafeAlertDownload = {
    detectPlatform,
    isNativeShell,
    isInstalledPwa,
    shouldPromoteDownload,
    applyConfig,
    storeButtonsHtml,
    shareDownloadLink,
    getConfig: () => ({ ...cfg }),
  };
})();
