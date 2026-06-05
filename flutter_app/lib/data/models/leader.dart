class LeaderItem {
  LeaderItem({required this.id, required this.name, this.state, this.verified, this.score});

  final String id;
  final String name;
  final String? state;
  final bool? verified;
  final num? score;

  factory LeaderItem.fromJson(Map<String, dynamic> j) => LeaderItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? 'Leader',
        state: j['state']?.toString(),
        verified: j['verified'] as bool?,
        score: j['score'] as num?,
      );
}

class AgentItem {
  AgentItem({required this.id, required this.name, this.state, this.verified});

  final String id;
  final String name;
  final String? state;
  final bool? verified;

  factory AgentItem.fromJson(Map<String, dynamic> j) => AgentItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? 'Agent',
        state: j['state']?.toString(),
        verified: j['verified'] as bool?,
      );
}
