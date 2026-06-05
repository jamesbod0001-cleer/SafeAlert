import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/safealert_api.dart';

/// Persists per-state offline packs in SharedPreferences — mirrors web localStorage keys.
class OfflinePackStorage {
  OfflinePackStorage(this._api);

  final SafeAlertApi _api;

  static String packKey(String state) =>
      'safealert_offline_${state.toLowerCase().replaceAll(' ', '_')}';

  Future<void> downloadPack(String state) async {
    final pack = await _api.getOfflinePack(state);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(packKey(state), jsonEncode(pack));
  }

  Future<Map<String, dynamic>?> getPack(String state) async {
    final raw = (await SharedPreferences.getInstance()).getString(packKey(state));
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return null;
  }

  Future<bool> hasPack(String state) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(packKey(state));
  }
}
