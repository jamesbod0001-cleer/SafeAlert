import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/safealert_logo.dart';
import '../profile/profile_sheet.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  int _index(String loc) {
    if (loc.startsWith('/map')) return 1;
    if (loc.startsWith('/insights')) return 2;
    if (loc.startsWith('/routes')) return 3;
    if (loc.startsWith('/circle')) return 4;
    if (loc.startsWith('/report')) return 5;
    return 0;
  }

  void _go(BuildContext context, int i) {
    const paths = ['/home', '/map', '/insights', '/routes', '/circle', '/report'];
    context.go(paths[i]);
  }

  @override
  Widget build(BuildContext context) {
    final loc = GoRouterState.of(context).uri.path;
    final idx = _index(loc);

    return Scaffold(
      appBar: AppBar(
        title: const SafeAlertLogo(compact: true),
        actions: [
          IconButton(
            tooltip: 'Account',
            padding: const EdgeInsets.all(8),
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            icon: const Icon(Icons.account_circle_outlined, color: AppColors.text2, size: 28),
            onPressed: () => ProfileSheet.show(context),
          ),
        ],
      ),
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: idx,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        height: 72,
        onDestinationSelected: (i) => _go(context, i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'Map'),
          NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights), label: 'Stats'),
          NavigationDestination(icon: Icon(Icons.route_outlined), selectedIcon: Icon(Icons.route), label: 'Routes'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Circle'),
          NavigationDestination(icon: Icon(Icons.add_location_alt_outlined), selectedIcon: Icon(Icons.add_location_alt), label: 'Report'),
        ],
      ),
    );
  }
}
