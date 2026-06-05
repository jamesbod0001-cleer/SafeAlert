import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'core/notifications/push_service.dart';
import 'features/app/app_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) {
        final controller = AppController();
        controller.bootstrap().then((_) => PushService().initialize(controller));
        return controller;
      },
      child: Consumer<AppController>(
        builder: (_, app, __) => SafeAlertApp(controller: app),
      ),
    ),
  );
}
