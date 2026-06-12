/** SafeAlert app module — ensureAuth + settings bootstrap */
/* eslint-disable */
function signInRequiredToast() {
  const msg = state.sandboxMode
    ? 'Sign in: tap profile (top right) → enter phone → Send OTP → Sign in'
    : 'Sign in required — tap profile in the header';
  toast(msg, 'err');
  openProfile();
}

async function ensureAuth() {
  if (state.token) return true;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try {
      const reqOtp = await api('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: '08012345678' }),
      });
      setOtpToken(reqOtp.otp_token);
      const d = await api('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '08012345678',
          otp: '123456',
          ...(state.otpToken ? { otp_token: state.otpToken } : {}),
        }),
      });
      state.token = d.token;
      localStorage.setItem('safealert_token', d.token);
      setOtpToken(null);
      return true;
    } catch {
      signInRequiredToast();
      return false;
    }
  }
  if (state.sandboxMode) {
    const phone = document.getElementById('p-phone')?.value?.trim() || localStorage.getItem('safealert_phone');
    const otp = document.getElementById('p-otp')?.value?.trim().replace(/\D/g, '');
    if (phone && otp?.length === 6) {
      try {
        const d = await api('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ phone, otp, ...(state.otpToken ? { otp_token: state.otpToken } : {}) }),
        });
        state.token = d.token;
        localStorage.setItem('safealert_token', d.token);
        localStorage.setItem('safealert_phone', phone);
        setOtpToken(null);
        updateProfileUI();
        await loadPreferences();
        await loadData();
        buildCircle();
        toast('Signed in', 'ok');
        return true;
      } catch {
        /* fall through to profile */
      }
    }
  }
  signInRequiredToast();
  return false;
}
