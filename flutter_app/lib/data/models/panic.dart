class PanicAlert {
  PanicAlert({
    required this.id,
    required this.lat,
    required this.lng,
    this.active = true,
    this.createdAt,
    this.distanceKm,
    this.userPhone,
  });

  final String id;
  final double lat;
  final double lng;
  final bool active;
  final DateTime? createdAt;
  final double? distanceKm;
  final String? userPhone;

  factory PanicAlert.fromJson(Map<String, dynamic> j) => PanicAlert(
        id: j['id']?.toString() ?? '',
        lat: (j['lat'] as num?)?.toDouble() ?? 0,
        lng: (j['lng'] as num?)?.toDouble() ?? 0,
        active: j['active'] != false,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at'].toString()) : null,
        distanceKm: (j['distance_km'] as num?)?.toDouble(),
        userPhone: j['user_phone']?.toString(),
      );
}

class PanicResponder {
  PanicResponder({required this.id, this.name, this.phone, this.skills = const [], this.distanceKm});

  final String id;
  final String? name;
  final String? phone;
  final List<String> skills;
  final double? distanceKm;

  factory PanicResponder.fromJson(Map<String, dynamic> j) => PanicResponder(
        id: j['id']?.toString() ?? j['user_id']?.toString() ?? '',
        name: j['name']?.toString(),
        phone: j['phone']?.toString(),
        skills: (j['skills'] as List?)?.map((e) => e.toString()).toList() ?? [],
        distanceKm: (j['distance_km'] as num?)?.toDouble(),
      );
}
