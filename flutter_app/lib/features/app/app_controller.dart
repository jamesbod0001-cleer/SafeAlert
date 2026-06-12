import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/accessibility/voice_service.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/safealert_api.dart';
import '../../core/notifications/push_service.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/storage/local_storage.dart';
import '../../core/storage/offline_pack_storage.dart';
import '../../core/utils/friendly_errors.dart';
import '../../data/models/models.dart';

/// Central app state — mirrors web `app.js` session + data refresh loops.
class AppController extends ChangeNotifier {
  AppController({SafeAlertApi? api, LocalStorage? storage, OfflinePackStorage? offlinePacks})
      : _api = api ?? SafeAlertApi(),
        _storage = storage ?? LocalStorage() {
    _offlinePacks = offlinePacks ?? OfflinePackStorage(_api);
  }

  final SafeAlertApi _api;
  final LocalStorage _storage;
  late final OfflinePackStorage _offlinePacks;
  Timer? _refreshTimer;
  Timer? _panicTimer;

  // Session
  bool loading = true;
  String? token;
  String? phone;
  String? deviceId;
  String lang = 'en';
  bool onboardingDone = false;
  bool iconOnlyMode = false;
  bool voiceMode = false;
  bool dataSaver = true;
  bool offline = false;
  bool localPanicActive = false;
  bool localOnlyPanic = false;
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
  bool get panicActive => activePanic != null || localPanicActive;
  bool get womenSafetyMode => preferences['women_mode'] == true;
  bool get womenPreferFemaleHelpers => preferences['women_prefer_female_helpers'] != false;

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
      iconOnlyMode = await _storage.iconOnlyMode();
      voiceMode = await _storage.voiceMode();
      dataSaver = await _storage.dataSaver();
      onboardingDone = await _storage.onboardingDone();
      _api.token = token;
      _api.deviceId = deviceId;

      await _loadPublicConfig();
      if (!isSignedIn) {
        final guestWomen = await _storage.guestWomenPrefs();
        preferences = {...preferences, ...guestWomen};
        preferences['medical_ice'] = await _storage.guestMedicalIce();
      }
      await refreshAll(silent: true);
      _startRefreshLoop();
      if (isSignedIn) {
        await PushService().initialize(this);
      }
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
    final secs = dataSaver ? 90 : 45;
    _refreshTimer = Timer.periodic(Duration(seconds: secs), (_) => refreshAll(silent: true));
  }

  Future<void> setDataSaver(bool on) async {
    dataSaver = on;
    await _storage.setDataSaver(on);
    _startRefreshLoop();
    notifyListeners();
  }

  Future<void> setWomenSafetyPrefs({
    bool? womenMode,
    bool? preferFemaleHelpers,
    bool? checkinNudge,
    bool? responderOptIn,
  }) async {
    if (womenMode != null) preferences['women_mode'] = womenMode;
    if (preferFemaleHelpers != null) preferences['women_prefer_female_helpers'] = preferFemaleHelpers;
    if (checkinNudge != null) preferences['women_checkin_nudge'] = checkinNudge;
    if (responderOptIn != null) preferences['women_responder_opt_in'] = responderOptIn;
    notifyListeners();

    if (isSignedIn) {
      try {
        await _api.updatePreferences({
          if (womenMode != null) 'women_mode': womenMode,
          if (preferFemaleHelpers != null) 'women_prefer_female_helpers': preferFemaleHelpers,
          if (checkinNudge != null) 'women_checkin_nudge': checkinNudge,
          if (responderOptIn != null) 'women_responder_opt_in': responderOptIn,
        });
      } catch (_) {}
    } else {
      await _storage.setGuestWomenPrefs({
        'women_mode': preferences['women_mode'] == true,
        'women_prefer_female_helpers': preferences['women_prefer_female_helpers'] != false,
        'women_checkin_nudge': preferences['women_checkin_nudge'] != false,
        'women_responder_opt_in': preferences['women_responder_opt_in'] == true,
      });
    }
    if (womenMode == true) {
      showToast('Women\'s safety mode on');
    }
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
      offline = false;
    } catch (e) {
      offline = true;
      if (!silent) error = friendlyError(e);
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
      await PushService().syncToken(this);
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
    await VoiceService.instance.init(value);
    notifyListeners();
  }

  Future<void> setIconOnlyMode(bool value) async {
    iconOnlyMode = value;
    await _storage.setIconOnlyMode(value);
    notifyListeners();
  }

  Future<void> setVoiceMode(bool value) async {
    voiceMode = value;
    await _storage.setVoiceMode(value);
    if (value) {
      await VoiceService.instance.init(lang);
      await VoiceService.instance.speak(
        AppI18n.t(lang, 'app_tagline'),
        enabled: true,
      );
    } else {
      await VoiceService.instance.stop();
    }
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
  Future<bool> activatePanic({String reason = 'security'}) async {
    error = null;
    reason = 'security';
    if (position == null) await _refreshLocation();
    if (position == null) {
      error = 'Turn on location for SOS';
      notifyListeners();
      return false;
    }

    localPanicActive = true;
    localOnlyPanic = !isSignedIn;
    panicStartedAt = DateTime.now();
    panicReason = reason;
    notifyListeners();

    if (voiceMode) {
      unawaited(VoiceService.instance.speak(AppI18n.t(lang, 'panic_active_voice'), enabled: true));
    }

    if (!isSignedIn) {
      showToast(AppI18n.t(lang, 'panic_guest_toast'));
      return true;
    }

    try {
      final res = await _api.activatePanic(position!.latitude, position!.longitude, reason: reason);
      activePanic = PanicAlert.fromJson(Map<String, dynamic>.from(res['panic'] as Map? ?? res));
      localOnlyPanic = false;
      _startPanicPolling();
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      error = friendlyError(e);
      showToast(AppI18n.t(lang, 'panic_offline_toast'));
      notifyListeners();
      return true;
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
    final wasActive = panicActive;
    try {
      if (isSignedIn && activePanic != null) await _api.deactivatePanic();
    } catch (_) {}
    activePanic = null;
    localPanicActive = false;
    localOnlyPanic = false;
    panicStartedAt = null;
    panicResponders = [];
    _panicTimer?.cancel();
    notifyListeners();
    if (wasActive) pendingPanicFeedback = true;
  }

  bool pendingPanicFeedback = false;
  String panicReason = 'security';

  Map<String, dynamic> get medicalIce =>
      (preferences['medical_ice'] as Map?)?.map((k, v) => MapEntry(k.toString(), v)) ?? {};

  String buildSosWhatsAppText() {
    final p = position;
    final map = p != null ? 'https://maps.google.com/?q=${p.latitude},${p.longitude}' : '';
    final headline = panicReason == 'medical'
        ? '🏥 MEDICAL SOS'
        : panicReason == 'road_accident'
            ? '🚗 ROAD CRASH SOS'
            : '🆘 SOS';
    final ice = medicalIce;
    final iceLines = <String>[];
    if (ice['blood_group']?.toString().isNotEmpty == true) iceLines.add('Blood: ${ice['blood_group']}');
    if (ice['allergies']?.toString().isNotEmpty == true) iceLines.add('Allergies: ${ice['allergies']}');
    if (ice['conditions']?.toString().isNotEmpty == true) iceLines.add('Conditions: ${ice['conditions']}');
    if (ice['ice_name']?.toString().isNotEmpty == true) {
      iceLines.add('ICE: ${ice['ice_name']}${ice['ice_phone'] != null ? ' (${ice['ice_phone']})' : ''}');
    }
    final iceBlock = iceLines.isEmpty ? '' : '\n\n🏥 Medical info:\n${iceLines.join('\n')}';
    return '$headline — I NEED HELP NOW!\n${map.isNotEmpty ? '📍 $map\n' : ''}Citizen SafeAlert — not government dispatch.$iceBlock';
  }

  Future<void> setMedicalIce(Map<String, String> patch) async {
    final merged = {...medicalIce, ...patch};
    preferences['medical_ice'] = merged;
    notifyListeners();
    if (isSignedIn) {
      try {
        await _api.updateMedicalIce(merged);
      } catch (_) {}
    } else {
      await _storage.setGuestMedicalIce(merged);
    }
  }

  void clearPanicFeedbackPrompt() {
    pendingPanicFeedback = false;
    notifyListeners();
  }

  Future<void> broadcastPanic() async {
    if (!isSignedIn || localOnlyPanic) {
      showToast(AppI18n.t(lang, 'panic_whatsapp_hint'));
      return;
    }
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

  List<Map<String, dynamic>> get nigeriaStates {
    final raw = publicConfig['nigeria_states'];
    if (raw is! List) return [];
    return raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  String? guessStateFromBounds(double lat, double lng, List<Map<String, dynamic>> states) {
    for (final s in states) {
      final minLat = (s['minLat'] as num?)?.toDouble();
      final maxLat = (s['maxLat'] as num?)?.toDouble();
      final minLng = (s['minLng'] as num?)?.toDouble();
      final maxLng = (s['maxLng'] as num?)?.toDouble();
      if (minLat == null || maxLat == null || minLng == null || maxLng == null) continue;
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        return s['name']?.toString();
      }
    }
    return null;
  }

  String? detectStateFromPosition() {
    if (position == null) return null;
    return guessStateFromBounds(position!.latitude, position!.longitude, nigeriaStates);
  }

  Future<void> downloadOfflinePackForState(String state) async {
    await _offlinePacks.downloadPack(state);
    showToast('Offline map saved: $state');
  }

  Future<bool> hasOfflinePack(String state) => _offlinePacks.hasPack(state);

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _panicTimer?.cancel();
    super.dispose();
  }
}
