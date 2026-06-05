class SafetyZone {
  SafetyZone({
    required this.id,
    required this.type,
    required this.severity,
    required this.lat,
    required this.lng,
    this.description,
    this.confirms = 0,
    this.reports = 0,
    this.active = true,
    this.createdAt,
    this.state,
    this.distanceKm,
  });

  final String id;
  final String type;
  final String severity;
  final double lat;
  final double lng;
  final String? description;
  final int confirms;
  final int reports;
  final bool active;
  final DateTime? createdAt;
  final String? state;
  final double? distanceKm;

  factory SafetyZone.fromJson(Map<String, dynamic> j) => SafetyZone(
        id: j['id']?.toString() ?? '',
        type: j['type']?.toString() ?? 'suspicious',
        severity: j['severity']?.toString() ?? 'medium',
        lat: (j['lat'] as num?)?.toDouble() ?? 0,
        lng: (j['lng'] as num?)?.toDouble() ?? 0,
        description: j['description']?.toString(),
        confirms: (j['confirms'] as num?)?.toInt() ?? 0,
        reports: (j['reports'] as num?)?.toInt() ?? 0,
        active: j['active'] != false,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at'].toString()) : null,
        state: j['state']?.toString(),
        distanceKm: (j['distance_km'] as num?)?.toDouble(),
      );
}
