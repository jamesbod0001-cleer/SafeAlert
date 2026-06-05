class CircleMember {
  CircleMember({required this.name, required this.phone, this.relation});

  final String name;
  final String phone;
  final String? relation;

  Map<String, dynamic> toJson() => {'name': name, 'phone': phone, if (relation != null) 'relation': relation};

  factory CircleMember.fromJson(Map<String, dynamic> j) => CircleMember(
        name: j['name']?.toString() ?? '',
        phone: j['phone']?.toString() ?? '',
        relation: j['relation']?.toString(),
      );
}
