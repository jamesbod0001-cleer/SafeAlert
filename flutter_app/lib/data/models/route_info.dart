class RouteInfo {
  RouteInfo({required this.from, required this.to, this.via, this.score, this.reports, this.lastUpdated});

  final String from;
  final String to;
  final String? via;
  final double? score;
  final int? reports;
  final DateTime? lastUpdated;

  factory RouteInfo.fromJson(Map<String, dynamic> j) => RouteInfo(
        from: j['from']?.toString() ?? '',
        to: j['to']?.toString() ?? '',
        via: j['via']?.toString(),
        score: (j['score'] as num?)?.toDouble(),
        reports: (j['reports'] as num?)?.toInt(),
        lastUpdated: j['last_updated'] != null ? DateTime.tryParse(j['last_updated'].toString()) : null,
      );
}
