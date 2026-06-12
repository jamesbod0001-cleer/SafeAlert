import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_config.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';

enum ProfileSheetMode { auto, signIn, settings }

class ProfileSheet extends StatelessWidget {
  const ProfileSheet({super.key, this.mode = ProfileSheetMode.auto});
  final ProfileSheetMode mode;

  static void show(BuildContext context, {ProfileSheetMode mode = ProfileSheetMode.auto}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: ProfileSheet(mode: mode),
      ),
    );
  }

  static void showSignIn(BuildContext context) => show(context, mode: ProfileSheetMode.signIn);
  static void showSettings(BuildContext context) => show(context, mode: ProfileSheetMode.settings);

  @override
  Widget build(BuildContext context) {
    return _ProfileBody(mode: mode);
  }
}

class ProfileSheetHost extends StatelessWidget {
  const ProfileSheetHost({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _ProfileBody extends StatefulWidget {
  const _ProfileBody({required this.mode});
  final ProfileSheetMode mode;

  @override
  State<_ProfileBody> createState() => _ProfileBodyState();
}

class _ProfileBodyState extends State<_ProfileBody> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  String? _sandboxCode;
  bool _otpSent = false;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final lang = app.lang;
    final signInOnly = widget.mode == ProfileSheetMode.signIn;
    final settingsOnly = widget.mode == ProfileSheetMode.settings;

    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 12, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.text3, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          Text(
            signInOnly ? 'Sign in' : (settingsOnly || app.isSignedIn ? 'Settings' : 'Your account'),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          Text(
            signInOnly
                ? AppI18n.t(lang, 'guest_sos_banner')
                : 'Map & report without sign-in. Phone + OTP for circle sync & journey.',
            style: const TextStyle(fontSize: 12, color: AppColors.text2, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (app.isSignedIn) ...[
            if (!signInOnly) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(app.phone ?? 'Signed in'),
                trailing: TextButton(
                  onPressed: () {
                    app.signOut();
                    Navigator.pop(context);
                  },
                  child: const Text('Sign out'),
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Available as helper'),
                subtitle: const Text('Respond to nearby SOS'),
                value: app.preferences['responder_available'] == true,
                onChanged: (v) async {
                  await app.api.updateResponderProfile(
                    skills: (app.preferences['responder_skills'] as List?)?.map((e) => e.toString()).toList() ?? [],
                    available: v,
                  );
                  await app.refreshAll(silent: true);
                },
              ),
            ],
          ] else if (!settingsOnly) ...[
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone (+234…)'),
            ),
            if (_sandboxCode != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Sandbox OTP: $_sandboxCode', style: const TextStyle(color: AppColors.amber, fontSize: 12)),
              ),
            const SizedBox(height: 8),
            if (!_otpSent)
              ElevatedButton(
                onPressed: () async {
                  final code = await app.requestOtp(_phone.text.trim());
                  setState(() {
                    _otpSent = true;
                    _sandboxCode = code;
                  });
                },
                child: const Text('Send OTP'),
              )
            else ...[
              TextField(controller: _otp, decoration: const InputDecoration(labelText: 'OTP code'), keyboardType: TextInputType.number),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: () async {
                  final ok = await app.verifyOtp(_otp.text.trim());
                  if (ok && context.mounted) Navigator.pop(context);
                },
                child: const Text('Verify & sign in'),
              ),
            ],
          ],
          if (app.error != null) ...[
            const SizedBox(height: 8),
            Text(app.error!, style: const TextStyle(color: AppColors.red, fontSize: 12)),
          ],
          if (!signInOnly) ...[
            const Divider(height: 24),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Data Saver'),
              subtitle: const Text('Fewer background updates — map loads on demand'),
              value: app.dataSaver,
              onChanged: (v) => app.setDataSaver(v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(AppI18n.t(lang, 'icon_only_mode')),
              subtitle: const Text('Hide bottom nav labels — icons only'),
              value: app.iconOnlyMode,
              onChanged: (v) => app.setIconOnlyMode(v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(AppI18n.t(lang, 'voice_mode')),
              subtitle: const Text('Read key prompts aloud'),
              value: app.voiceMode,
              onChanged: (v) => app.setVoiceMode(v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(AppI18n.t(lang, 'women_mode_title')),
              subtitle: Text(AppI18n.t(lang, 'women_mode_subtitle')),
              value: app.womenSafetyMode,
              onChanged: (v) => app.setWomenSafetyPrefs(womenMode: v),
            ),
            if (app.womenSafetyMode) ...[
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(AppI18n.t(lang, 'women_prefer_helpers')),
                subtitle: const Text('Trusted women helpers first on SOS'),
                value: app.womenPreferFemaleHelpers,
                onChanged: (v) => app.setWomenSafetyPrefs(preferFemaleHelpers: v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(AppI18n.t(lang, 'women_responder_opt_in')),
                subtitle: const Text('Receive & respond to women\'s safety alerts'),
                value: app.preferences['women_responder_opt_in'] == true,
                onChanged: (v) => app.setWomenSafetyPrefs(responderOptIn: v),
              ),
            ],
            const Divider(height: 24),
            Text('Medical ICE', style: Theme.of(context).textTheme.titleSmall),
            const Text('Shared on SOS via WhatsApp — not sent to government.', style: TextStyle(fontSize: 11, color: AppColors.text2)),
            const SizedBox(height: 8),
            _IceField(label: 'Blood group', value: app.medicalIce['blood_group']?.toString() ?? '', onSave: (v) => app.setMedicalIce({'blood_group': v})),
            _IceField(label: 'Allergies', value: app.medicalIce['allergies']?.toString() ?? '', onSave: (v) => app.setMedicalIce({'allergies': v})),
            TextButton(
              onPressed: () => _showEmergencySheet(context),
              child: Text(AppI18n.t(lang, 'emergency_numbers')),
            ),
            TextButton(
              onPressed: () {
                final base = AppConfig.apiBase.replaceFirst(RegExp(r'/v1/?$'), '');
                launchUrl(Uri.parse('$base/faq.html#medical-road'), mode: LaunchMode.externalApplication);
              },
              child: const Text('Medical & road FAQ'),
            ),
            TextButton(
              onPressed: () {
                final base = AppConfig.apiBase.replaceFirst(RegExp(r'/v1/?$'), '');
                launchUrl(Uri.parse('$base/faq.html'), mode: LaunchMode.externalApplication);
              },
              child: const Text('Legal & safety FAQ'),
            ),
          ],
        ],
      ),
    );
  }
}

void _showEmergencySheet(BuildContext context) {
  final lang = context.read<AppController>().lang;
  showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.surface,
    builder: (ctx) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(AppI18n.t(lang, 'emergency_numbers'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          Text(AppI18n.t(lang, 'emergency_disclaimer'), style: const TextStyle(fontSize: 11, color: AppColors.text2, height: 1.45)),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: () => launchUrl(Uri.parse('tel:112')), child: const Text('📞 112 — Emergency')),
          OutlinedButton(onPressed: () => launchUrl(Uri.parse('tel:08026660000')), child: const Text('📞 Nigerian Red Cross')),
          OutlinedButton(onPressed: () => launchUrl(Uri.parse('tel:122')), child: const Text('📞 FRSC 122 (highways)')),
          OutlinedButton(onPressed: () => launchUrl(Uri.parse('tel:08007887799')), child: const Text('📞 Survivors (mental health)')),
          const SizedBox(height: 12),
        ],
      ),
    ),
  );
}

class _IceField extends StatefulWidget {
  const _IceField({required this.label, required this.value, required this.onSave});
  final String label;
  final String value;
  final ValueChanged<String> onSave;

  @override
  State<_IceField> createState() => _IceFieldState();
}

class _IceFieldState extends State<_IceField> {
  late final TextEditingController _c = TextEditingController(text: widget.value);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: _c,
        decoration: InputDecoration(labelText: widget.label, suffixIcon: IconButton(icon: const Icon(Icons.check), onPressed: () => widget.onSave(_c.text.trim()))),
        onSubmitted: widget.onSave,
      ),
    );
  }
}
