class AppStats {
  AppStats({
    this.totalZones = 0,
    this.activeZones = 0,
    this.totalUsers = 0,
    this.panicToday = 0,
    this.states = const {},
  });

  final int totalZones;
  final int activeZones;
  final int totalUsers;
  final int panicToday;
  final Map<String, dynamic> states;

  factory AppStats.fromJson(Map<String, dynamic> j) => AppStats(
        totalZones: (j['total_zones'] as num?)?.toInt() ?? 0,
        activeZones: (j['active_zones'] as num?)?.toInt() ?? 0,
        totalUsers: (j['total_users'] as num?)?.toInt() ?? 0,
        panicToday: (j['panic_today'] as num?)?.toInt() ?? 0,
        states: (j['states'] as Map<String, dynamic>?) ?? {},
      );
}
