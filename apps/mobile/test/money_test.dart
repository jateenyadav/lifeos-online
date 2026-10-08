import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/spending/money_editor.dart';
import 'package:lifeos_mobile/spending/money_hub.dart';
import 'package:lifeos_mobile/spending/money_utils.dart';
import 'package:lifeos_mobile/workspaces/workspace_controller.dart';
import 'support/auth_fixture.dart';

class MoneyStore extends WorkspaceController {
  MoneyStore(super.auth) {
    loading = false;
    loaded = true;
  }
  final calls = <Map<String, dynamic>>[];
  bool succeeds = true;
  @override
  Future<bool> moneyCommand(String path, Map<String, dynamic> values) async {
    calls.add({'path': path, 'values': values});
    return succeeds;
  }
}

const pendingPayment = {
  'id': 'payment',
  'status': 'pending',
  'title': 'New payment',
  'amountMinor': 12505,
  'date': '2026-10-07',
  'kind': 'expense',
  'direction': 'outgoing',
  'person': '',
  'recipientKey': '',
  'category': 'Other',
  'payment': 'UPI',
  'note': '',
  'remember': false,
};

void main() {
  Future<MoneyStore> makeStore() async {
    final auth = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    await auth.restoreSession();
    final store = MoneyStore(auth);
    addTearDown(store.dispose);
    addTearDown(auth.dispose);
    return store;
  }

  Future<void> openEditor(
    WidgetTester tester,
    MoneyStore store, {
    String mode = 'payment',
    Map<String, dynamic>? entry,
    Map<String, dynamic>? trip,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => MoneyEditor(
                  store: store,
                  mode: mode,
                  entry: entry,
                  trip: trip,
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.widgetWithText(TextFormField, label);

  test(
    'people count returns and further lending but not unconfirmed entries',
    () {
      final result = peopleBalances([
        {
          'kind': 'lent',
          'amountMinor': 100000,
          'person': 'Ria',
          'status': 'confirmed',
        },
        {
          'kind': 'repayment_received',
          'amountMinor': 40000,
          'person': 'Ria',
          'status': 'confirmed',
        },
        {
          'kind': 'lent',
          'amountMinor': 20000,
          'person': 'Ria',
          'status': 'confirmed',
        },
        {
          'kind': 'lent',
          'amountMinor': 90000,
          'person': 'Ria',
          'status': 'pending',
        },
      ]);
      expect(result.single['balance'], 80000);
      expect(result.single['gave'], 120000);
      expect(result.single['received'], 40000);
    },
  );

  test('trip repayments preserve every paise without changing expenses', () {
    final trip = {
      'id': 'trip',
      'members': ['Me', 'Ria', 'Sam'],
    };
    final items = [
      {
        'tripId': 'trip',
        'payer': 'Me',
        'participants': ['Me', 'Ria', 'Sam'],
        'amountMinor': 10001,
      },
      {
        'tripId': 'trip',
        'payer': 'Ria',
        'participants': ['Me'],
        'amountMinor': 3334,
      },
    ];
    expect(splitBalances(trip, items), {'Me': 3333, 'Ria': 0, 'Sam': -3333});
    expect(moneyClientKey(), matches(RegExp(r'^[a-f0-9]{32}$')));
  });

  testWidgets('payment review remembers purpose and person, never the amount', (
    tester,
  ) async {
    final store = await makeStore();
    store.data['payees'] = [
      {
        'recipientKey': '+9876543210',
        'title': 'Lunch',
        'person': 'Ria',
        'category': 'Food',
        'kind': 'expense',
      },
    ];
    await openEditor(tester, store, entry: pendingPayment);
    await tester.ensureVisible(field('UPI ID or phone number'));
    await tester.enterText(field('UPI ID or phone number'), '9876543210');
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextFormField>(field('What was this payment for?'))
          .controller!
          .text,
      'Lunch',
    );
    expect(
      tester.widget<TextFormField>(field('Who is this with?')).controller!.text,
      'Ria',
    );
    expect(
      tester
          .widget<TextFormField>(field('Is the amount correct? (INR)'))
          .controller!
          .text,
      '125.05',
    );
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(store.calls.single['path'], 'payments/payment/confirm');
    expect(store.calls.single['values']['amountMinor'], 12505);
    expect(store.calls.single['values']['remember'], true);
    expect(tester.takeException(), isNull);
  });

  testWidgets('incoming payment does not reuse an outgoing recipient type', (
    tester,
  ) async {
    final store = await makeStore();
    store.data['payees'] = [
      {
        'recipientKey': 'ria@upi',
        'title': 'Loan',
        'person': 'Ria',
        'category': 'Other',
        'kind': 'lent',
      },
    ];
    await openEditor(
      tester,
      store,
      entry: {...pendingPayment, 'direction': 'incoming', 'kind': 'income'},
    );
    await tester.ensureVisible(field('UPI ID or phone number'));
    await tester.enterText(field('UPI ID or phone number'), 'ria@upi');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(store.calls.single['values']['kind'], 'income');
  });

  testWidgets('failed payment keeps the draft and the same retry key', (
    tester,
  ) async {
    final store = (await makeStore())..succeeds = false;
    await openEditor(tester, store);
    await tester.enterText(field('What was this payment for?'), 'Lunch');
    await tester.enterText(field('Is the amount correct? (INR)'), '10.01');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(store.calls.length, 2);
    expect(
      store.calls.first['values']['clientKey'],
      store.calls.last['values']['clientKey'],
    );
  });

  testWidgets('money views and split editor fit a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = await makeStore();
    store.data['payments'] = [pendingPayment];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: MoneyHub(store: store)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    for (final tab in ['People', 'Trips', 'Payments']) {
      await tester.tap(find.text(tab));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
    await openEditor(
      tester,
      store,
      mode: 'tripItem',
      trip: {
        'id': 'trip',
        'members': ['Me', 'Ria', 'Sam'],
      },
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Ria'), findsWidgets);
  });
}
