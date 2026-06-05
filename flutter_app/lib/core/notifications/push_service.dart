import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../features/app/app_controller.dart';

class PushService {
  static final PushService _instance = PushService._();
  factory PushService() => _instance;
  PushService._();

  bool _firebaseReady = false;

  Future<void> initialize(AppController app) async {
    try {
      await _ensureFirebase();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      await syncToken(app);
      FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
        if (token.isNotEmpty && app.isSignedIn) {
          try {
            await app.api.updateFcmToken(token);
          } catch (_) {}
        }
      });
      FirebaseMessaging.onMessage.listen((m) {
        final title = m.notification?.title ?? 'SafeAlert update';
        app.showToast(title);
      });
    } catch (_) {
      // Firebase is optional until platform configs are added.
    }
  }

  Future<void> syncToken(AppController app) async {
    if (!app.isSignedIn) return;
    try {
      await _ensureFirebase();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await app.api.updateFcmToken(token);
      }
    } catch (_) {}
  }

  Future<void> _ensureFirebase() async {
    if (_firebaseReady) return;
    await Firebase.initializeApp();
    _firebaseReady = true;
  }
}
