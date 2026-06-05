import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../features/app/app_controller.dart';

class PushService {
  Future<void> initialize(AppController app) async {
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty && app.isSignedIn) {
        await app.api.updateFcmToken(token);
      }
      FirebaseMessaging.onMessage.listen((m) {
        final title = m.notification?.title ?? 'SafeAlert update';
        app.showToast(title);
      });
    } catch (_) {
      // Firebase is optional until platform configs are added.
    }
  }
}
