class ResourceItem {
  ResourceItem({required this.id, required this.title, this.type, this.phone, this.address, this.state, this.distanceKm});

  final String id;
  final String title;
  final String? type;
  final String? phone;
  final String? address;
  final String? state;
  final double? distanceKm;

  factory ResourceItem.fromJson(Map<String, dynamic> j) => ResourceItem(
        id: j['id']?.toString() ?? '',
        title: j['title']?.toString() ?? j['name']?.toString() ?? 'Resource',
        type: j['type']?.toString(),
        phone: j['phone']?.toString(),
        address: j['address']?.toString(),
        state: j['state']?.toString(),
        distanceKm: (j['distance_km'] as num?)?.toDouble(),
      );
}
