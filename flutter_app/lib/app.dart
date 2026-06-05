import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/theme/app_theme.dart';
import 'core/i18n/app_i18n.dart';
import 'features/app/app_controller.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/home/home_screen.dart';
import 'features/map/map_screen.dart';
import 'features/insights/insights_screen.dart';
import 'features/routes/routes_screen.dart';
import 'features/circle/circle_screen.dart';
import 'features/report/report_screen.dart';
import 'features/trust/trust_screen.dart';
import 'features/profile/profile_sheet.dart';
import 'features/panic/panic_overlay.dart';
import 'features/app/app_shell.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

GoRouter buildRouter(AppController app) {
  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/home',
    redirect: (ctx, state) {
      app.applyDeepLinkParams(state.uri.queryParameters);
      if (!app.onboardingDone && state.matchedLocation != '/onboarding') return '/onboarding';
      if (app.onboardingDone && state.matchedLocation == '/onboarding') return '/home';
      return null;
    },
    refreshListenable: app,
    routes: [
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      ShellRoute(
        navigatorKey: _shellKey,
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
          GoRoute(path: '/map', builder: (_, __) => const MapScreen()),
          GoRoute(path: '/insights', builder: (_, __) => const InsightsScreen()),
          GoRoute(path: '/routes', builder: (_, __) => const RoutesScreen()),
          GoRoute(path: '/circle', builder: (_, __) => const CircleScreen()),
          GoRoute(path: '/report', builder: (_, __) => const ReportScreen()),
        ],
      ),
      GoRoute(path: '/trust', builder: (_, __) => const TrustScreen()),
    ],
  );
}

class SafeAlertApp extends StatefulWidget {
  const SafeAlertApp({super.key, required this.controller});
  final AppController controller;

  @override
  State<SafeAlertApp> createState() => _SafeAlertAppState();
}

class _SafeAlertAppState extends State<SafeAlertApp> {
  late final GoRouter _router = buildRouter(widget.controller);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'SafeAlert NG',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      supportedLocales: const [
        Locale('en'),
        Locale('ha'),
        Locale('yo'),
        Locale('ig'),
        Locale('pcm'),
      ],
      locale: Locale(AppI18n.supported.contains(widget.controller.lang) ? widget.controller.lang : 'en'),
      routerConfig: _router,
      builder: (context, child) {
        return Stack(
          children: [
            child ?? const SizedBox.shrink(),
            const PanicOverlay(),
            const ProfileSheetHost(),
          ],
        );
      },
    );
  }
}
