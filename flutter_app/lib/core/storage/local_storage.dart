import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class LocalStorage {
  static const _token = 'sa_token';
  static const _phone = 'sa_phone';
  static const _deviceId = 'sa_device_id';
  static const _zonesCache = 'sa_zones_cache';
  static const _statsCache = 'sa_stats_cache';
  static const _onboardingDone = 'sa_onboarding_done';
  static const _lang = 'sa_lang';

  Future<String?> getToken() async => (await SharedPreferences.getInstance()).getString(_token);
  Future<void> setToken(String? v) async {
    final p = await SharedPreferences.getInstance();
    if (v == null) {
      await p.remove(_token);
    } else {
      await p.setString(_token, v);
    }
  }

  Future<String?> getPhone() async => (await SharedPreferences.getInstance()).getString(_phone);
  Future<void> setPhone(String? v) async {
    final p = await SharedPreferences.getInstance();
    if (v == null) {
      await p.remove(_phone);
    } else {
      await p.setString(_phone, v);
    }
  }

  Future<String?> getDeviceId() async => (await SharedPreferences.getInstance()).getString(_deviceId);
  Future<void> setDeviceId(String v) async => (await SharedPreferences.getInstance()).setString(_deviceId, v);

  Future<bool> onboardingDone() async => (await SharedPreferences.getInstance()).getBool(_onboardingDone) ?? false;
  Future<void> setOnboardingDone(bool v) async => (await SharedPreferences.getInstance()).setBool(_onboardingDone, v);

  Future<String> getLang() async => (await SharedPreferences.getInstance()).getString(_lang) ?? 'en';
  Future<void> setLang(String v) async => (await SharedPreferences.getInstance()).setString(_lang, v);

  Future<void> cacheZones(List<dynamic> zones) async {
    await (await SharedPreferences.getInstance()).setString(_zonesCache, jsonEncode({'zones': zones, 'at': DateTime.now().toIso8601String()}));
  }

  Future<List<dynamic>?> readZonesCache() async {
    final raw = (await SharedPreferences.getInstance()).getString(_zonesCache);
    if (raw == null) return null;
    try {
      return (jsonDecode(raw) as Map)['zones'] as List?;
    } catch (_) {
      return null;
    }
  }

  Future<void> cacheStats(Map<String, dynamic> stats) async {
    await (await SharedPreferences.getInstance()).setString(_statsCache, jsonEncode(stats));
  }

  Future<Map<String, dynamic>?> readStatsCache() async {
    final raw = (await SharedPreferences.getInstance()).getString(_statsCache);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
