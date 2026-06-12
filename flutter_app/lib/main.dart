import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/platform/mobile_platform.dart';
import 'app.dart';
import 'features/app/app_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureMobilePlatform();
  runApp(
    ChangeNotifierProvider(
      create: (_) {
        final controller = AppController();
        controller.bootstrap();
        return controller;
      },
      child: Consumer<AppController>(
        builder: (_, app, __) => SafeAlertApp(controller: app),
      ),
    ),
  );
}
