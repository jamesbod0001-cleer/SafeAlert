import 'package:geolocator/geolocator.dart';

class LocationService {
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always || perm == LocationPermission.whileInUse;
  }

  Future<Position?> currentPosition() async {
    if (!await ensurePermission()) return null;
    try {
      return await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
    } catch (_) {
      return null;
    }
  }
}

String formatCoords(double lat, double lng) => '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';

String mapsUrl(double lat, double lng, [String? label]) {
  final q = label != null ? Uri.encodeComponent(label) : '$lat,$lng';
  return 'https://www.google.com/maps/search/?api=1&query=$lat,$lng&q=$q';
}

String whatsAppSosUrl({required double lat, required double lng, String? phone}) {
  final text = Uri.encodeComponent(
    '🆘 SafeAlert NG — I need help!\nLocation: $lat, $lng\n${mapsUrl(lat, lng)}\nSent via SafeAlert — citizen-powered safety.',
  );
  if (phone != null && phone.isNotEmpty) {
    final p = phone.replaceAll(RegExp(r'\D'), '');
    return 'https://wa.me/$p?text=$text';
  }
  return 'https://wa.me/?text=$text';
}

String timeAgo(DateTime? dt) {
  if (dt == null) return '—';
  final s = DateTime.now().difference(dt).inSeconds;
  if (s < 60) return '${s}s ago';
  if (s < 3600) return '${s ~/ 60}m ago';
  if (s < 86400) return '${s ~/ 3600}h ago';
  return '${s ~/ 86400}d ago';
}

String fmtInt(num? n) {
  if (n == null) return '0';
  final v = n.toInt();
  if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
  return '$v';
}

String zoneTypeLabel(String t) => t.replaceAll('_', ' ').split(' ').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

String severityLabel(String s) => s.isEmpty ? 'Unknown' : '${s[0].toUpperCase()}${s.substring(1)}';

String skillLabel(String s) => s.replaceAll('_', ' ').split(' ').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
