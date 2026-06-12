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
  static const _iconOnly = 'sa_icon_only';
  static const _voiceMode = 'sa_voice_mode';
  static const _dataSaver = 'sa_data_saver';
  static const _womenMode = 'sa_women_mode';
  static const _womenPrefer = 'sa_women_prefer_helpers';
  static const _womenCheckin = 'sa_women_checkin_nudge';
  static const _womenResponder = 'sa_women_responder';
  static const _medicalIce = 'sa_medical_ice';

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

  Future<bool> iconOnlyMode() async =>
      (await SharedPreferences.getInstance()).getBool(_iconOnly) ?? false;
  Future<void> setIconOnlyMode(bool v) async =>
      (await SharedPreferences.getInstance()).setBool(_iconOnly, v);

  Future<bool> voiceMode() async =>
      (await SharedPreferences.getInstance()).getBool(_voiceMode) ?? false;
  Future<void> setVoiceMode(bool v) async =>
      (await SharedPreferences.getInstance()).setBool(_voiceMode, v);

  Future<bool> dataSaver() async =>
      (await SharedPreferences.getInstance()).getBool(_dataSaver) ?? true;
  Future<void> setDataSaver(bool v) async =>
      (await SharedPreferences.getInstance()).setBool(_dataSaver, v);

  Future<Map<String, bool>> guestWomenPrefs() async {
    final p = await SharedPreferences.getInstance();
    return {
      'women_mode': p.getBool(_womenMode) ?? false,
      'women_prefer_female_helpers': p.getBool(_womenPrefer) ?? true,
      'women_checkin_nudge': p.getBool(_womenCheckin) ?? true,
      'women_responder_opt_in': p.getBool(_womenResponder) ?? false,
    };
  }

  Future<void> setGuestWomenPrefs(Map<String, bool> v) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_womenMode, v['women_mode'] ?? false);
    await p.setBool(_womenPrefer, v['women_prefer_female_helpers'] ?? true);
    await p.setBool(_womenCheckin, v['women_checkin_nudge'] ?? true);
    await p.setBool(_womenResponder, v['women_responder_opt_in'] ?? false);
  }

  Future<Map<String, String>> guestMedicalIce() async {
    final raw = (await SharedPreferences.getInstance()).getString(_medicalIce);
    if (raw == null) return {};
    try {
      return Map<String, String>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return {};
    }
  }

  Future<void> setGuestMedicalIce(Map<String, dynamic> v) async {
    await (await SharedPreferences.getInstance()).setString(_medicalIce, jsonEncode(v));
  }

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
