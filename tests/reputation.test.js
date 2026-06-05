// tests/reputation.test.js — reputation growth features

process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';
process.env.SEED_REVIEW_DATA = 'true';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-len!!';
process.env.PORT = '3001';

const { db } = require('../src/config/db');
const { POINTS, awardFirstStateReport } = require('../src/services/reputationService');

beforeAll(async () => {
  await db().collection('users').doc('rep-test-user-1').set({
    display_name: 'Test Reporter',
    reporter_score: 0,
    reports_submitted: 0,
    reports_confirmed: 0,
    reputation_badges: [],
  });
});

describe('Reputation', () => {
  test('first_state_report point action exists in POINTS', () => {
    expect(POINTS.first_state_report).toBe(15);
    expect(POINTS.journey_rated).toBe(1);
  });

  test('awardFirstStateReport awards once per state', async () => {
    const userId = 'rep-test-user-1';
    const first = await awardFirstStateReport(userId, 'Zamfara');
    expect(first.skipped).toBeFalsy();
    expect(first.delta).toBe(15);

    const second = await awardFirstStateReport(userId, 'Zamfara');
    expect(second.skipped).toBe(true);
    expect(second.already).toBe(true);

    const other = await awardFirstStateReport(userId, 'Sokoto');
    expect(other.skipped).toBeFalsy();
    expect(other.delta).toBe(15);
  });
});
