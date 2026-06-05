import 'dart:convert';
import 'package:http/http.dart' as http;
import '../constants/app_config.dart';
import 'api_exception.dart';

/// Full SafeAlert /v1 API surface — mirrors web app + backend routes.
class SafeAlertApi {
  SafeAlertApi({this.token, this.deviceId});

  String? token;
  String? deviceId;

  Map<String, String> get _headers {
    final h = {'Content-Type': 'application/json'};
    if (token != null) h['Authorization'] = 'Bearer $token';
    return h;
  }

  Uri _uri(String path, [Map<String, String>? q]) {
    final base = AppConfig.apiBase.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base${path.startsWith('/') ? path : '/$path'}').replace(queryParameters: q);
  }

  Future<Map<String, dynamic>> _decode(http.Response res) async {
    Map<String, dynamic> data = {};
    if (res.body.isNotEmpty) {
      final d = jsonDecode(res.body);
      if (d is Map<String, dynamic>) data = d;
    }
    if (res.statusCode >= 400) {
      throw ApiException(
        data['error']?.toString() ?? data['message']?.toString() ?? 'Request failed (${res.statusCode})',
        res.statusCode,
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) async =>
      _decode(await http.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> post(String path, {Object? body}) async =>
      _decode(await http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> put(String path, {Object? body}) async =>
      _decode(await http.put(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> patch(String path, {Object? body}) async =>
      _decode(await http.patch(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> delete(String path) async =>
      _decode(await http.delete(_uri(path), headers: _headers));

  // ── System ──
  Future<Map<String, dynamic>> health() => get('/health');
  Future<Map<String, dynamic>> publicConfig() => get('/config/public');
  Future<Map<String, dynamic>> settings() => get('/settings');
  Future<Map<String, dynamic>> stats() => get('/stats');
  Future<Map<String, dynamic>> transparency() => get('/transparency');

  // ── Auth ──
  Future<Map<String, dynamic>> requestOtp(String phone) => post('/auth/request-otp', body: {'phone': phone});
  Future<Map<String, dynamic>> verifyOtp(String phone, String code) =>
      post('/auth/verify-otp', body: {'phone': phone, 'code': code, 'device_id': deviceId});

  // ── User ──
  Future<Map<String, dynamic>> preferences() => get('/user/preferences');
  Future<void> updatePreferences(Map<String, dynamic> patch) => put('/user/preferences', body: patch).then((_) {});
  Future<List<dynamic>> circle() async => (await get('/user/circle'))['circle'] as List? ?? [];
  Future<void> updateCircle(List<Map<String, dynamic>> members) =>
      put('/user/circle', body: {'members': members}).then((_) {});
  Future<void> updateLocation(double lat, double lng, {bool journeyActive = false, bool panicActive = false}) =>
      put('/user/location', body: {
        'lat': lat,
        'lng': lng,
        if (journeyActive) 'journey_active': true,
        if (panicActive) 'panic_active': true,
      }).then((_) {});
  Future<void> clearLocation() => delete('/user/location').then((_) {});
  Future<void> updateFcmToken(String t) => put('/user/fcm-token', body: {'token': t}).then((_) {});
  Future<void> updateResponderProfile({required List<String> skills, required bool available}) =>
      put('/user/responder-profile', body: {'skills': skills, 'available': available}).then((_) {});
  Future<void> testNotification() => post('/user/test-notification').then((_) {});

  // ── Zones ──
  Future<List<dynamic>> zones({double? lat, double? lng, double? radiusKm, String? state, int? limit}) async {
    final q = <String, String>{};
    if (lat != null && lng != null) {
      q['lat'] = '$lat';
      q['lng'] = '$lng';
      if (radiusKm != null) q['radius_km'] = '$radiusKm';
    }
    if (state != null) q['state'] = state;
    if (limit != null) q['limit'] = '$limit';
    return (await get('/zones', query: q.isEmpty ? null : q))['zones'] as List? ?? [];
  }

  Future<Map<String, dynamic>> zone(String id) => get('/zones/$id');
  Future<Map<String, dynamic>> createZone({required double lat, required double lng, required String type, String? description}) =>
      post('/zones', body: {'lat': lat, 'lng': lng, 'type': type, 'description': description ?? '', 'device_id': deviceId});
  Future<void> confirmZone(String id) => patch('/zones/$id/confirm').then((_) {});
  Future<void> clearZone(String id) => patch('/zones/$id/clear').then((_) {});
  Future<void> reportFalseZone(String id, {String? reason}) =>
      post('/zones/$id/report-false', body: {'device_id': deviceId, 'reason': reason ?? 'Suspected false report'}).then((_) {});

  // ── Panic ──
  Future<Map<String, dynamic>> activatePanic(double lat, double lng) => post('/panic/activate', body: {'lat': lat, 'lng': lng});
  Future<void> deactivatePanic() => post('/panic/deactivate').then((_) {});
  Future<void> broadcastPanic() => post('/panic/broadcast').then((_) {});
  Future<Map<String, dynamic>> activePanic() => get('/panic/mine/active');
  Future<List<dynamic>> nearbyPanics(double lat, double lng, {double radiusKm = 15}) async =>
      (await get('/panic/nearby', query: {'lat': '$lat', 'lng': '$lng', 'radius_km': '$radiusKm'}))['panics'] as List? ?? [];
  Future<Map<String, dynamic>> panicDetail(String id) => get('/panic/$id');
  Future<List<dynamic>> panicResponders(String id) async =>
      (await get('/panic/$id/responders'))['responders'] as List? ?? [];
  Future<Map<String, dynamic>> respondToPanic(String id) => post('/panic/$id/respond', body: {});
  Future<void> dismissPanic(String id) => post('/panic/$id/dismiss').then((_) {});

  // ── Journey ──
  Future<void> startJourney() => post('/journey/start').then((_) {});
  Future<void> endJourney({String? from, String? to, String? via, int? safetyRating}) =>
      post('/journey/end', body: {
        if (from != null) 'from': from,
        if (to != null) 'to': to,
        if (via != null) 'via': via,
        if (safetyRating != null) 'safety_rating': safetyRating,
      }).then((_) {});

  // ── Check-in ──
  Future<Map<String, dynamic>> createCheckIn({required DateTime dueAt, bool notifyCircle = true}) =>
      post('/check-in', body: {'due_at': dueAt.toUtc().toIso8601String(), 'notify_circle': notifyCircle});
  Future<Map<String, dynamic>> activeCheckIn() => get('/check-in/active');
  Future<void> confirmCheckIn(String id) => post('/check-in/$id/confirm').then((_) {});

  // ── Routes ──
  Future<List<dynamic>> routes() async => (await get('/routes'))['routes'] as List? ?? [];
  Future<Map<String, dynamic>> checkRoute(String from, String to) =>
      get('/routes/check', query: {'from': from, 'to': to});

  // ── Groups ──
  Future<List<dynamic>> groups() async => (await get('/groups'))['groups'] as List? ?? [];
  Future<void> joinGroup(String id) => post('/groups/$id/join').then((_) {});
  Future<Map<String, dynamic>> createGroup(Map<String, dynamic> body) => post('/groups', body: body);

  // ── Estates ──
  Future<List<dynamic>> myEstates() async => (await get('/estates/mine'))['estates'] as List? ?? [];
  Future<List<dynamic>> nearbyEstates(double lat, double lng) async =>
      (await get('/estates', query: {'lat': '$lat', 'lng': '$lng'}))['estates'] as List? ?? [];
  Future<Map<String, dynamic>> registerEstate(Map<String, dynamic> body) => post('/estates/register', body: body);
  Future<Map<String, dynamic>> joinEstate(String code) => post('/estates/join', body: {'join_code': code});
  Future<void> leaveEstate(String id) => post('/estates/$id/leave').then((_) {});

  // ── Resources ──
  Future<List<dynamic>> resources({int limit = 20}) async =>
      (await get('/resources', query: {'limit': '$limit'}))['resources'] as List? ?? [];
  Future<List<dynamic>> resourcesNearby(double lat, double lng, {double radiusKm = 50}) async =>
      (await get('/resources/nearby', query: {'lat': '$lat', 'lng': '$lng', 'radius_km': '$radiusKm'}))['resources'] as List? ?? [];

  // ── Insights ──
  Future<Map<String, dynamic>> insightsSummary({String lang = 'en', bool hasGps = false}) =>
      get('/insights/summary', query: {'lang': lang, if (hasGps) 'has_gps': '1', 'near50': hasGps ? '1' : '0'});

  // ── Trust / tier ──
  Future<List<dynamic>> leaders() async => (await get('/leaders'))['leaders'] as List? ?? [];
  Future<void> applyLeader(Map<String, dynamic> body) => post('/leaders/apply', body: body).then((_) {});
  Future<List<dynamic>> agents() async => (await get('/agents'))['agents'] as List? ?? [];
  Future<void> registerAgent(Map<String, dynamic> body) => post('/agents/register', body: body).then((_) {});
  Future<List<dynamic>> offlinePacks() async => (await get('/offline/packs'))['packs'] as List? ?? [];
  Future<Map<String, dynamic>> offlinePack(String state) => get('/offline/packs/$state');
  Future<Map<String, dynamic>> getOfflinePack(String state) => offlinePack(state);
  Future<List<dynamic>> tips({String lang = 'en'}) async => (await get('/tips', query: {'lang': lang}))['tips'] as List? ?? [];
  Future<Map<String, dynamic>> radioBulletin({String lang = 'en'}) => get('/radio/bulletin', query: {'lang': lang});
  Future<List<dynamic>> reputationLeaderboard() async =>
      (await get('/reputation/leaderboard', query: {'limit': '10'}))['leaders'] as List? ?? [];
  Future<void> registerSchool(Map<String, dynamic> body) => post('/schools/register', body: body).then((_) {});
}
