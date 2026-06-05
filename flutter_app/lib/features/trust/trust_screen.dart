import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';

class TrustScreen extends StatefulWidget {
  const TrustScreen({super.key});

  @override
  State<TrustScreen> createState() => _TrustScreenState();
}

class _TrustScreenState extends State<TrustScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppController>().loadTrust());
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.go('/home')),
        title: const Text('Trust & transparency'),
      ),
      body: RefreshIndicator(
        onRefresh: () => app.loadTrust(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('How SafeAlert works', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(app.transparency['summary']?.toString() ?? 'Citizen reports, circle SOS, and journey scores — independent of government dispatch.'),
                ],
              ),
            ),
            _block('🏅 Community leaders', app.leaders.isEmpty ? 'None listed yet' : null, app.leaders.map((l) => '${l.name} · ${l.state ?? ""} ${l.verified == true ? "✓" : ""}')),
            _block('🤝 Field agents', app.agents.isEmpty ? 'None listed yet' : null, app.agents.map((a) => '${a.name} · ${a.state ?? ""}')),
            _block('📻 Safety tips', null, app.tips.map((t) => t is Map ? (t['text'] ?? t['title'] ?? '').toString() : t.toString())),
            _block('📦 Offline packs', app.offlinePacks.isEmpty ? 'Download state packs when online' : null, app.offlinePacks.map((p) => p is Map ? (p['state'] ?? p['name'] ?? '').toString() : p.toString())),
            if (app.reputationBoard.isNotEmpty)
              _block('⭐ Top contributors', null, app.reputationBoard.map((r) => r is Map ? '${r['name'] ?? "User"} · ${r['score'] ?? ""}' : r.toString())),
            const SizedBox(height: 24),
            OutlinedButton(onPressed: () => _applyLeader(context, app), child: const Text('Apply as community leader')),
            OutlinedButton(onPressed: () => _registerSchool(context, app), child: const Text('Register school safety program')),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _block(String title, String? empty, Iterable<String> items) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: SaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (empty != null && !items.any((e) => e.isNotEmpty))
              Text(empty, style: const TextStyle(color: AppColors.text2, fontSize: 13))
            else
              ...items.where((e) => e.isNotEmpty).map((e) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $e', style: const TextStyle(fontSize: 13)))),
          ],
        ),
      ),
    );
  }

  Future<void> _applyLeader(BuildContext context, AppController app) async {
    final name = TextEditingController();
    final state = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Apply as leader'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Full name')),
            TextField(controller: state, decoration: const InputDecoration(labelText: 'State')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit')),
        ],
      ),
    );
    if (ok == true) {
      await app.api.applyLeader({'name': name.text, 'state': state.text});
      app.showToast('Application submitted');
      await app.loadTrust();
    }
  }

  Future<void> _registerSchool(BuildContext context, AppController app) async {
    final school = TextEditingController();
    final state = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Register school'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: school, decoration: const InputDecoration(labelText: 'School name')),
            TextField(controller: state, decoration: const InputDecoration(labelText: 'State')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Register')),
        ],
      ),
    );
    if (ok == true) {
      await app.api.registerSchool({'name': school.text, 'state': state.text});
      app.showToast('School registered');
    }
  }
}
