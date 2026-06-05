import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';
import '../profile/profile_sheet.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppController>().refreshAll(silent: true));
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () => app.refreshAll(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (!app.isSignedIn) GuestBanner(onSignIn: () => ProfileSheet.show(context)),
              if (app.deepLinkedZoneId != null || app.deepLinkedPanicId != null || app.deepLinkedEstateId != null) ...[
                const SizedBox(height: 8),
                SaCard(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (app.deepLinkedZoneId != null)
                        OutlinedButton(
                          onPressed: () {
                            context.go('/map');
                            app.clearZoneDeepLink();
                          },
                          child: const Text('Open linked zone on map'),
                        ),
                      if (app.deepLinkedPanicId != null)
                        OutlinedButton(
                          onPressed: () {
                            app.showToast('Linked panic loaded');
                            app.clearPanicDeepLink();
                          },
                          child: const Text('Open linked panic'),
                        ),
                      if (app.deepLinkedEstateId != null)
                        OutlinedButton(
                          onPressed: () {
                            context.go('/circle');
                            app.clearEstateDeepLink();
                          },
                          child: const Text('Open linked estate'),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  StatPill(label: 'Active alerts', value: fmtInt(app.stats.activeZones)),
                  const SizedBox(width: 8),
                  StatPill(label: 'Community', value: fmtInt(app.stats.totalUsers), color: AppColors.text),
                  const SizedBox(width: 8),
                  StatPill(label: 'SOS today', value: fmtInt(app.stats.panicToday), color: AppColors.red),
                ],
              ),
              const SizedBox(height: 16),
              SaCard(
                onTap: () => context.push('/trust'),
                child: const Row(
                  children: [
                    Text('🏛️', style: TextStyle(fontSize: 24)),
                    SizedBox(width: 12),
                    Expanded(child: Text('Trust & transparency\nLeaders, offline packs, schools', style: TextStyle(fontSize: 13))),
                    Icon(Icons.chevron_right, color: AppColors.text3),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: Column(
                  children: [
                    Text(app.isSignedIn ? 'Hold for Citizen SOS' : 'Sign in for SOS', style: const TextStyle(color: AppColors.text2, fontSize: 12)),
                    const SizedBox(height: 12),
                    SosHoldButton(
                      enabled: app.isSignedIn,
                      onActivated: () async {
                        final ok = await app.activatePanic();
                        if (ok && context.mounted) {}
                      },
                    ),
                    const SizedBox(height: 8),
                    Text('USSD backup: ${app.ussd}', style: const TextStyle(fontSize: 11, color: AppColors.text3)),
                  ],
                ),
              ),
              if (app.journeyActive) ...[
                const SizedBox(height: 20),
                SaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('🚗 Journey watch active', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: () => _showJourneyEnd(context, app),
                        child: const Text('End journey & rate trip'),
                      ),
                    ],
                  ),
                ),
              ] else if (app.isSignedIn) ...[
                const SizedBox(height: 20),
                SaCard(
                  child: Row(
                    children: [
                      const Expanded(child: Text('Start journey watch — share live location with circle')),
                      ElevatedButton(onPressed: () => app.startJourney(), child: const Text('Start')),
                    ],
                  ),
                ),
              ],
              if (app.activeCheckIn != null) ...[
                const SizedBox(height: 12),
                SaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('⏰ Check-in due ${app.activeCheckIn!.dueAt.toLocal()}'),
                      const SizedBox(height: 8),
                      ElevatedButton(onPressed: () => app.confirmCheckIn(), child: const Text("I'm OK")),
                    ],
                  ),
                ),
              ] else if (app.isSignedIn) ...[
                const SizedBox(height: 12),
                SaCard(
                  child: Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton(onPressed: () => app.scheduleCheckIn(const Duration(hours: 1)), child: const Text('Check-in 1h')),
                      OutlinedButton(onPressed: () => app.scheduleCheckIn(const Duration(hours: 4)), child: const Text('4h')),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Nearby alerts', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  TextButton(onPressed: () => context.go('/map'), child: const Text('Map →')),
                ],
              ),
              const SizedBox(height: 8),
              if (app.activeZones.isEmpty)
                const SaCard(child: Text('No active alerts nearby — stay aware', style: TextStyle(color: AppColors.text2)))
              else
                ...app.activeZones.take(5).map((z) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ZoneTile(zone: z, onTap: () => ZoneDetailSheet.show(context, z)),
                    )),
              if (app.nearbyPanics.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('🆘 Nearby SOS', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.red)),
                ...app.nearbyPanics.map((p) => Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: SaCard(
                        child: Row(
                          children: [
                            Expanded(child: Text('SOS ${p.distanceKm?.toStringAsFixed(1) ?? "?"} km · ${timeAgo(p.createdAt)}')),
                            if (app.isSignedIn)
                              TextButton(onPressed: () => app.respondToPanic(p.id), child: const Text('Help')),
                          ],
                        ),
                      ),
                    )),
              ],
              const SizedBox(height: 80),
            ],
          ),
        ),
        if (app.loading) const LoadingOverlay(message: 'Updating community data…'),
        if (app.toast != null)
          Positioned(
            bottom: 24,
            left: 24,
            right: 24,
            child: Material(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(12),
              child: Padding(padding: const EdgeInsets.all(14), child: Text(app.toast!)),
            ),
          ),
      ],
    );
  }

  void _showJourneyEnd(BuildContext context, AppController app) {
    final from = TextEditingController();
    final to = TextEditingController();
    final via = TextEditingController();
    int rating = 4;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 20, right: 20, top: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Rate your trip', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            TextField(controller: from, decoration: const InputDecoration(labelText: 'From')),
            TextField(controller: to, decoration: const InputDecoration(labelText: 'To')),
            TextField(controller: via, decoration: const InputDecoration(labelText: 'Via (optional)')),
            const SizedBox(height: 8),
            StatefulBuilder(
              builder: (ctx, setSheetState) => Row(
                children: List.generate(5, (i) {
                  final r = i + 1;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text('$r'),
                      selected: rating == r,
                      onSelected: (_) => setSheetState(() => rating = r),
                    ),
                  );
                }),
              ),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () async {
                await app.endJourney(from: from.text, to: to.text, via: via.text.isEmpty ? null : via.text, rating: rating);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Submit & end journey'),
            ),
            TextButton(onPressed: () async { await app.endJourney(); if (ctx.mounted) Navigator.pop(ctx); }, child: const Text('Skip')),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class ZoneDetailSheet {
  static void show(BuildContext context, dynamic zone) {
    final app = context.read<AppController>();
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(zoneTypeLabel(zone.type), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            Text(zone.description ?? 'No description', style: const TextStyle(color: AppColors.text2)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: () { app.confirmZone(zone.id); Navigator.pop(ctx); }, child: const Text('Confirm'))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(onPressed: () { app.clearZone(zone.id); Navigator.pop(ctx); }, child: const Text('Clear'))),
              ],
            ),
            TextButton(onPressed: () { app.reportFalseZone(zone.id); Navigator.pop(ctx); }, child: const Text('Report false')),
          ],
        ),
      ),
    );
  }
}
