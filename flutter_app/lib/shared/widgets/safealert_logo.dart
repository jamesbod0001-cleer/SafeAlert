import 'package:flutter/material.dart';
import '../../core/constants/app_config.dart';
import '../../core/theme/app_theme.dart';

class SafeAlertLogo extends StatelessWidget {
  const SafeAlertLogo({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 28 : 36,
          height: compact ? 28 : 36,
          decoration: BoxDecoration(
            color: AppColors.green.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.green.withValues(alpha: 0.4)),
          ),
          alignment: Alignment.center,
          child: Text('🛡️', style: TextStyle(fontSize: compact ? 14 : 18)),
        ),
        if (!compact) ...[
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppConfig.appName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(AppConfig.tagline, style: const TextStyle(fontSize: 10, color: AppColors.text3)),
            ],
          ),
        ] else ...[
          const SizedBox(width: 8),
          const Text('SafeAlert', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        ],
      ],
    );
  }
}
