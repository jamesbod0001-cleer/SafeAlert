import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/safealert_logo.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              const SafeAlertLogo(),
              const SizedBox(height: 32),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      AppI18n.t(app.lang, 'citizen_powered'),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                    ),
                  ),
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.language),
                    onSelected: (v) => app.setLanguage(v),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'en', child: Text('English')),
                      PopupMenuItem(value: 'ha', child: Text('Hausa')),
                      PopupMenuItem(value: 'yo', child: Text('Yoruba')),
                      PopupMenuItem(value: 'ig', child: Text('Igbo')),
                      PopupMenuItem(value: 'pcm', child: Text('Pidgin')),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Report danger, share SOS with your circle, watch journeys — built for Nigeria, not government dispatch.',
                style: TextStyle(color: AppColors.text2, height: 1.5),
              ),
              const SizedBox(height: 24),
              _bullet('🗺️ Live community alerts on the map'),
              _bullet('🆘 Hold SOS — alerts your people + nearby helpers'),
              _bullet('👥 Safety circle, estate watch, WhatsApp share'),
              _bullet('📊 Insights & route scores from real journeys'),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => app.completeOnboarding(),
                  child: Text(AppI18n.t(app.lang, 'get_started')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bullet(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(t, style: const TextStyle(fontSize: 14)),
      );
}
