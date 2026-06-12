/**
 * Voice UI — TTS for low-literacy users (Hausa, Pidgin, English via lang).
 */
(function () {
  const LS_KEY = 'safealert_voice_mode';

  function synth() {
    return window.speechSynthesis || null;
  }

  function langVoice() {
    const lang =
      (window.SafeAlertI18n && window.SafeAlertI18n.getLang && window.SafeAlertI18n.getLang()) ||
      localStorage.getItem('safealert_lang') ||
      'en';
    const map = { ha: 'ha-NG', yo: 'yo-NG', ig: 'ig-NG', pcm: 'en-NG', en: 'en-NG' };
    return map[lang] || 'en-NG';
  }

  window.SafeAlertVoice = {
    isEnabled() {
      return localStorage.getItem(LS_KEY) === '1';
    },
    setEnabled(on) {
      localStorage.setItem(LS_KEY, on ? '1' : '0');
      document.documentElement.classList.toggle('voice-mode', !!on);
      if (on) this.speak('Voice mode on. Tap buttons to hear them.');
    },
    speak(text, opts = {}) {
      if (!text || !this.isEnabled()) return;
      const s = synth();
      if (!s) {
        console.warn('[Voice] speechSynthesis not supported');
        return;
      }
      s.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 500));
      u.lang = opts.lang || langVoice();
      u.rate = opts.rate || 0.95;
      s.speak(u);
    },
    speakEl(el) {
      if (!el) return;
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('data-voice') ||
        el.textContent?.trim();
      if (label) this.speak(label);
    },
    bindClicks() {
      document.addEventListener(
        'click',
        (e) => {
          if (!this.isEnabled()) return;
          const t = e.target.closest('[data-voice], button, .nav-item, .alert-row, .t-chip');
          if (t) this.speakEl(t);
        },
        true
      );
    },
    readScreen(screenId) {
      const tips = {
        home: 'Home. Hold panic for emergency. Start journey to share location with your circle.',
        map: 'Map. Red areas are danger alerts. Tap a pin for details.',
        insights: 'Safety insights. Summary of alerts across Nigeria and near you.',
        routes: 'Route safety. Scores from travellers who finished journeys.',
        circle: 'People you trust. Your close contacts and community groups.',
        report: 'Report incident. Choose type and location. You stay anonymous.',
        trust: 'Community tools. Leaders, agents, schools, offline maps, and support tips.',
      };
      if (tips[screenId]) this.speak(tips[screenId]);
    },
  };

  function init() {
    if (window.SafeAlertVoice.isEnabled()) {
      document.documentElement.classList.add('voice-mode');
    }
    window.SafeAlertVoice.bindClicks();
    const origGo = window.go;
    if (origGo && !origGo._voicePatched) {
      window.go = function (id, ...args) {
        const r = origGo(id, ...args);
        setTimeout(() => window.SafeAlertVoice.readScreen(id), 600);
        return r;
      };
      window.go._voicePatched = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
