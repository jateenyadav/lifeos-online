import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/main.dart';
import 'support/auth_fixture.dart';
import 'support/workspace_fixture.dart';

void main() {
  Future<void> openSpace(WidgetTester tester, int index) async {
    await tester.tap(find.byType(NavigationDestination).at(index));
    await tester.pumpAndSettle();
  }

  Future<void> save(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.widgetWithText(TextFormField, label);

  testWidgets('restores Today and opens all independent spaces', (
    tester,
  ) async {
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationDestination), findsNWidgets(6));
    expect(find.text('Hello, LifeOS.'), findsOneWidget);
    for (final entry in {
      1: 'Notes & reminders',
      2: 'Workout tracker',
      3: 'Daily routines',
      4: 'Spending tracker',
    }.entries) {
      await openSpace(tester, entry.key);
      expect(find.text(entry.value), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('creates and edits a note through the shared authenticated API', (
    tester,
  ) async {
    final fixture = WorkspaceFixture();
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
      workspaceRespond: fixture.respond,
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openSpace(tester, 1);
    await tester.tap(find.text('New note'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Title'), 'A real note');
    await tester.enterText(field('Details'), 'My saved thought');
    await save(tester);
    expect(find.text('A real note'), findsOneWidget);
    expect(fixture.data['notes']!.first['body'], 'My saved thought');
    expect(
      fixture.requests.last.headers['Authorization'],
      'Bearer saved-session',
    );
    await tester.ensureVisible(find.byTooltip('Actions for A real note'));
    await tester.tap(find.byTooltip('Actions for A real note'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Title'), 'Updated real note');
    await save(tester);
    expect(find.text('Updated real note'), findsOneWidget);
    expect(fixture.data['notes']!.length, 1);
  });

  testWidgets('creates a routine and persists reversible daily check-ins', (
    tester,
  ) async {
    final fixture = WorkspaceFixture();
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
      workspaceRespond: fixture.respond,
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openSpace(tester, 3);
    await tester.tap(find.text('Add routine'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Title'), 'My daily skin care');
    await save(tester);
    await tester.ensureVisible(find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    expect(
      (fixture.data['routines']!.first['completedDates'] as List).length,
      1,
    );
    await openSpace(tester, 0);
    await tester.ensureVisible(find.byType(Checkbox).first);
    expect(tester.widget<Checkbox>(find.byType(Checkbox).first).value, isTrue);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    expect(fixture.data['routines']!.first['completedDates'], isEmpty);
  });

  testWidgets('logs a workout and stores exact expense and budget amounts', (
    tester,
  ) async {
    final fixture = WorkspaceFixture();
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
      workspaceRespond: fixture.respond,
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openSpace(tester, 2);
    await tester.tap(find.text('Log workout'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A walk'));
    await save(tester);
    expect(fixture.data['workouts']!.first['duration'], 20);
    await openSpace(tester, 4);
    await tester.tap(find.text('Add expense'));
    await tester.pumpAndSettle();
    await tester.enterText(field('What was it for?'), 'Lunch');
    await tester.enterText(field('Amount (INR)'), '25.05');
    await save(tester);
    expect(fixture.data['expenses']!.first['amountMinor'], 2505);
    await tester.ensureVisible(find.text('Set budget'));
    await tester.tap(find.text('Set budget'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Monthly budget (INR)'), '100.00');
    await save(tester);
    expect(fixture.data['budgets']!.first['limitMinor'], 10000);
    expect(find.text('₹74.95'), findsOneWidget);
  });

  testWidgets('failed saves retain the draft and never claim success', (
    tester,
  ) async {
    final fixture = WorkspaceFixture();
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
      workspaceRespond: fixture.respond,
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openSpace(tester, 1);
    await tester.tap(find.text('New note'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Title'), 'Keep my draft');
    fixture.failSave = true;
    await save(tester);
    expect(find.text('Cannot save right now.'), findsOneWidget);
    expect(
      tester.widget<TextFormField>(field('Title')).controller!.text,
      'Keep my draft',
    );
    expect(fixture.data['notes'], isEmpty);
  });

  testWidgets(
    'logout errors remain visible and successful logout returns to login',
    (tester) async {
      var failLogout = true;
      final tokenStore = MemoryTokenStore()..token = 'saved-session';
      final controller = makeController(
        store: tokenStore,
        respond: (request) async => request.url.path == '/api/auth/logout'
            ? failLogout
                  ? jsonResponse({
                      'message': 'Please try signing out again.',
                    }, 503)
                  : jsonResponse({}, 204)
            : jsonResponse({'user': testAccount}),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Please try signing out again.'), findsOneWidget);
      failLogout = false;
      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back.'), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(tokenStore.token, isNull);
    },
  );

  testWidgets('expired sessions close the editor and return to login', (
    tester,
  ) async {
    final fixture = WorkspaceFixture();
    final tokenStore = MemoryTokenStore()..token = 'saved-session';
    final controller = makeController(
      store: tokenStore,
      respond: (_) async => jsonResponse({'user': testAccount}),
      workspaceRespond: (request) async => request.method == 'GET'
          ? fixture.respond(request)
          : jsonResponse({
              'message': 'Your session has expired. Please sign in again.',
            }, 401),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openSpace(tester, 1);
    await tester.tap(find.text('New note'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Title'), 'An expired draft');
    await save(tester);
    expect(find.text('Welcome back.'), findsOneWidget);
    expect(controller.account, isNull);
    expect(tokenStore.token, isNull);
    expect(fixture.data['notes'], isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('all entry editors fit a narrow phone with enlarged text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(280, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    for (final entry in [
      (1, 'New note'),
      (2, 'Log workout'),
      (3, 'Add routine'),
      (4, 'Add expense'),
      (4, 'Set budget'),
    ]) {
      await openSpace(tester, entry.$1);
      await tester.ensureVisible(find.text(entry.$2));
      await tester.tap(find.text(entry.$2));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Save'));
      expect(find.text('Save').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
  });

  for (final size in [
    const Size(390, 844),
    const Size(280, 640),
    const Size(320, 740),
    const Size(844, 390),
    const Size(1024, 768),
  ]) {
    testWidgets('spaces fit $size with enlarged text', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final controller = makeController(
        store: MemoryTokenStore()..token = 'saved-session',
        respond: (_) async => jsonResponse({'user': testAccount}),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (var index = 1; index < 5; index++) {
        await openSpace(tester, index);
        expect(tester.takeException(), isNull);
      }
    });
  }
}
