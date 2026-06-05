/**
 * SafeAlert NG — low mobile data mode (Nigeria-friendly defaults)
 */
(function () {
  const LS_KEY = 'safealert_data_saver';

  function fromStorage() {
    const v = localStorage.getItem(LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
    return null;
  }

  window.SafeAlertDataSaver = {
    isEnabled() {
      const stored = fromStorage();
      if (stored !== null) return stored;
      const pref = window.state?.preferences?.data_saver;
      if (pref === false) return false;
      if (pref === true) return true;
      return true;
    },

    setEnabled(on) {
      localStorage.setItem(LS_KEY, on ? '1' : '0');
      document.documentElement.classList.toggle('data-saver', !!on);
      if (window.state?.preferences) window.state.preferences.data_saver = !!on;
    },

    applyDom() {
      document.documentElement.classList.toggle('data-saver', this.isEnabled());
    },

    applyBudgetMode(on) {
      document.documentElement.classList.toggle('budget-mode', !!on);
      if (on && fromStorage() === null) {
        this.setEnabled(true);
      }
    },

    refreshIntervalMs() {
      if (document.documentElement.classList.contains('budget-mode')) {
        return this.isEnabled() ? 8 * 60 * 1000 : 3 * 60 * 1000;
      }
      return this.isEnabled() ? 5 * 60 * 1000 : 90 * 1000;
    },

    nearbyPanicPollMs() {
      if (this.isEnabled() && this.pushLikelyWorks()) return 0;
      if (document.documentElement.classList.contains('budget-mode')) {
        return this.isEnabled() ? 0 : 180000;
      }
      return this.isEnabled() ? 120000 : 45000;
    },

    helpNearbyPingMs() {
      if (document.documentElement.classList.contains('budget-mode')) {
        return this.isEnabled() ? 45 * 60 * 1000 : 30 * 60 * 1000;
      }
      return this.isEnabled() ? 30 * 60 * 1000 : 15 * 60 * 1000;
    },

    journeyLocationPingMs() {
      if (document.documentElement.classList.contains('budget-mode')) {
        return this.isEnabled() ? 180000 : 120000;
      }
      return this.isEnabled() ? 120000 : 60000;
    },

    pushLikelyWorks() {
      return (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        !!window.state?.token
      );
    },

    zonesQuery(purpose) {
      const mapLimit = this.isEnabled() ? 100 : 200;
      const nearLimit = this.isEnabled() ? 50 : 80;
      const fullLimit = 200;
      if (purpose === 'full') return `?limit=${fullLimit}`;
      if (purpose === 'map') {
        if (typeof uLat !== 'undefined' && uLat != null && typeof uLng !== 'undefined' && uLng != null) {
          const radius = this.isEnabled() ? 150 : 250;
          return `?lat=${uLat}&lng=${uLng}&radius=${radius}&limit=${mapLimit}`;
        }
        return `?limit=${mapLimit}`;
      }
      const limit = this.isEnabled() ? 35 : 80;
      if (typeof uLat !== 'undefined' && uLat != null && typeof uLng !== 'undefined' && uLng != null) {
        const radius = this.isEnabled() ? 80 : 150;
        return `?lat=${uLat}&lng=${uLng}&radius=${radius}&limit=${limit}`;
      }
      return `?limit=${nearLimit}`;
    },

    mapOptions() {
      return {
        maxZoom: this.isEnabled() ? 14 : 18,
        updateWhenIdle: true,
        keepBuffer: this.isEnabled() ? 1 : 2,
      };
    },

    shouldLoadGoogleFonts() {
      return !this.isEnabled();
    },

    async registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      try {
        await navigator.serviceWorker.register('/safealert-sw.js', { scope: '/' });
      } catch (e) {
        console.warn('[data-saver] SW:', e.message);
      }
    },
  };

  window.SafeAlertDataSaver.applyDom();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.SafeAlertDataSaver.applyDom();
      window.SafeAlertDataSaver.registerServiceWorker();
    });
  } else {
    window.SafeAlertDataSaver.registerServiceWorker();
  }
})();
