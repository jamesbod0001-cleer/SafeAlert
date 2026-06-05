import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../app/app_controller.dart';

class PanicOverlay extends StatefulWidget {
  const PanicOverlay({super.key});

  @override
  State<PanicOverlay> createState() => _PanicOverlayState();
}

class _PanicOverlayState extends State<PanicOverlay> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    if (!app.panicActive || app.activePanic == null) return const SizedBox.shrink();

    final p = app.activePanic!;
    final lat = app.position?.latitude ?? p.lat;
    final lng = app.position?.longitude ?? p.lng;

    return Material(
      color: const Color(0xEE0A0E1A),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Text('● CITIZEN SOS ACTIVE', style: TextStyle(color: AppColors.red, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
              const SizedBox(height: 8),
              Text(app.panicTimerText, style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w800, fontFeatures: [])),
              const Text('Your circle + nearby helpers — not government dispatch', style: TextStyle(color: AppColors.text2, fontSize: 12)),
              Text(formatCoords(lat, lng), style: const TextStyle(color: AppColors.text3, fontSize: 11)),
              const SizedBox(height: 20),
              Expanded(
                child: ListView(
                  children: [
                    const Text('🆘 Your people are being alerted', style: TextStyle(fontWeight: FontWeight.w600)),
                    const Text('Push to circle & opted-in neighbors', style: TextStyle(fontSize: 11, color: AppColors.text3)),
                    const SizedBox(height: 12),
                    if (app.circle.isNotEmpty)
                      ...app.circle.map((m) => ListTile(
                            dense: true,
                            title: Text(m.name),
                            subtitle: Text(m.phone),
                            leading: const Icon(Icons.person, color: AppColors.green),
                          )),
                    if (app.panicResponders.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      const Text('HELPERS EN ROUTE', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.green)),
                      ...app.panicResponders.map((r) => ListTile(
                            dense: true,
                            title: Text(r.name ?? 'Helper'),
                            subtitle: Text(r.skills.map(skillLabel).join(', ')),
                          )),
                    ],
                  ],
                ),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  ElevatedButton(
                    onPressed: () => launchUrl(Uri.parse(whatsAppSosUrl(lat: lat, lng: lng)), mode: LaunchMode.externalApplication),
                    child: const Text('💬 WhatsApp SOS'),
                  ),
                  OutlinedButton(onPressed: () => app.deactivatePanic(), child: const Text("✓ I'm Safe")),
                  OutlinedButton(onPressed: () => app.broadcastPanic(), child: const Text('📢 Ask neighbors')),
                  OutlinedButton(
                    onPressed: () => Share.share('SOS location: ${mapsUrl(lat, lng)}'),
                    child: const Text('🗺 Share map'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
