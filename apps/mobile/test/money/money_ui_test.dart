import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/capture/ocr_service.dart';
import 'package:lifeos_mobile/money/ocr/screenshot_parser.dart';
import 'package:lifeos_mobile/money/ui/khata_contact.dart';
import 'package:lifeos_mobile/money/ui/khata_import.dart';
import 'package:lifeos_mobile/money/ui/overview_tab.dart';
import 'package:lifeos_mobile/money/ui/photos.dart';
import 'package:lifeos_mobile/money/ui/transactions_tab.dart';
import 'package:lifeos_mobile/money/ui/txn_sheets.dart';
import 'support.dart';

class FakePhotos implements PhotoSource {
  @override
  Future<Uint8List?> pick({required bool camera}) async =>
      Uint8List.fromList([1, 2, 3]);
  @override
  Future<List<String>> pickPaths() async => ['/tmp/old-khata.png'];
}

void main() {
  testWidgets('Money overview shows spent, income, net, budget and charts', (
    tester,
  ) async {
    final fake = FakeMoney({
      'GET /overview': (_) => {
        'month': '2026-11',
        'spentMinor': 1234550,
        'incomeMinor': 5000000,
        'netMinor': 3765450,
        'budget': {'limitMinor': 2000000, 'usedMinor': 1234550},
        'byCategory': [
          {'category': 'Food', 'minor': 800000},
          {'category': 'Travel', 'minor': 434550},
        ],
        'daily': [
          for (var d = 1; d <= 30; d++)
            {
              'date': '2026-11-${d.toString().padLeft(2, '0')}',
              'minor': d * 1000,
            },
        ],
        'trend': [
          for (var m = 1; m <= 12; m++)
            {
              'month': '2026-${m.toString().padLeft(2, '0')}',
              'spentMinor': m * 100000,
              'incomeMinor': 500000,
            },
        ],
        'topMerchants': [
          {'title': 'Swiggy', 'minor': 300000, 'count': 6},
        ],
        'netWorthMinor': 9000000,
        'khata': {'owedToMeMinor': 50000, 'iOweMinor': 20000},
        'reviewCount': 2,
        'leftCount': 1,
        'reimburse': {'waitingMinor': 120000, 'waitingCount': 1},
        'comingUp': [],
      },
    });
    tester.view.physicalSize = const Size(1000, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = fake.store();
    await tester.pumpWidget(
      host(
        Scaffold(
          body: OverviewTab(store: store, onOpenTab: (_) {}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      fake.where('GET', '/overview').single.path,
      '/overview?month=2026-11',
    );
    expect(find.text('₹12,345.50'), findsOneWidget);
    expect(find.text('₹50,000'), findsOneWidget);
    expect(find.text('+₹37,654.50'), findsOneWidget);
    expect(find.text('₹12,345.50 of ₹20,000'), findsOneWidget);
    expect(find.text('Spending by day'), findsOneWidget);
    expect(find.text('Where it went'), findsOneWidget);
    expect(find.text('Last 12 months'), findsOneWidget);
    expect(find.text('₹1,200'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'khata contact lists app entries first and opening entries last under the heading',
    (tester) async {
      final fake = FakeMoney({
        'GET /khata/contacts/c1': (_) => {
          'contact': {'id': 'c1', 'name': 'Dadaji'},
          'balance': {
            'actualMinor': -2000000,
            'adjustedMinor': -2000000,
            'givenMinor': 100000,
            'receivedMinor': 2100000,
          },
          'entries': [
            {
              'id': 'e3',
              'direction': 'gave',
              'amountMinor': 100000,
              'date': '2026-11-20',
              'note': 'Recent',
              'isOpening': false,
              'runningMinor': -2000000,
            },
            {
              'id': 'o1',
              'direction': 'got',
              'amountMinor': 2100000,
              'date': '2026-12-01',
              'note': 'Old notebook',
              'isOpening': true,
              'runningMinor': -2100000,
            },
            {
              'id': 'e2',
              'direction': 'gave',
              'amountMinor': 1,
              'date': '2026-10-01',
              'note': 'Older app entry',
              'isOpening': false,
              'runningMinor': -2100000,
            },
          ],
          'adjustments': [],
          'photos': [],
        },
      });
      final store = fake.store();
      await tester.pumpWidget(
        host(KhataContactScreen(store: store, contactId: 'c1', name: 'Dadaji')),
      );
      await tester.pumpAndSettle();
      expect(find.text('You owe Dadaji ₹20,000'), findsOneWidget);
      final heading = find.text(openingHeading);
      await tester.scrollUntilVisible(
        find.byKey(const Key('entry_o1')),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(heading, findsOneWidget);
      double y(Finder f) => tester.getTopLeft(f).dy;
      expect(
        y(find.byKey(const Key('entry_e3'))),
        lessThan(y(find.byKey(const Key('entry_e2')))),
      );
      expect(y(find.byKey(const Key('entry_e2'))), lessThan(y(heading)));
      expect(y(heading), lessThan(y(find.byKey(const Key('entry_o1')))));
    },
  );

  testWidgets(
    '"paid for something of mine" switch shows exact subtitles and sends paidForMe',
    (tester) async {
      final fake = FakeMoney({
        'GET /khata/contacts/c1': (_) => {
          'contact': {'id': 'c1', 'name': 'Rohan'},
          'balance': {'actualMinor': 0, 'adjustedMinor': 0},
          'entries': [],
          'adjustments': [],
          'photos': [],
        },
        'POST /khata/contacts/c1/entries': (_) => {
          'entry': {'id': 'n1'},
        },
      });
      await tester.pumpWidget(
        host(
          KhataContactScreen(
            store: fake.store(),
            contactId: 'c1',
            name: 'Rohan',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('khata_got')));
      await tester.pumpAndSettle();
      expect(find.text('Rohan paid for something of mine'), findsOneWidget);
      expect(
        find.text('Off: Rohan gave or sent you money. Not your spending.'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('entry_paid_for_me')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'With their card / UPI / cash. You owe Rohan, and it counts as your spending (charts too).',
        ),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const Key('entry_amount')), '1,250.50');
      await tester.enterText(find.byKey(const Key('entry_note')), 'Flight');
      await tester.ensureVisible(find.byKey(const Key('save_entry')));
      await tester.tap(find.byKey(const Key('save_entry')));
      await tester.pumpAndSettle();
      final body = fake
          .where('POST', '/khata/contacts/c1/entries')
          .single
          .body!;
      expect(body['direction'], 'got');
      expect(body['amountMinor'], 125050);
      expect(body['paidForMe'], true);
      expect(body['note'], 'Flight');
      expect(body['category'], 'Other');
    },
  );

  testWidgets(
    'reimbursement claim is capped at own part; received sheet previews the split',
    (tester) async {
      final fake = FakeMoney({
        'POST /txns/d1/reimburse/claim': (_) => {
          'txn': {'id': 'd1', 'reimburseTag': 'claim', 'reimburseMinor': 60000},
        },
        'GET /reimbursements': (_) => {
          'waitingMinor': 150000,
          'items': [
            {
              'waiting': true,
              'txn': {
                'id': 'a',
                'title': 'Hotel',
                'date': '2026-11-01',
                'reimburseMinor': 100000,
              },
            },
            {
              'waiting': true,
              'txn': {
                'id': 'b',
                'title': 'Cab',
                'date': '2026-11-02',
                'reimburseMinor': 50000,
              },
            },
          ],
        },
        'POST /txns/c9/reimburse/received': (_) => {
          'matchedMinor': 120000,
          'extraMinor': 0,
          'shortMinor': 30000,
        },
      });
      final store = fake.store();
      late BuildContext ctx;
      await tester.pumpWidget(
        host(
          Scaffold(
            body: Builder(
              builder: (c) {
                ctx = c;
                return const SizedBox();
              },
            ),
          ),
        ),
      );
      showClaimSheet(ctx, store, {
        'id': 'd1',
        'amountMinor': 100000,
        'peerShareMinor': 40000,
        'direction': 'debit',
        'peerTag': 'owe_owner',
        'contactName': 'Rohan',
      });
      await tester.pumpAndSettle();
      expect(find.text('Up to ₹600 (your part)'), findsOneWidget);
      expect(find.byKey(const Key('claim_owner_note')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('claim_amount')), '700');
      await tester.pump();
      expect(find.text('That is more than your part.'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('claim_save')))
            .onPressed,
        isNull,
      );
      await tester.enterText(find.byKey(const Key('claim_amount')), '600');
      await tester.pump();
      await tester.tap(find.byKey(const Key('claim_save')));
      await tester.pumpAndSettle();
      expect(fake.where('POST', '/txns/d1/reimburse/claim').single.body, {
        'amountMinor': 60000,
      });

      showReceivedSheet(ctx, store, {
        'id': 'c9',
        'amountMinor': 120000,
        'direction': 'credit',
      });
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('reimb_pick_a')));
      await tester.pump();
      expect(
        find.text(
          'Pays back ₹1,000: not income.\nExtra ₹200 is yours: counts as income.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('reimb_pick_b')));
      await tester.pump();
      expect(
        find.text(
          'Pays back ₹1,200: not income.\n₹300 short: counts as your spending.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('reimb_received_save')));
      await tester.pumpAndSettle();
      expect(fake.where('POST', '/txns/c9/reimburse/received').single.body, {
        'claimIds': ['a', 'b'],
      });
    },
  );

  testWidgets(
    'bulk import from a screenshot saves only totals and attaches the photo',
    (tester) async {
      photoSource = FakePhotos();
      ocrService = FakeOcrService(const [
        OcrLine('Dadaji - 50000 + 2000'),
        OcrLine('Maa - 68000'),
      ]);
      readPhotoForUpload = (_) async => Uint8List.fromList([9, 9]);
      final fake = FakeMoney({
        'POST /khata/import/parse': (call) => {
          'people': [
            {
              'name': 'Dadaji',
              'lines': [
                {'signedMinor': 5000000, 'note': ''},
                {'signedMinor': 200000, 'note': ''},
              ],
              'linesMinor': 5200000,
              'statedMinor': 5100000,
              'choice': 'linesAndFix',
            },
            {
              'name': 'Maa',
              'lines': [
                {'signedMinor': 6800000, 'note': ''},
              ],
              'linesMinor': 6800000,
              'statedMinor': null,
              'choice': 'lines',
            },
          ],
        },
        'POST /photos': (_) => {'id': 'p1'},
        'POST /khata/import/save': (_) => {'ok': true},
      });
      await tester.pumpWidget(host(KhataBulkImportScreen(store: fake.store())));
      await tester.tap(find.byKey(const Key('bulk_from_shot')));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<SwitchListTile>(find.byKey(const Key('bulk_only_totals')))
            .value,
        isTrue,
      );
      await tester.tap(find.byKey(const Key('bulk_read')));
      await tester.pumpAndSettle();
      expect(
        fake.where('POST', '/khata/import/parse').single.body!['mode'],
        'bulk',
      );
      expect(
        fake.where('POST', '/khata/import/parse').single.body!['text'],
        contains('Dadaji'),
      );
      expect(find.text('After saving: You owe Dadaji ₹51,000'), findsOneWidget);
      await tester.tap(find.byKey(const Key('bulk_save')));
      await tester.pumpAndSettle();
      final photo = fake.where('POST', '/photos').single.body!;
      expect(photo['ownerType'], 'khata_contact');
      expect(photo['mime'], 'image/jpeg');
      final save = fake.where('POST', '/khata/import/save').single.body!;
      expect(
        [for (final p in save['people'] as List) p['choice']],
        ['totalOnly', 'totalOnly'],
      );
      expect(save['photoIds'], ['p1']);
    },
  );

  testWidgets(
    'transactions filter sends query params; swipe-left delete asks first',
    (tester) async {
      final txns = [
        {
          'id': 't1',
          'title': 'Swiggy',
          'amountMinor': 45000,
          'direction': 'debit',
          'date': '2026-11-21',
          'category': 'Food',
          'channel': 'UPI',
        },
        {
          'id': 't2',
          'title': 'Salary',
          'amountMinor': 5000000,
          'direction': 'credit',
          'date': '2026-11-01',
          'category': 'Salary',
          'channel': 'NetBanking',
        },
      ];
      final fake = FakeMoney({
        'GET /txns': (_) => {'items': txns},
        'DELETE /txns/t1': (_) => {},
      });
      await tester.pumpWidget(
        host(Scaffold(body: TransactionsTab(store: fake.store()))),
      );
      await tester.pumpAndSettle();
      expect(find.text('Swiggy'), findsOneWidget);
      await tester.tap(find.byKey(const Key('txn_filter_Spent')));
      await tester.pumpAndSettle();
      expect(fake.calls.last.path, contains('direction=debit'));
      expect(fake.calls.last.path, contains('from=2026-11-01'));
      await tester.tap(find.byKey(const Key('txn_filter_To review')));
      await tester.pumpAndSettle();
      expect(fake.calls.last.path, contains('review=1'));
      await tester.tap(find.byKey(const Key('txn_filter_All')));
      await tester.pumpAndSettle();
      await tester.drag(find.byKey(const Key('txn_t1')), const Offset(-500, 0));
      await tester.pumpAndSettle();
      expect(find.text('Delete this payment?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(fake.where('DELETE', '/txns/t1'), isEmpty);
      expect(find.text('Swiggy'), findsOneWidget);
      await tester.drag(find.byKey(const Key('txn_t1')), const Offset(-500, 0));
      await tester.pumpAndSettle();
      txns.removeAt(0);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(fake.where('DELETE', '/txns/t1').length, 1);
      expect(find.text('Swiggy'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('peer sheet split sends peerTag split with people count', (
    tester,
  ) async {
    final fake = FakeMoney({
      'POST /txns/t5/peer': (_) => {
        'txn': {'id': 't5', 'peerTag': 'split'},
      },
    });
    late BuildContext ctx;
    await tester.pumpWidget(
      host(
        Scaffold(
          body: Builder(
            builder: (c) {
              ctx = c;
              return const SizedBox();
            },
          ),
        ),
      ),
    );
    showPeerSheet(ctx, fake.store(), {
      'id': 't5',
      'title': 'RAHUL SHARMA',
      'amountMinor': 90000,
      'direction': 'debit',
    });
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('peer_people_3')));
    await tester.pump();
    expect(find.text('Split bill: Rahul Sharma owes ₹600'), findsOneWidget);
    await tester.tap(find.byKey(const Key('peer_split')));
    await tester.pumpAndSettle();
    expect(fake.calls.single.body, {
      'peerTag': 'split',
      'contactName': 'Rahul Sharma',
      'splitPeople': 3,
    });
  });
}
