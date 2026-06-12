const { normalizePanicReason, PANIC_REASONS } = require('../src/constants/panicReasons');

describe('panicReasons', () => {
  test('normalizes aliases', () => {
    expect(normalizePanicReason('crash')).toBe('road_accident');
    expect(normalizePanicReason('accident')).toBe('road_accident');
    expect(normalizePanicReason('MEDICAL')).toBe('medical');
  });

  test('falls back to security for unknown', () => {
    expect(normalizePanicReason('kidnapping')).toBe('security');
    expect(normalizePanicReason('')).toBe('security');
  });

  test('accepts valid reasons', () => {
    PANIC_REASONS.forEach((r) => expect(normalizePanicReason(r)).toBe(r));
  });
});
