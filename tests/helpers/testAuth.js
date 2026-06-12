const request = require('supertest');

const DEFAULT_OTP = '123456';

/** Sign in via OTP (requires DEV_FIXED_OTP in test env). */
async function loginWithPhone(app, base, phone = '08012345678', otp = DEFAULT_OTP) {
  const otpRes = await request(app).post(`${base}/auth/request-otp`).send({ phone });
  if (otpRes.status !== 200) {
    throw new Error(`request-otp failed: ${otpRes.status} ${JSON.stringify(otpRes.body)}`);
  }
  const verifyRes = await request(app)
    .post(`${base}/auth/verify-otp`)
    .send({
      phone,
      otp,
      otp_token: otpRes.body.otp_token,
    });
  if (verifyRes.status !== 200 || !verifyRes.body.token) {
    throw new Error(`verify-otp failed: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
  }
  return {
    token: verifyRes.body.token,
    user: verifyRes.body.user,
    authHeader: { Authorization: `Bearer ${verifyRes.body.token}` },
  };
}

module.exports = { loginWithPhone, DEFAULT_OTP };
