import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/safealert_api.dart';
import '../../core/storage/local_storage.dart';
import '../../data/models/models.dart';

/// Central app state — mirrors web `app.js` session + data refresh loops.
class AppController extends ChangeNotifier {
  AppController({SafeAlertApi? api, LocalStorage? storage})
      : _api = api ?? SafeAlertApi(),
        _storage = storage ?? LocalStorage();

  final SafeAlertApi _api;
  final LocalStorage _storage;
  Timer? _refreshTimer;
  Timer? _panicTimer;

  // Session
  bool loading = true;
  String? token;
  String? phone;
  String? deviceId;
  String lang = 'en';
  bool onboardingDone = false;
  String? error;
  String? toast;
  String? deepLinkedZoneId;
  String? deepLinkedPanicId;
  String? deepLinkedEstateId;

  // Config
  Map<String, dynamic> publicConfig = {};
  Map<String, dynamic> settings = {};
  Map<String, dynamic> preferences = {};
  String ussd = '*384*911#';

  // Location
  Position? position;
  bool locationDenied = false;

  // Safety data
  AppStats stats = AppStats();
  List<SafetyZone> zones = [];
  List<PanicAlert> nearbyPanics = [];
  PanicAlert? activePanic;
  List<PanicResponder> panicResponders = [];
  DateTime? panicStartedAt;
  bool journeyActive = false;
  CheckInSession? activeCheckIn;

  // Community
  List<CircleMember> circle = [];
  List<GroupItem> groups = [];
  List<EstateItem> estates = [];
  List<ResourceItem> resources = [];
  List<ResourceItem> nearbyResources = [];

  // Insights / routes / trust
  Map<String, dynamic> insightsSummary = {};
  List<RouteInfo> routes = [];
  List<LeaderItem> leaders = [];
  List<AgentItem> agents = [];
  List<dynamic> offlinePacks = [];
  List<dynamic> tips = [];
  Map<String, dynamic> transparency = {};
  List<dynamic> reputationBoard = [];

  bool get isSignedIn => token != null && token!.isNotEmpty;
  bool get panicActive => activePanic != null;

  SafeAlertApi get api => _api;

  Future<void> bootstrap() async {
    loading = true;
    notifyListeners();
    try {
      token = await _storage.getToken();
      phone = await _storage.getPhone();
      deviceId = await _storage.getDeviceId() ?? _genDeviceId();
      await _storage.setDeviceId(deviceId!);
      lang = await _storage.getLang();
      onboardingDone = await _storage.onboardingDone();
      _api.token = token;
      _api.deviceId = deviceId;

      await _loadPublicConfig();
      await refreshAll(silent: true);
      _startRefreshLoop();
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  String _genDeviceId() {
    final r = Random();
    return 'flutter-${DateTime.now().millisecondsSinceEpoch}-${r.nextInt(999999)}';
  }

  void _startRefreshLoop() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 45), (_) => refreshAll(silent: true));
  }

  Future<void> refreshAll({bool silent = false}) async {
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      await _refreshLocation();
      await Future.wait([
        _loadStats(),
        _loadZones(),
        _loadSettings(),
        if (isSignedIn) _loadSignedInData(),
        if (position != null) _loadNearby(),
      ]);
      error = null;
    } catch (e) {
      if (!silent) error = e.toString();
    } finally {
      if (!silent) loading = false;
      notifyListeners();
    }
  }

  Future<void> _refreshLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      locationDenied = true;
      return;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      locationDenied = true;
      return;
    }
    locationDenied = false;
    position = await Geolocator.getCurrentPosition();
    if (isSignedIn && position != null) {
      await _api.updateLocation(
        position!.latitude,
        position!.longitude,
        journeyActive: journeyActive,
        panicActive: panicActive,
      );
    }
  }

  Future<void> _loadPublicConfig() async {
    try {
      publicConfig = await _api.publicConfig();
      ussd = publicConfig['ussd']?.toString() ?? publicConfig['mobile']?['ussd']?.toString() ?? ussd;
    } catch (_) {}
  }

  Future<void> _loadSettings() async {
    try {
      settings = await _api.settings();
    } catch (_) {}
  }

  Future<void> _loadStats() async {
    try {
      final data = await _api.stats();
      stats = AppStats.fromJson(data);
      await _storage.cacheStats(data);
    } catch (_) {
      final cached = await _storage.readStatsCache();
      if (cached != null) stats = AppStats.fromJson(cached);
    }
  }

  Future<void> _loadZones() async {
    try {
      final lat = position?.latitude;
      final lng = position?.longitude;
      final raw = await _api.zones(
        lat: lat,
        lng: lng,
        radiusKm: lat != null ? 50 : null,
        limit: 100,
      );
      zones = raw.map((e) => SafetyZone.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      await _storage.cacheZones(raw);
    } catch (_) {
      final cached = await _storage.readZonesCache();
      if (cached != null) {
        zones = cached.map((e) => SafetyZone.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      }
    }
  }

  Future<void> _loadNearby() async {
    if (position == null) return;
    try {
      final lat = position!.latitude;
      final lng = position!.longitude;
      final panics = await _api.nearbyPanics(lat, lng);
      nearbyPanics = panics.map((e) => PanicAlert.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      final res = await _api.resourcesNearby(lat, lng);
      nearbyResources = res.map((e) => ResourceItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
  }

  Future<void> _loadSignedInData() async {
    try {
      preferences = await _api.preferences();
    } catch (_) {}
    try {
      final raw = await _api.circle();
      circle = raw.map((e) => CircleMember.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    try {
      final panic = await _api.activePanic();
      if (panic['panic'] != null) {
        activePanic = PanicAlert.fromJson(Map<String, dynamic>.from(panic['panic'] as Map));
        panicStartedAt = activePanic!.createdAt ?? DateTime.now();
        _startPanicPolling();
      }
    } catch (_) {}
    try {
      final ci = await _api.activeCheckIn();
      if (ci['check_in'] != null) {
        activeCheckIn = CheckInSession.fromJson(Map<String, dynamic>.from(ci['check_in'] as Map));
      } else {
        activeCheckIn = null;
      }
    } catch (_) {
      activeCheckIn = null;
    }
    try {
      journeyActive = preferences['journey_active'] == true;
    } catch (_) {}
  }

  Future<void> loadCommunityExtras() async {
    try {
      final g = await _api.groups();
      groups = g.map((e) => GroupItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    try {
      final e = await _api.myEstates();
      estates = e.map((x) => EstateItem.fromJson(Map<String, dynamic>.from(x as Map))).toList();
    } catch (_) {}
    try {
      final r = await _api.resources();
      resources = r.map((e) => ResourceItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> loadInsights() async {
    try {
      insightsSummary = await _api.insightsSummary(lang: lang, hasGps: position != null);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> loadRoutes() async {
    try {
      final raw = await _api.routes();
      routes = raw.map((e) => RouteInfo.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> loadTrust() async {
    try {
      leaders = (await _api.leaders()).map((e) => LeaderItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    try {
      agents = (await _api.agents()).map((e) => AgentItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {}
    try {
      offlinePacks = await _api.offlinePacks();
    } catch (_) {}
    try {
      tips = await _api.tips(lang: lang);
    } catch (_) {}
    try {
      transparency = await _api.transparency();
    } catch (_) {}
    try {
      reputationBoard = await _api.reputationLeaderboard();
    } catch (_) {}
    notifyListeners();
  }

  // ── Auth ──
  Future<String?> requestOtp(String p) async {
    error = null;
    notifyListeners();
    try {
      final res = await _api.requestOtp(p);
      phone = p;
      await _storage.setPhone(p);
      return res['sandbox_code']?.toString();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return null;
    }
  }

  Future<bool> verifyOtp(String code) async {
    if (phone == null) return false;
    try {
      final res = await _api.verifyOtp(phone!, code);
      token = res['token']?.toString();
      _api.token = token;
      await _storage.setToken(token);
      await refreshAll(silent: true);
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    token = null;
    _api.token = null;
    await _storage.setToken(null);
    circle = [];
    activePanic = null;
    journeyActive = false;
    activeCheckIn = null;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    onboardingDone = true;
    await _storage.setOnboardingDone(true);
    notifyListeners();
  }

  Future<void> setLanguage(String value) async {
    lang = value;
    await _storage.setLang(value);
    notifyListeners();
  }

  void applyDeepLinkParams(Map<String, String> params) {
    final zone = params['zone'];
    final panic = params['panic'];
    final estate = params['estate'];
    var changed = false;
    if (zone != null && zone.isNotEmpty && zone != deepLinkedZoneId) {
      deepLinkedZoneId = zone;
      changed = true;
    }
    if (panic != null && panic.isNotEmpty && panic != deepLinkedPanicId) {
      deepLinkedPanicId = panic;
      changed = true;
    }
    if (estate != null && estate.isNotEmpty && estate != deepLinkedEstateId) {
      deepLinkedEstateId = estate;
      changed = true;
    }
    if (changed) notifyListeners();
  }

  void clearZoneDeepLink() {
    deepLinkedZoneId = null;
    notifyListeners();
  }

  void clearPanicDeepLink() {
    deepLinkedPanicId = null;
    notifyListeners();
  }

  void clearEstateDeepLink() {
    deepLinkedEstateId = null;
    notifyListeners();
  }

  // ── Panic ──
  Future<bool> activatePanic() async {
    if (!isSignedIn) {
      error = 'Sign in to use Citizen SOS';
      notifyListeners();
      return false;
    }
    if (position == null) await _refreshLocation();
    if (position == null) {
      error = 'Location required for SOS';
      notifyListeners();
      return false;
    }
    try {
      final res = await _api.activatePanic(position!.latitude, position!.longitude);
      activePanic = PanicAlert.fromJson(Map<String, dynamic>.from(res['panic'] as Map? ?? res));
      panicStartedAt = DateTime.now();
      _startPanicPolling();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return false;
    }
  }

  void _startPanicPolling() {
    _panicTimer?.cancel();
    _panicTimer = Timer.periodic(const Duration(seconds: 15), (_) => _pollPanic());
  }

  Future<void> _pollPanic() async {
    if (activePanic == null) return;
    try {
      panicResponders = (await _api.panicResponders(activePanic!.id))
          .map((e) => PanicResponder.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> deactivatePanic() async {
    try {
      await _api.deactivatePanic();
    } catch (_) {}
    activePanic = null;
    panicStartedAt = null;
    panicResponders = [];
    _panicTimer?.cancel();
    notifyListeners();
  }

  Future<void> broadcastPanic() async {
    await _api.broadcastPanic();
    showToast('Neighbors alerted');
  }

  Future<void> respondToPanic(String id) async {
    await _api.respondToPanic(id);
    showToast('You are marked en route');
    await refreshAll(silent: true);
  }

  // ── Journey / check-in ──
  Future<void> startJourney() async {
    await _api.startJourney();
    journeyActive = true;
    notifyListeners();
  }

  Future<void> endJourney({String? from, String? to, String? via, int? rating}) async {
    await _api.endJourney(from: from, to: to, via: via, safetyRating: rating);
    journeyActive = false;
    notifyListeners();
  }

  Future<void> scheduleCheckIn(Duration until) async {
    final due = DateTime.now().add(until);
    final res = await _api.createCheckIn(dueAt: due);
    activeCheckIn = CheckInSession.fromJson(Map<String, dynamic>.from(res['check_in'] as Map));
    notifyListeners();
  }

  Future<void> confirmCheckIn() async {
    if (activeCheckIn == null) return;
    await _api.confirmCheckIn(activeCheckIn!.id);
    activeCheckIn = null;
    notifyListeners();
  }

  // ── Zones ──
  Future<void> reportZone(String type, {String? description}) async {
    if (position == null) await _refreshLocation();
    if (position == null) throw ApiException('Location required');
    await _api.createZone(
      lat: position!.latitude,
      lng: position!.longitude,
      type: type,
      description: description,
    );
    await _loadZones();
    notifyListeners();
  }

  Future<void> confirmZone(String id) async {
    await _api.confirmZone(id);
    await _loadZones();
    notifyListeners();
  }

  Future<void> clearZone(String id) async {
    await _api.clearZone(id);
    await _loadZones();
    notifyListeners();
  }

  Future<void> reportFalseZone(String id) async {
    await _api.reportFalseZone(id);
    await _loadZones();
    notifyListeners();
  }

  // ── Circle / community ──
  Future<void> saveCircle(List<CircleMember> members) async {
    await _api.updateCircle(members.map((m) => m.toJson()).toList());
    circle = members;
    notifyListeners();
  }

  Future<void> joinGroup(String id) async {
    await _api.joinGroup(id);
    await loadCommunityExtras();
  }

  Future<void> joinEstate(String code) async {
    await _api.joinEstate(code);
    await loadCommunityExtras();
  }

  Future<void> registerEstate(String name, String state) async {
    await _api.registerEstate({'name': name, 'state': state});
    await loadCommunityExtras();
  }

  void showToast(String msg) {
    toast = msg;
    notifyListeners();
    Future.delayed(const Duration(seconds: 3), () {
      if (toast == msg) {
        toast = null;
        notifyListeners();
      }
    });
  }

  Duration get panicElapsed {
    if (panicStartedAt == null) return Duration.zero;
    return DateTime.now().difference(panicStartedAt!);
  }

  String get panicTimerText {
    final d = panicElapsed;
    return '${d.inMinutes.remainder(60).toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
  }

  List<SafetyZone> get activeZones => zones.where((z) => z.active).toList();

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _panicTimer?.cancel();
    super.dispose();
  }
}
