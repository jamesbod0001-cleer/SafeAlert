class EstateItem {
  EstateItem({required this.id, required this.name, this.joinCode, this.memberCount, this.role});

  final String id;
  final String name;
  final String? joinCode;
  final int? memberCount;
  final String? role;

  factory EstateItem.fromJson(Map<String, dynamic> j) => EstateItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? 'Estate',
        joinCode: j['join_code']?.toString(),
        memberCount: (j['member_count'] as num?)?.toInt(),
        role: j['role']?.toString(),
      );
}
