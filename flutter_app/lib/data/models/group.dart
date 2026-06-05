class GroupItem {
  GroupItem({required this.id, required this.name, this.description, this.memberCount, this.joined});

  final String id;
  final String name;
  final String? description;
  final int? memberCount;
  final bool? joined;

  factory GroupItem.fromJson(Map<String, dynamic> j) => GroupItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? 'Group',
        description: j['description']?.toString(),
        memberCount: (j['member_count'] as num?)?.toInt(),
        joined: j['joined'] as bool?,
      );
}
