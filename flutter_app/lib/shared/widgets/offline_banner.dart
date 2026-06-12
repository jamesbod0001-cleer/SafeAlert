import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../../features/app/app_controller.dart';

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    if (!app.offline) return const SizedBox.shrink();
    return Material(
      color: AppColors.amber.withValues(alpha: 0.15),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            const Text('📡', style: TextStyle(fontSize: 16)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                AppI18n.t(app.lang, 'offline_banner'),
                style: const TextStyle(fontSize: 12, color: AppColors.amber, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
