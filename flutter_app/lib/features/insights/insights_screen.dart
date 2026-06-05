import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';

class InsightsScreen extends StatefulWidget {
  const InsightsScreen({super.key});

  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AppController>().loadInsights());
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final summary = app.insightsSummary;
    final states = app.stats.states;

    return RefreshIndicator(
      onRefresh: () => app.loadInsights(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Community pulse', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 12),
                Text(summary['headline']?.toString() ?? 'Real-time safety data from citizen reports across Nigeria.'),
                if (summary['ai_summary'] != null) ...[
                  const SizedBox(height: 12),
                  Text(summary['ai_summary'].toString(), style: const TextStyle(color: AppColors.text2, fontSize: 13, height: 1.4)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              StatPill(label: 'Total alerts', value: fmtInt(app.stats.totalZones)),
              const SizedBox(width: 8),
              StatPill(label: 'Active now', value: fmtInt(app.stats.activeZones), color: AppColors.amber),
            ],
          ),
          const SizedBox(height: 16),
          const Text('By state', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (states.isEmpty)
            const SaCard(child: Text('No state breakdown yet', style: TextStyle(color: AppColors.text2)))
          else
            ...states.entries.map((e) {
              final v = e.value is Map ? (e.value as Map)['active'] ?? (e.value as Map)['count'] : e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SaCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(e.key.toString()),
                      Text(fmtInt(v as num?), style: const TextStyle(color: AppColors.green, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              );
            }),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}
