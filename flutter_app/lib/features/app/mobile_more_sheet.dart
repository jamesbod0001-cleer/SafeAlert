import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import 'app_controller.dart';

/// Secondary destinations that do not fit the primary bottom bar on phones.
Future<void> showMobileMoreSheet(BuildContext context) {
  final lang = context.read<AppController>().lang;
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: AppColors.text3,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text(
                AppI18n.t(lang, 'nav_more'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text,
                ),
              ),
              const SizedBox(height: 12),
              _MoreTile(
                icon: Icons.insights_outlined,
                label: AppI18n.t(lang, 'nav_stats'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.go('/insights');
                },
              ),
              _MoreTile(
                icon: Icons.route_outlined,
                label: AppI18n.t(lang, 'nav_routes'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.go('/routes');
                },
              ),
              _MoreTile(
                icon: Icons.account_balance_outlined,
                label: AppI18n.t(lang, 'trust_title'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/trust');
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      leading: Icon(icon, color: AppColors.green),
      title: Text(label, style: const TextStyle(color: AppColors.text)),
      trailing: const Icon(Icons.chevron_right, color: AppColors.text3),
      onTap: onTap,
    );
  }
}
