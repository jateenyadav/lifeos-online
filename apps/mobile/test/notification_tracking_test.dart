import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/spending/notification_bridge.dart';
import 'package:lifeos_mobile/spending/notification_tracking_card.dart';
import 'package:lifeos_mobile/workspaces/workspace_controller.dart';
import 'support/auth_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  var enabled = false;
  var permission = false;
  var failEnable = false;
  var failSync = false;

  setUp(() {
    calls.clear();
    enabled = false;
    permission = false;
    failEnable = false;
    failSync = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(NotificationBridge.channel, (call) async {
          calls.add(call);
          if (call.method == 'status') {
            return {
              'supported': true,
              'enabled': enabled,
              'permission': permission,
              'connected': permission,
              'pending': 2,
              'saved': 3,
            };
          }
          if (call.method == 'enable') {
            if (failEnable) {
              throw PlatformException(
                code: 'storage',
                message: 'Please sign in again.',
              );
            }
            enabled = true;
          }
          if (call.method == 'disable') enabled = false;
          if (call.method == 'sync' && failSync) {
            throw PlatformException(
              code: 'storage',
              message: 'Could not read the waiting list.',
            );
          }
          return null;
        });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(NotificationBridge.channel, null);
  });

  test('iOS never attempts to read other apps notifications', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final bridge = NotificationBridge();
    await bridge.configure(
      baseUrl: 'https://example.com/api',
      userId: 'user-1',
      token: 'secret',
    );
    expect((await bridge.status()).supported, isFalse);
    await bridge.enable();
    expect(calls, isEmpty);
  });

  test(
    'restored credentials are sent only to the native secure store',
    () async {
      final auth = makeController(
        notifications: NotificationBridge(),
        store: MemoryTokenStore()..token = 'saved-session',
        respond: (_) async => jsonResponse({'user': testAccount}),
      );
      addTearDown(auth.dispose);
      await auth.restoreSession();
      expect(calls.single.method, 'configure');
      expect(calls.single.arguments, {
        'baseUrl': 'http://localhost:4000/api',
        'userId': 'user-1',
        'token': 'saved-session',
      });
      await auth.logout();
      expect(calls.last.arguments['userId'], isNull);
      expect(calls.last.arguments['token'], isNull);
    },
  );

  test('temporary offline restore does not erase queued expenses', () async {
    final auth = makeController(
      notifications: NotificationBridge(),
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async =>
          jsonResponse({'message': 'Temporarily offline'}, 503),
    );
    addTearDown(auth.dispose);
    await auth.restoreSession();
    expect(calls, isEmpty);
    expect(auth.error, 'Temporarily offline');
  });

  test('expired session clears background credentials', () async {
    final auth = makeController(
      notifications: NotificationBridge(),
      store: MemoryTokenStore()..token = 'expired-session',
      respond: (_) async =>
          jsonResponse({'message': 'Please sign in again.'}, 401),
    );
    addTearDown(auth.dispose);
    await auth.restoreSession();
    expect(calls.single.arguments['token'], isNull);
    expect(calls.single.arguments['userId'], isNull);
  });

  Future<WorkspaceController> showCard(WidgetTester tester) async {
    final auth = makeController(
      notifications: NotificationBridge(),
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    await auth.restoreSession();
    final store = WorkspaceController(auth);
    addTearDown(() {
      store.dispose();
      auth.dispose();
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: NotificationTrackingCard(store: store),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return store;
  }

  testWidgets('consent comes before notification access and can be declined', (
    tester,
  ) async {
    await showCard(tester);
    expect(find.text('Off. Nothing is being tracked.'), findsOneWidget);
    await tester.tap(find.text('Enable tracking'));
    await tester.pumpAndSettle();
    expect(find.text('Allow new notification tracking?'), findsOneWidget);
    expect(calls.where((call) => call.method == 'enable'), isEmpty);
    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();
    expect(calls.where((call) => call.method == 'enable'), isEmpty);
  });

  testWidgets(
    'permission state, pending expenses and stop action are visible',
    (tester) async {
      await showCard(tester);
      await tester.tap(find.text('Enable tracking'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allow and open settings'));
      await tester.pumpAndSettle();
      expect(
        find.text('Waiting for Android notification access.'),
        findsOneWidget,
      );
      expect(
        find.text('2 waiting to save · 3 processed on this phone'),
        findsOneWidget,
      );
      expect(find.text('Open access settings'), findsOneWidget);
      await tester.tap(find.text('Stop tracking'));
      await tester.pumpAndSettle();
      expect(enabled, isFalse);
      expect(find.text('Off. Nothing is being tracked.'), findsOneWidget);
    },
  );

  testWidgets('native errors are not hidden by a status refresh', (
    tester,
  ) async {
    failEnable = true;
    await showCard(tester);
    await tester.tap(find.text('Enable tracking'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Allow and open settings'));
    await tester.pumpAndSettle();
    expect(find.text('Please sign in again.'), findsOneWidget);
    expect(find.text('Off. Nothing is being tracked.'), findsOneWidget);
  });

  testWidgets('notification consent fits a small phone with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(280, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await showCard(tester);
    await tester.ensureVisible(find.text('Enable tracking'));
    await tester.tap(find.text('Enable tracking'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Not now'));
    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(calls.where((call) => call.method == 'enable'), isEmpty);
  });

  testWidgets('app resume reports native sync errors without crashing', (
    tester,
  ) async {
    await showCard(tester);
    failSync = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Could not read the waiting list.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
