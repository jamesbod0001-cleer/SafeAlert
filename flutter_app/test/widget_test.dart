import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:safealert_ng/app.dart';
import 'package:safealert_ng/features/app/app_controller.dart';

void main() {
  testWidgets('SafeAlert app loads', (tester) async {
    final app = AppController();
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: app,
        child: SafeAlertApp(controller: app),
      ),
    );
    await tester.pump();
    expect(find.textContaining('Safe'), findsWidgets);
  });
}
