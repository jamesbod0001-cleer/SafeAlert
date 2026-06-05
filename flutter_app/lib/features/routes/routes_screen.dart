import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';

class RoutesScreen extends StatefulWidget {
  const RoutesScreen({super.key});

  @override
  State<RoutesScreen> createState() => _RoutesScreenState();
}

class _RoutesScreenState extends State<RoutesScreen> {
  final _from = TextEditingController();
  final _to = TextEditingController();
  Map<String, dynamic>? _checkResult;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppController>().loadRoutes());
  }

  @override
  void dispose() {
    _from.dispose();
    _to.dispose();
    super.dispose();
  }

  Future<void> _checkRoute(AppController app) async {
    if (_from.text.isEmpty || _to.text.isEmpty) return;
    try {
      final res = await app.api.checkRoute(_from.text.trim(), _to.text.trim());
      setState(() => _checkResult = res);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Route safety scores from real journeys — not guesses.', style: TextStyle(color: AppColors.text2, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(controller: _from, decoration: const InputDecoration(labelText: 'From city')),
        const SizedBox(height: 8),
        TextField(controller: _to, decoration: const InputDecoration(labelText: 'To city')),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: () => _checkRoute(app), child: const Text('Check route')),
        if (_checkResult != null) ...[
          const SizedBox(height: 16),
          SaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Score: ${_checkResult!['score'] ?? "—"}/5', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                Text('Reports: ${_checkResult!['reports'] ?? 0}', style: const TextStyle(color: AppColors.text2)),
                if (_checkResult!['summary'] != null) Text(_checkResult!['summary'].toString()),
              ],
            ),
          ),
        ],
        const SizedBox(height: 24),
        const Text('Popular routes', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (app.routes.isEmpty)
          const SaCard(child: Text('No route data yet — end a journey with a rating to contribute', style: TextStyle(color: AppColors.text2)))
        else
          ...app.routes.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SaCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${r.from} → ${r.to}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            if (r.via != null) Text('Via ${r.via}', style: const TextStyle(fontSize: 11, color: AppColors.text3)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('${r.score?.toStringAsFixed(1) ?? "—"}/5', style: const TextStyle(color: AppColors.green, fontWeight: FontWeight.w700)),
                          Text('${fmtInt(r.reports)} trips', style: const TextStyle(fontSize: 10, color: AppColors.text3)),
                        ],
                      ),
                    ],
                  ),
                ),
              )),
        const SizedBox(height: 80),
      ],
    );
  }
}
