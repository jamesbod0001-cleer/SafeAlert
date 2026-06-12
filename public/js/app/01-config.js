/** SafeAlert app module — API base, constants, session state, module globals */
/* eslint-disable */
/**
 * SafeAlert NG — app logic (wired to /v1 API)
 * UI design is in index.html
 * API base comes from SAFEALERT_API (or same-origin /v1 fallback)
 */
function resolveApiBase() {
  const { hostname, origin } = window.location;
  const isLocalWeb =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // Browser on localhost → always use local API.
  if (isLocalWeb && origin && origin !== 'null') {
    return `${origin}/v1`;
  }

  if (window.SAFEALERT_API) {
    const u = String(window.SAFEALERT_API).replace(/\/$/, '');
    const isLocalConfig = /localhost|127\.0\.0\.1/.test(u);
    if (!isLocalConfig || isLocalWeb) {
      return u.endsWith('/v1') ? u : `${u}/v1`;
    }
  }

  return origin && origin !== 'null' ? `${origin}/v1` : 'http://localhost:3000/v1';
}

const API = resolveApiBase();

const TYPE_ICONS = {
  kidnapping: '👤',
  armed_robbery: '🔫',
  banditry: '⚠️',
  terror: '💥',
  roadblock: '🚧',
  suspicious: '👁️',
  medical_emergency: '🏥',
  road_accident: '🚗',
  vehicle_breakdown: '🔧',
};

const UI_EMOJI = {
  home: '🏠',
  map: '🗺',
  insights: '📊',
  routes: '🛣',
  circle: '👥',
  report: '📍',
  profile: '👤',
  refresh: '🔄',
  share: '📤',
  alert: '⚠️',
  panic: '🆘',
  play: '▶',
  check: '✓',
  help: '🆘',
  submit: '🚨',
  back: '←',
  truck: '🚛',
  shop: '🛒',
  globe: '🌍',
  community: '👥',
  hotspot: '🔴',
  safe: '✅',
  locate: '📡',
};

function ico(name) {
  if (!name) return '⚠️';
  if (UI_EMOJI[name]) return UI_EMOJI[name];
  if (name.length <= 4 && /\p{Extended_Pictographic}/u.test(name)) return name;
  return TYPE_ICONS[name] || '⚠️';
}

const SEV_C = { critical: '#F03E3E', high: '#F79009', medium: '#FFB300', low: '#12B76A' };
const SEV_R = { critical: 22, high: 17, medium: 13, low: 9 };

const state = {
  token: localStorage.getItem('safealert_token'),
  otpToken: localStorage.getItem('safealert_otp_token'),
  sandboxMode: false,
  deviceId: localStorage.getItem('safealert_device') || `web-${crypto.randomUUID().slice(0, 12)}`,
  preferences: {
    help_nearby_enabled: false,
    help_nearby_radius_km: 5,
    notifications_enabled: true,
    estate_watch_enabled: true,
    data_saver: true,
  },
};

localStorage.setItem('safealert_device', state.deviceId);

function setOtpToken(token) {
  state.otpToken = token || null;
  if (state.otpToken) localStorage.setItem('safealert_otp_token', state.otpToken);
  else localStorage.removeItem('safealert_otp_token');
}

let map = null;
let mapReady = false;
const markers = {};
let userMk = null;
let uLat = null;
let uLng = null;
let curFilt = 'all';
let pinMode = false;
let selectedType = null;
let panicOn = false;
let panicSecs = 0;
let panicTmr = null;
let journeyOn = false;
let jSecs = 0;
let jTmr = null;
let journeyRating = 0;
let journeyFrom = '';
let journeyTo = '';
let liveN = 0;
let zones = [];
let allZones = [];
let routes = [];
let circle = [];
let groups = [];
let types = [];
let holdTmr = null;
let holdProg = 0;
let toastTmr = null;
let sheetOpenedAt = 0;
window.sheetOpenedAt = 0;
let zoneSearchQ = '';
let refreshing = false;
let refreshIv = null;
let nearbyPanicIv = null;
let locationPingIv = null;
let gpsWatchId = null;
let routesLoaded = false;
let insightsLoaded = false;
let insightsDrill = { level: 'root', state: '', lga: '' };
let gpsZonesReloadTimer = null;
let groupsLoaded = false;
let settingsLoaded = false;
let currentScreen = 'home';
