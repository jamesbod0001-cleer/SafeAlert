import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../app/app_controller.dart';
import '../../shared/widgets/common_widgets.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  String? _selectedType;
  final _desc = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit(AppController app) async {
    if (_selectedType == null) return;
    setState(() => _submitting = true);
    try {
      await app.reportZone(_selectedType!, description: _desc.text.isEmpty ? null : _desc.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Alert reported — thank you')));
        setState(() {
          _selectedType = null;
          _desc.clear();
        });
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final types = (app.settings['zone_types'] as List?)?.map((e) => e.toString()).toList() ??
        typeIcons.keys.toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Report what you see — community verified, not official dispatch.', style: TextStyle(color: AppColors.text2, fontSize: 13)),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: types.map((t) {
            final selected = _selectedType == t;
            return ChoiceChip(
              label: Text('${typeIcons[t] ?? "⚠"} ${t.replaceAll("_", " ")}'),
              selected: selected,
              selectedColor: AppColors.red.withValues(alpha: 0.25),
              onSelected: (_) => setState(() => _selectedType = t),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _desc,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Details (optional)', hintText: 'Landmark, direction, vehicle…'),
        ),
        const SizedBox(height: 16),
        if (app.locationDenied)
          const SaCard(child: Text('⚠️ Enable location to pin the alert accurately', style: TextStyle(color: AppColors.amber))),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: _submitting || _selectedType == null ? null : () => _submit(app),
            child: Text(_submitting ? 'Submitting…' : '📍 Submit community alert'),
          ),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}
