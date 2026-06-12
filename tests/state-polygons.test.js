const statePolygons = require('../src/utils/statePolygons');
const { guessState } = require('../src/utils/geo');
const states = require('../src/config/nigeriaStates.json');
const polygonData = require('../src/config/nigeriaStatePolygons.json');

describe('nigeriaStatePolygons.json', () => {
  test('contains polygons for all 37 regions', () => {
    expect(Object.keys(polygonData.states)).toHaveLength(37);
    expect(polygonData.states.FCT).toBeDefined();
    expect(polygonData.states.Lagos).toBeDefined();
  });

  test('each state has at least one ring with lng/lat pairs', () => {
    for (const [name, rings] of Object.entries(polygonData.states)) {
      expect(Array.isArray(rings)).toBe(true);
      expect(rings.length).toBeGreaterThan(0);
      const pt = rings[0][0];
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe('number');
      expect(typeof pt[1]).toBe('number');
      expect(states.some((s) => s.name === name)).toBe(true);
    }
  });
});

describe('statePolygons.resolveState', () => {
  test('Lagos island coordinates resolve to Lagos not Ogun', () => {
    expect(statePolygons.resolveState(6.5244, 3.3792)).toBe('Lagos');
  });

  test('Abuja coordinates resolve to FCT', () => {
    expect(statePolygons.resolveState(9.0765, 7.3986)).toBe('FCT');
  });

  test('guessState uses polygon resolver', () => {
    expect(guessState(12.0022, 8.592)).toBe('Kano');
    expect(guessState(4.8156, 7.0498)).toBe('Rivers');
  });
});
