// tests/geo.test.js
// State bounding-box spot checks across Nigeria's geopolitical zones

const { guessState } = require('../src/utils/geo');
const states = require('../src/config/nigeriaStates.json');

describe('nigeriaStates.json', () => {
  test('contains all 37 regions (36 states + FCT)', () => {
    expect(states).toHaveLength(37);
    const names = states.map((s) => s.name);
    expect(names).toContain('FCT');
    expect(names).not.toContain('Abuja FCT');
    expect(new Set(names).size).toBe(37);
  });

  test('every entry has required bounding-box fields', () => {
    states.forEach((s) => {
      expect(s).toMatchObject({
        name: expect.any(String),
        minLat: expect.any(Number),
        maxLat: expect.any(Number),
        minLng: expect.any(Number),
        maxLng: expect.any(Number),
      });
      expect(s.minLat).toBeLessThan(s.maxLat);
      expect(s.minLng).toBeLessThan(s.maxLng);
    });
  });
});

describe('guessState', () => {
  // South-West — Lagos
  test('Lagos coordinates → Lagos', () => {
    expect(guessState(6.5244, 3.3792)).toBe('Lagos');
  });

  // North-West — Kano
  test('Kano coordinates → Kano', () => {
    expect(guessState(12.0022, 8.592)).toBe('Kano');
  });

  // South-East — Enugu
  test('Enugu coordinates → Enugu', () => {
    expect(guessState(6.4584, 7.5464)).toBe('Enugu');
  });

  // South-South — Rivers (Port Harcourt)
  test('Rivers coordinates → Rivers', () => {
    expect(guessState(4.8156, 7.0498)).toBe('Rivers');
  });

  // North-East — Borno (Maiduguri)
  test('Borno coordinates → Borno', () => {
    expect(guessState(11.8311, 13.151)).toBe('Borno');
  });

  // North-Central — FCT (Abuja)
  test('Abuja coordinates → FCT', () => {
    expect(guessState(9.0765, 7.3986)).toBe('FCT');
  });

  test('coordinates outside Nigeria → Nigeria', () => {
    expect(guessState(51.5, -0.1)).toBe('Nigeria');
  });
});
