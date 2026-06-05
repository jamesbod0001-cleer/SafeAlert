class CheckInSession {
  CheckInSession({required this.id, required this.dueAt, this.confirmed = false});

  final String id;
  final DateTime dueAt;
  final bool confirmed;

  factory CheckInSession.fromJson(Map<String, dynamic> j) => CheckInSession(
        id: j['id']?.toString() ?? '',
        dueAt: DateTime.tryParse(j['due_at']?.toString() ?? '') ?? DateTime.now(),
        confirmed: j['confirmed'] == true,
      );
}
