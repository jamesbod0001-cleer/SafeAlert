/**
 * Loads Firebase SDK from CDN when config is present, then registers FCM token.
 */
async function initFcmWebPush() {
  if (!window.SafeAlertFCM) return;

  try {
    const res = await fetch(`${window.location.origin}/v1/config/public`);
    const cfg = await res.json();
    if (!cfg.firebase?.apiKey || !cfg.firebase?.vapidKey) return;

    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
    );
    const { getMessaging, getToken, isSupported, onMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'
    );

    if (!(await isSupported())) return;

    const app = initializeApp({
      apiKey: cfg.firebase.apiKey,
      authDomain: cfg.firebase.authDomain,
      projectId: cfg.firebase.projectId,
      messagingSenderId: cfg.firebase.messagingSenderId,
      appId: cfg.firebase.appId,
    });

    const messaging = getMessaging(app);

    onMessage(messaging, (payload) => {
      const type = payload.data?.type || '';
      const title = payload.notification?.title || 'SafeAlert NG';
      const body = payload.notification?.body || '';
      const label = body || title;
      if (typeof window.toast === 'function') {
        const kind =
          type === 'PANIC_RESPONDER' || type === 'NEARBY_PANIC' || type === 'CIRCLE_PANIC'
            ? 'ok'
            : 'err';
        window.toast(label, kind);
      }
      if (type === 'NEARBY_PANIC' || type === 'CIRCLE_PANIC') {
        window.dispatchEvent(new CustomEvent('safealert:panic-nearby'));
        if (typeof go === 'function') go('home');
      }
      if (type === 'PANIC_RESPONDER' && payload.data?.panic_id) {
        if (typeof go === 'function') go('home');
        window.dispatchEvent(new CustomEvent('safealert:panic-nearby'));
      }
    });

    let swReg = null;
    if ('serviceWorker' in navigator) {
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        await navigator.serviceWorker.ready;
      } catch (e) {
        console.warn('[FCM init] service worker:', e.message);
      }
    }

    await window.SafeAlertFCM.registerFcmIfReady(async () => {
      if (!swReg) return null;
      return getToken(messaging, {
        vapidKey: cfg.firebase.vapidKey,
        serviceWorkerRegistration: swReg,
      });
    });
  } catch (e) {
    console.warn('[FCM init]', e.message);
  }
}

initFcmWebPush();
window.addEventListener('safealert:signed-in', () => {
  initFcmWebPush();
});
