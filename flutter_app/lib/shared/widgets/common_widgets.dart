import 'package:flutter/material.dart';
import '../../core/constants/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../data/models/zone.dart';

class SaCard extends StatelessWidget {
  const SaCard({super.key, required this.child, this.onTap, this.padding});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return InkWell(onTap: onTap, borderRadius: BorderRadius.circular(16), child: card);
  }
}

class StatPill extends StatelessWidget {
  const StatPill({super.key, required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color ?? AppColors.green)),
            const SizedBox(height: 4),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, color: AppColors.text3)),
          ],
        ),
      ),
    );
  }
}

class ZoneTile extends StatelessWidget {
  const ZoneTile({super.key, required this.zone, this.onTap, this.trailing});
  final SafetyZone zone;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final icon = typeIcons[zone.type] ?? '⚠️';
    final sev = AppColors.severity(zone.severity);
    return SaCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(zoneTypeLabel(zone.type), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  '${severityLabel(zone.severity)} · ${zone.confirms} confirms · ${timeAgo(zone.createdAt)}',
                  style: const TextStyle(fontSize: 11, color: AppColors.text3),
                ),
                if (zone.distanceKm != null)
                  Text('${zone.distanceKm!.toStringAsFixed(1)} km away', style: TextStyle(fontSize: 10, color: sev)),
              ],
            ),
          ),
          trailing ?? Icon(Icons.chevron_right, color: sev.withValues(alpha: 0.8)),
        ],
      ),
    );
  }
}

class SosHoldButton extends StatefulWidget {
  const SosHoldButton({super.key, required this.onActivated, this.enabled = true});
  final Future<void> Function() onActivated;
  final bool enabled;

  @override
  State<SosHoldButton> createState() => _SosHoldButtonState();
}

class _SosHoldButtonState extends State<SosHoldButton> {
  double _progress = 0;
  bool _holding = false;

  Future<void> _holdTick() async {
    if (!_holding) return;
    setState(() => _progress += 0.05);
    if (_progress >= 1) {
      _holding = false;
      await widget.onActivated();
      if (mounted) setState(() => _progress = 0);
      return;
    }
    await Future.delayed(const Duration(milliseconds: 100));
    if (mounted) _holdTick();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPressStart: widget.enabled
          ? (_) {
              _holding = true;
              _holdTick();
            }
          : null,
      onLongPressEnd: (_) => setState(() {
        _holding = false;
        _progress = 0;
      }),
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 120,
            height: 120,
            child: CircularProgressIndicator(value: _progress, strokeWidth: 4, color: AppColors.red, backgroundColor: AppColors.surface2),
          ),
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: widget.enabled ? AppColors.red : AppColors.text3,
              boxShadow: [BoxShadow(color: AppColors.red.withValues(alpha: 0.35), blurRadius: 24, spreadRadius: 2)],
            ),
            alignment: Alignment.center,
            child: const Text('SOS', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22, color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black54,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppColors.green),
          if (message != null) ...[const SizedBox(height: 12), Text(message!, style: const TextStyle(color: AppColors.text2))],
        ],
      ),
    );
  }
}

class GuestBanner extends StatelessWidget {
  const GuestBanner({super.key, required this.onSignIn});
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return SaCard(
      child: Row(
        children: [
          const Expanded(
            child: Text('Browse alerts as guest. Sign in for SOS, circle & journey.', style: TextStyle(fontSize: 12, color: AppColors.text2)),
          ),
          TextButton(onPressed: onSignIn, child: const Text('Sign in')),
        ],
      ),
    );
  }
}
