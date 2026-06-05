/**
 * SafeAlert NG — FCM registration (production)
 * Requires /v1/config/public.firebase and Notification permission.
 */
(function () {
  const API = `${window.location.origin}/v1`;

  async function registerFcmIfReady(getToken) {
    if (!getToken || !('Notification' in window)) return;

    try {
      const cfgRes = await fetch(`${API}/config/public`);
      const cfg = await cfgRes.json();
      if (!cfg.firebase?.vapidKey) return;

      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return;
      }
      if (Notification.permission !== 'granted') return;

      const token = await getToken();
      if (!token) return;

      const authToken = localStorage.getItem('safealert_token');
      if (!authToken) return;

      await fetch(`${API}/user/fcm-token`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
    } catch (e) {
      console.warn('[FCM] registration skipped:', e.message);
    }
  }

  window.SafeAlertFCM = { registerFcmIfReady };
})();
