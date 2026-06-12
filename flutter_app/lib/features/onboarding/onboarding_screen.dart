import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/safealert_logo.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pageController = PageController();
  int _page = 0;
  String? _selectedState;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initStateStep());
  }

  Future<void> _initStateStep() async {
    final app = context.read<AppController>();
    if (app.position == null) {
      await app.refreshAll(silent: true);
    }
    if (!mounted) return;
    final detected = app.detectStateFromPosition();
    final states = app.nigeriaStates;
    setState(() {
      _selectedState = detected ?? (states.isNotEmpty ? states.first['name']?.toString() : null);
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_page == 0) {
      _pageController.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      setState(() => _page = 1);
      return;
    }
    if (_page == 1) {
      _requestPermissionsAndContinue();
    }
  }

  Future<void> _requestPermissionsAndContinue() async {
    try {
      await Geolocator.requestPermission();
    } catch (_) {}
    if (!mounted) return;
    await _pageController.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    setState(() => _page = 2);
  }

  Future<void> _downloadPack() async {
    final app = context.read<AppController>();
    final state = _selectedState;
    if (state == null || state.isEmpty) return;
    setState(() => _downloading = true);
    try {
      await app.downloadOfflinePackForState(state);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offline pack download failed')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  Future<void> _finish() async {
    await context.read<AppController>().completeOnboarding();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final states = app.nigeriaStates;
    final detected = app.detectStateFromPosition();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: PopupMenuButton<String>(
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
            ),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  _welcomePage(app),
                  _permissionsPage(app),
                  _statePage(app, states, detected),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: _page == 0
                  ? SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _nextPage,
                        child: Text(AppI18n.t(app.lang, 'get_started')),
                      ),
                    )
                  : _page == 1
                      ? SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _nextPage,
                            child: Text(AppI18n.t(app.lang, 'onboarding_continue')),
                          ),
                        )
                      : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_selectedState != null && _selectedState!.isNotEmpty)
                          OutlinedButton(
                            onPressed: _downloading ? null : _downloadPack,
                            child: _downloading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : Text(
                                    AppI18n.t(
                                      app.lang,
                                      'onboarding_download_pack',
                                      vars: {'state': _selectedState!},
                                    ),
                                  ),
                          ),
                        const SizedBox(height: 12),
                        ElevatedButton(
                          onPressed: _downloading ? null : _finish,
                          child: Text(AppI18n.t(app.lang, 'onboarding_continue')),
                        ),
                        TextButton(
                          onPressed: _downloading ? null : _finish,
                          child: Text(AppI18n.t(app.lang, 'onboarding_skip')),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _welcomePage(AppController app) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Spacer(),
          const SafeAlertLogo(),
          const SizedBox(height: 32),
          Text(
            AppI18n.t(app.lang, 'onboarding_welcome'),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            AppI18n.t(app.lang, 'citizen_powered'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.text2),
          ),
          const SizedBox(height: 12),
          const Text(
            'Report danger, share SOS with your circle, watch journeys — built for Nigeria, not government dispatch.',
            style: TextStyle(color: AppColors.text2, height: 1.5),
          ),
          const SizedBox(height: 24),
          _bullet('🗺️ Live community alerts on the map'),
          _bullet('🆘 Hold SOS — alerts your people + nearby helpers'),
          _bullet('👥 People you trust, estate watch, WhatsApp share'),
          _bullet('📊 Insights & route scores from real journeys'),
          const Spacer(),
        ],
      ),
    );
  }

  Widget _permissionsPage(AppController app) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Spacer(),
          Text(
            AppI18n.t(app.lang, 'onboarding_permissions_title'),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Text(
            AppI18n.t(app.lang, 'onboarding_permissions_body'),
            style: const TextStyle(color: AppColors.text2, height: 1.5),
          ),
          const SizedBox(height: 24),
          _bullet('📍 Location for SOS & community reports'),
          _bullet('🔔 Notifications when someone nearby needs help (optional)'),
          const Spacer(),
        ],
      ),
    );
  }

  Widget _statePage(AppController app, List<Map<String, dynamic>> states, String? detected) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Text(
            AppI18n.t(app.lang, 'onboarding_state_title'),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Text(
            detected != null
                ? AppI18n.t(app.lang, 'onboarding_state_detected', vars: {'state': detected})
                : AppI18n.t(app.lang, 'onboarding_state_hint'),
            style: const TextStyle(color: AppColors.text2, height: 1.5),
          ),
          const SizedBox(height: 24),
          if (states.isEmpty)
            Text(
              AppI18n.t(app.lang, 'onboarding_state_hint'),
              style: const TextStyle(color: AppColors.text2),
            )
          else
            DropdownButtonFormField<String>(
              key: ValueKey(_selectedState),
              initialValue: _selectedState != null && states.any((s) => s['name'] == _selectedState)
                  ? _selectedState
                  : states.first['name']?.toString(),
              decoration: InputDecoration(
                labelText: AppI18n.t(app.lang, 'onboarding_state_title'),
                border: const OutlineInputBorder(),
              ),
              items: states
                  .map((s) => s['name']?.toString() ?? '')
                  .where((n) => n.isNotEmpty)
                  .map((name) => DropdownMenuItem(value: name, child: Text(name)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedState = v),
            ),
          const SizedBox(height: 16),
          Text(
            AppI18n.t(app.lang, 'trust_offline_hint'),
            style: const TextStyle(fontSize: 13, color: AppColors.text2, height: 1.45),
          ),
        ],
      ),
    );
  }

  Widget _bullet(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(t, style: const TextStyle(fontSize: 14)),
      );
}
