import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_config.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/common_widgets.dart';
import '../app/app_controller.dart';
import '../profile/profile_sheet.dart';

class WomenSafetyHub extends StatelessWidget {
  const WomenSafetyHub({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    if (!app.womenSafetyMode) return const SizedBox.shrink();
    final lang = app.lang;

    return SaCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('💜', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  AppI18n.t(lang, 'women_mode_title'),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            AppI18n.t(lang, 'women_mode_hub_hint'),
            style: const TextStyle(fontSize: 11, color: AppColors.text2, height: 1.45),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: app.isSignedIn ? () => app.scheduleCheckIn(const Duration(hours: 1)) : () => ProfileSheet.showSignIn(context),
                child: Text(AppI18n.t(lang, 'women_checkin_1h')),
              ),
              OutlinedButton(onPressed: () => context.go('/circle'), child: Text(AppI18n.t(lang, 'women_my_circle'))),
              OutlinedButton(
                onPressed: () {
                  final base = AppConfig.apiBase.replaceFirst(RegExp(r'/v1/?$'), '');
                  launchUrl(Uri.parse('$base/faq.html#abuse'), mode: LaunchMode.externalApplication);
                },
                child: Text(AppI18n.t(lang, 'women_safety_tips')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
