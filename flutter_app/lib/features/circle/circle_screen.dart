import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/circle_member.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';
import '../profile/profile_sheet.dart';

class CircleScreen extends StatefulWidget {
  const CircleScreen({super.key});

  @override
  State<CircleScreen> createState() => _CircleScreenState();
}

class _CircleScreenState extends State<CircleScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final app = context.read<AppController>();
      app.loadCommunityExtras();
      if (app.isSignedIn) app.refreshAll(silent: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();

    if (!app.isSignedIn) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Sign in to add people you trust', textAlign: TextAlign.center, style: TextStyle(color: AppColors.text2)),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: () => ProfileSheet.show(context), child: const Text('Sign in')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        await app.refreshAll();
        await app.loadCommunityExtras();
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('👥 People you trust', [
            if (app.circle.isEmpty)
              const Text('Who gets your SOS and trip alerts', style: TextStyle(color: AppColors.text2, fontSize: 13))
            else
              ...app.circle.map((m) => ListTile(
                    title: Text(m.name),
                    subtitle: Text(m.phone),
                    trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _removeMember(app, m)),
                  )),
            OutlinedButton(onPressed: () => _addMember(context, app), child: const Text('+ Add contact')),
          ]),
          _section('🏘️ Estate watch', [
            ...app.estates.map((e) => ListTile(title: Text(e.name), subtitle: Text('${e.memberCount ?? 0} members · ${e.role ?? "member"}'))),
            OutlinedButton(onPressed: () => _registerEstate(context, app), child: const Text('Register estate')),
            OutlinedButton(onPressed: () => _joinEstate(context, app), child: const Text('Join with code')),
          ]),
          _section('👫 Community groups', [
            if (app.groups.isEmpty) const Text('No groups yet', style: TextStyle(color: AppColors.text2)),
            ...app.groups.map((g) => ListTile(
                  title: Text(g.name),
                  subtitle: Text(g.description ?? ''),
                  trailing: g.joined == true ? const Text('Joined', style: TextStyle(color: AppColors.green)) : TextButton(onPressed: () => app.joinGroup(g.id), child: const Text('Join')),
                )),
          ]),
          _section('📋 Resources nearby', [
            if (app.nearbyResources.isEmpty && app.resources.isEmpty)
              const Text('Police, hospitals, helplines — loading…', style: TextStyle(color: AppColors.text2))
            else
              ...(app.nearbyResources.isNotEmpty ? app.nearbyResources : app.resources).take(10).map((r) => ListTile(
                    title: Text(r.title),
                    subtitle: Text([r.type, r.address, if (r.distanceKm != null) '${r.distanceKm!.toStringAsFixed(1)} km'].whereType<String>().join(' · ')),
                    trailing: r.phone != null
                        ? IconButton(
                            icon: const Icon(Icons.phone),
                            onPressed: () => launchUrl(Uri.parse('tel:${r.phone}')),
                          )
                        : null,
                  )),
          ]),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: SaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Future<void> _addMember(BuildContext context, AppController app) async {
    final name = TextEditingController();
    final phone = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Add to circle'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            TextField(controller: phone, decoration: const InputDecoration(labelText: 'Phone'), keyboardType: TextInputType.phone),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (ok == true && name.text.isNotEmpty && phone.text.isNotEmpty) {
      final updated = [...app.circle, CircleMember(name: name.text, phone: phone.text)];
      await app.saveCircle(updated);
    }
  }

  Future<void> _removeMember(AppController app, CircleMember m) async {
    await app.saveCircle(app.circle.where((x) => x.phone != m.phone).toList());
  }

  Future<void> _joinEstate(BuildContext context, AppController app) async {
    final code = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Join estate'),
        content: TextField(controller: code, decoration: const InputDecoration(labelText: 'Join code')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Join')),
        ],
      ),
    );
    if (ok == true && code.text.isNotEmpty) await app.joinEstate(code.text.trim());
  }

  Future<void> _registerEstate(BuildContext context, AppController app) async {
    final name = TextEditingController();
    final state = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Register estate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Estate name')),
            TextField(controller: state, decoration: const InputDecoration(labelText: 'State')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Register')),
        ],
      ),
    );
    if (ok == true && name.text.isNotEmpty) await app.registerEstate(name.text, state.text);
  }
}
