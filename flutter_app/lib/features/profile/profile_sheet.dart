import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';

class ProfileSheet extends StatelessWidget {
  const ProfileSheet({super.key});

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => const Padding(
        padding: EdgeInsets.only(bottom: 24),
        child: ProfileSheet(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const _ProfileBody();
  }
}

class ProfileSheetHost extends StatelessWidget {
  const ProfileSheetHost({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _ProfileBody extends StatefulWidget {
  const _ProfileBody();

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

    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 12, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.text3, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          const Text('Your account', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const Text(
            'Map & report without sign-in. Phone + OTP for SOS, circle & journey.',
            style: TextStyle(fontSize: 12, color: AppColors.text2, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (app.isSignedIn) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(app.phone ?? 'Signed in'),
              trailing: TextButton(onPressed: () { app.signOut(); Navigator.pop(context); }, child: const Text('Sign out')),
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
          ] else ...[
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
          const SizedBox(height: 12),
          Text('API: ${AppConfig.apiBase}', style: const TextStyle(fontSize: 10, color: AppColors.text3)),
        ],
      ),
    );
  }
}
