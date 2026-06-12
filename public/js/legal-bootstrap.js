/** Legal pages: i18n, theme, contact emails from /v1/config/public */
(function () {
  const LANGS = [
    { code: 'en', label: 'EN' },
    { code: 'ha', label: 'HA' },
    { code: 'yo', label: 'YO' },
    { code: 'ig', label: 'IG' },
    { code: 'pcm', label: 'PCM' },
  ];

  function packs() {
    return window.SafeAlertLegalI18n || { en: {} };
  }

  function getLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && packs()[q]) return q;
    const stored = localStorage.getItem('safealert_lang');
    if (stored && packs()[stored]) return stored;
    return 'en';
  }

  function setLang(code) {
    localStorage.setItem('safealert_lang', code);
    const url = new URL(location.href);
    url.searchParams.set('lang', code);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    applyAll();
  }

  function t(key) {
    const lang = getLang();
    const p = packs();
    return p[lang]?.[key] ?? p.en?.[key] ?? key;
  }

  function getTheme() {
    const stored = localStorage.getItem('safealert_legal_theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(theme) {
    localStorage.setItem('safealert_legal_theme', theme);
    document.documentElement.classList.toggle('legal-light', theme === 'light');
    const btn = document.getElementById('legal-theme-btn');
    if (btn) {
      btn.textContent = theme === 'light' ? '🌙' : '☀️';
      btn.setAttribute('aria-label', t(theme === 'light' ? 'theme.dark' : 'theme.light'));
    }
  }

  function toggleTheme() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    const titleKey = document.body.dataset.legalTitle;
    if (titleKey) document.title = t(titleKey);

    document.documentElement.lang = getLang() === 'pcm' ? 'en-NG' : getLang();

    document.querySelectorAll('.legal-lang button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === getLang());
    });
  }

  function injectToolbar() {
    const top = document.querySelector('.legal-top');
    if (!top || document.getElementById('legal-toolbar')) return;

    const left = document.createElement('div');
    left.className = 'legal-top-left';
    while (top.firstChild) left.appendChild(top.firstChild);

    const toolbar = document.createElement('div');
    toolbar.className = 'legal-toolbar';
    toolbar.id = 'legal-toolbar';

    const langGroup = document.createElement('div');
    langGroup.className = 'legal-lang';
    langGroup.setAttribute('role', 'group');
    langGroup.setAttribute('aria-label', 'Language');
    LANGS.forEach(({ code, label }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = code;
      b.textContent = label;
      b.addEventListener('click', () => setLang(code));
      langGroup.appendChild(b);
    });

    const themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'legal-theme-btn';
    themeBtn.id = 'legal-theme-btn';
    themeBtn.addEventListener('click', toggleTheme);

    toolbar.append(langGroup, themeBtn);
    top.append(left, toolbar);
  }

  async function hydrateEmails() {
    try {
      const res = await fetch(`${location.origin}/v1/config/public`, { cache: 'default' });
      if (!res.ok) return;
      const cfg = await res.json();
      const legal = cfg.legal || {};
      const support = legal.support_email || 'support@safealert.ng';
      const privacy = legal.privacy_email || 'privacy@safealert.ng';
      const updated = legal.last_updated || 'June 2026';

      document.querySelectorAll('[data-legal-support]').forEach((el) => {
        el.textContent = support;
        if (el.tagName === 'A') el.href = `mailto:${support}`;
      });
      document.querySelectorAll('[data-legal-privacy]').forEach((el) => {
        el.textContent = privacy;
        if (el.tagName === 'A') el.href = `mailto:${privacy}`;
      });
      document.querySelectorAll('[data-legal-updated]').forEach((el) => {
        el.textContent = updated;
      });
    } catch {
      /* static fallbacks */
    }
  }

  function applyAll() {
    applyI18n();
    setTheme(getTheme());
    hydrateEmails();
    if (typeof window.__legalTransRerender === 'function') window.__legalTransRerender();
  }

  window.SafeAlertLegal = { t, getLang, setLang, getTheme, setTheme };

  function boot() {
    injectToolbar();
    applyAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
