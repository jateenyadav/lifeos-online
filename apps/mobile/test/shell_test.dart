import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/main.dart';
import 'package:lifeos_mobile/money/capture/capture_bridge.dart';
import 'package:lifeos_mobile/theme/theme_controller.dart';
import 'package:lifeos_mobile/theme/tokens.dart';
import 'support/auth_fixture.dart';

void main() {
  Future<void> openMore(WidgetTester tester) async {
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
  }

  testWidgets('theme toggle switches light / dark and is saved on the device', (
    tester,
  ) async {
    final prefs = MemoryPreferenceStore();
    final theme = ThemeController(prefs);
    await theme.load();
    final controller = makeController(
      store: MemoryTokenStore()..token = 's',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller, theme: theme));
    await tester.pumpAndSettle();
    await openMore(tester);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(prefs.values['theme'], 'dark');
    final ctx = tester.element(find.byKey(const Key('theme_toggle')));
    expect(Theme.of(ctx).brightness, Brightness.dark);
    expect(ctx.lc.bg, const Color(0xFF0B1220));
    await tester.tap(find.text('Light'));
    await tester.pumpAndSettle();
    expect(prefs.values['theme'], 'light');
    expect(
      Theme.of(
        tester.element(find.byKey(const Key('theme_toggle'))),
      ).brightness,
      Brightness.light,
    );
    final restored = ThemeController(prefs);
    await restored.load();
    expect(restored.mode, ThemeMode.light);
    await tester.tap(find.byKey(const Key('lumi_toggle')));
    await tester.pumpAndSettle();
    expect(prefs.values['lumi'], 'off');
  });

  for (final available in [false, true]) {
    testWidgets(
      'AI is ${available ? 'shown' : 'hidden'} when LifeOS AI available=$available',
      (tester) async {
        final controller = makeController(
          store: MemoryTokenStore()..token = 's',
          respond: (_) async => jsonResponse({'user': testAccount}),
          aiRespond: (_) async => jsonResponse({
            'lifeos': {'available': available},
          }),
        );
        addTearDown(controller.dispose);
        await controller.restoreSession();
        await tester.pumpWidget(LifeOsApp(controller: controller));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const Key('today_ai')),
          available ? findsOneWidget : findsNothing,
        );
        await openMore(tester);
        expect(
          find.byKey(const Key('more_ai')),
          available ? findsOneWidget : findsNothing,
        );
        expect(find.textContaining('Ollama'), findsNothing);
      },
    );
  }

  testWidgets(
    'home drains the capture queue on start and posts structured fields',
    (tester) async {
      final bridge = FakeCaptureBridge()
        ..queue.add(
          CapturedEvent(
            id: 'q1',
            type: 'sms',
            sender: 'HDFCBK',
            text:
                'Rs.450.00 debited from a/c **1234 on 21-11-26 to VPA rahul@okaxis (UPI Ref No 123456789012).',
            timestamp: DateTime(2026, 11, 21),
          ),
        );
      final ingests = <String>[];
      final controller = makeController(
        store: MemoryTokenStore()..token = 's',
        capture: bridge,
        respond: (_) async => jsonResponse({'user': testAccount}),
        moneyRespond: (request) async {
          if (request.url.path == '/api/money/txns/ingest') {
            ingests.add(request.body);
            return jsonResponse({
              'items': [
                {'status': 'created'},
              ],
            });
          }
          return emptyMoney(request);
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await tester.pumpAndSettle();
      expect(ingests.length, 1);
      expect(ingests.single, contains('"amountMinor":45000'));
      expect(ingests.single, isNot(contains('debited from')));
      expect(bridge.queue, isEmpty);
    },
  );

  testWidgets('automatic tracking is an explicit opt-in with honest limits', (
    tester,
  ) async {
    final bridge = FakeCaptureBridge();
    final controller = makeController(
      store: MemoryTokenStore()..token = 's',
      capture: bridge,
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openMore(tester);
    await tester.tap(find.byKey(const Key('more_capture')));
    await tester.pumpAndSettle();
    expect(find.text('Turn on automatic tracking'), findsOneWidget);
    expect(
      find.textContaining('Raw SMS text never leaves your phone'),
      findsOneWidget,
    );
    expect(bridge.enableSmsCalls, 0);
    await tester.tap(find.byKey(const Key('capture_turn_on')));
    await tester.pumpAndSettle();
    expect(bridge.enableSmsCalls, 1);
    expect(find.byKey(const Key('capture_status')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining('UPI Lite'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.textContaining('iPhone does not let apps read SMS'),
      findsOneWidget,
    );
  });
}
