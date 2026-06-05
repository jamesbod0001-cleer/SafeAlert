/**
 * Icon-only mode — no reading required for core navigation.
 */
(function () {
  const LS_KEY = 'safealert_icon_only';

  window.SafeAlertIconMode = {
    isEnabled() {
      return localStorage.getItem(LS_KEY) === '1';
    },
    setEnabled(on) {
      localStorage.setItem(LS_KEY, on ? '1' : '0');
      document.documentElement.classList.toggle('icon-only-mode', !!on);
      if (on && typeof toast === 'function') {
        toast('Icon-only: tab labels hidden — buttons keep icons', 'ok');
      }
    },
    apply() {
      document.documentElement.classList.toggle('icon-only-mode', this.isEnabled());
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SafeAlertIconMode.apply());
  } else {
    window.SafeAlertIconMode.apply();
  }
})();
