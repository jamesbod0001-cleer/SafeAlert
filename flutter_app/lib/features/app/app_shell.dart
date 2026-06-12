import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/i18n/app_i18n.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/safealert_logo.dart';
import '../../shared/widgets/offline_banner.dart';
import '../profile/profile_sheet.dart';
import 'app_controller.dart';
import 'mobile_more_sheet.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  static const _primaryPaths = ['/home', '/map', '/circle', '/report'];

  int _index(String loc) {
    if (loc.startsWith('/map')) return 1;
    if (loc.startsWith('/circle')) return 2;
    if (loc.startsWith('/report')) return 3;
    if (loc.startsWith('/insights') ||
        loc.startsWith('/routes') ||
        loc.startsWith('/trust')) {
      return 4;
    }
    return 0;
  }

  void _go(BuildContext context, int i) {
    if (i >= _primaryPaths.length) return;
    context.go(_primaryPaths[i]);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppController>();
    final loc = GoRouterState.of(context).uri.path;
    final idx = _index(loc);
    final lang = app.lang;
    final iconOnly = app.iconOnlyMode;

    return Scaffold(
      appBar: AppBar(
        title: const SafeAlertLogo(compact: true),
        centerTitle: false,
        actions: [
          IconButton(
            tooltip: 'Account',
            padding: const EdgeInsets.all(8),
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            icon: const Icon(Icons.account_circle_outlined, color: AppColors.text2, size: 28),
            onPressed: () => ProfileSheet.showSettings(context),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const OfflineBanner(),
            Expanded(child: child),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: NavigationBar(
          selectedIndex: idx.clamp(0, 4),
          labelBehavior: iconOnly
              ? NavigationDestinationLabelBehavior.alwaysHide
              : NavigationDestinationLabelBehavior.onlyShowSelected,
          height: 64 + (iconOnly ? 0 : 4),
          onDestinationSelected: (i) {
            if (i == 4) {
              showMobileMoreSheet(context);
              return;
            }
            _go(context, i);
          },
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.home_outlined),
              selectedIcon: const Icon(Icons.home),
              label: AppI18n.t(lang, 'nav_home'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.map_outlined),
              selectedIcon: const Icon(Icons.map),
              label: AppI18n.t(lang, 'nav_map'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.people_outline),
              selectedIcon: const Icon(Icons.people),
              label: AppI18n.t(lang, 'nav_circle'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.add_location_alt_outlined),
              selectedIcon: const Icon(Icons.add_location_alt),
              label: AppI18n.t(lang, 'nav_report'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.more_horiz),
              selectedIcon: const Icon(Icons.more_horiz),
              label: AppI18n.t(lang, 'nav_more'),
            ),
          ],
        ),
      ),
    );
  }
}
