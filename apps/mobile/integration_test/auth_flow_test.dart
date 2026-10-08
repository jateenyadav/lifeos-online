import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'package:lifeos_mobile/auth/token_store.dart';
import 'package:lifeos_mobile/config.dart';
import 'package:lifeos_mobile/main.dart' as app;

Future<void> waitFor(WidgetTester tester, bool Function() ready) async {
  for (var attempt = 0; attempt < 200; attempt += 1) {
    await tester.pump(const Duration(milliseconds: 100));
    if (ready()) return;
  }
  fail(
    'The app did not reach the expected state. Check the running API and seeded account.',
  );
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'native password login uses real MongoDB and platform secure storage',
    (tester) async {
      final store = SecureTokenStore();
      final api = AuthApi(baseUrl: AppConfig.apiBaseUrl);
      final previousToken = await store.read();
      if (previousToken != null) await api.logout(previousToken);
      await store.delete();
      app.main();
      await waitFor(
        tester,
        () =>
            find.byType(app.LifeOsApp).evaluate().isNotEmpty &&
            tester
                .widget<app.LifeOsApp>(find.byType(app.LifeOsApp))
                .controller
                .initialized,
      );
      const identifier = String.fromEnvironment(
        'TEST_LOGIN_ID',
        defaultValue: 'demo',
      );
      const password = String.fromEnvironment(
        'TEST_PASSWORD',
        defaultValue: 'ChangeMe-LifeOS-2026!',
      );
      await tester.enterText(find.byType(TextFormField).at(0), identifier);
      await tester.enterText(find.byType(TextFormField).at(1), password);
      await tester.ensureVisible(find.text('Sign in'));
      await tester.tap(find.text('Sign in'));
      await waitFor(
        tester,
        () => find.byType(NavigationBar).evaluate().isNotEmpty,
      );
      final token = await store.read();
      expect(token, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
      final account = await api.me(token!);
      final controller = tester
          .widget<app.LifeOsApp>(find.byType(app.LifeOsApp))
          .controller;
      expect(account.id, controller.account!.id);
      await tester.ensureVisible(find.byTooltip('Sign out'));
      await tester.tap(find.byTooltip('Sign out'));
      await waitFor(
        tester,
        () => controller.account == null && !controller.busy,
      );
      expect(await store.read(), isNull);
      expect(find.text('Welcome back.'), findsOneWidget);
      await expectLater(
        api.me(token),
        throwsA(
          isA<ApiException>().having((error) => error.status, 'status', 401),
        ),
      );
      api.close();
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
    },
  );
}
