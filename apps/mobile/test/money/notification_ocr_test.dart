import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/models.dart';
import 'package:lifeos_mobile/money/ocr/screenshot_parser.dart';
import 'package:lifeos_mobile/money/parsing/notification_parser.dart';

void main() {
  final np = NotificationParser();
  final t = DateTime(2026, 11, 15, 10);

  group('notification parser', () {
    test('PhonePe paid', () {
      final p = np.parse(
        packageName: 'com.phonepe.app',
        title: 'Payment successful',
        text: 'Paid ₹450 to Sharma Grocery',
        postedAt: t,
      )!;
      expect(p.amountPaise, 45000);
      expect(p.direction, TxnDirection.debit);
      expect(p.merchant, 'Sharma Grocery');
      expect(p.bankName, 'PhonePe');
      expect(p.channel, TxnChannel.upi);
    });
    test('Google Pay "you paid"', () {
      final p = np.parse(
        packageName: 'com.google.android.apps.nbu.paisa.user',
        title: 'Payment sent',
        text: 'You paid ₹1,250.50 to Dosa Corner',
        postedAt: t,
      )!;
      expect(p.amountPaise, 125050);
      expect(p.merchant, 'Dosa Corner');
    });
    test('received money', () {
      final p = np.parse(
        packageName: 'net.one97.paytm',
        title: 'Money received',
        text: 'Received Rs.2,000 from Rahul Kumar',
        postedAt: t,
      )!;
      expect(p.direction, TxnDirection.credit);
      expect(p.amountPaise, 200000);
      expect(p.merchant, 'Rahul Kumar');
    });
    test('"X sent you" credit', () {
      final p = np.parse(
        packageName: 'com.google.android.apps.nbu.paisa.user',
        title: 'Amit',
        text: 'Amit sent you ₹300',
        postedAt: t,
      )!;
      expect(p.direction, TxnDirection.credit);
    });
    test('bank app notification falls back to SMS engine', () {
      final p = np.parse(
        packageName: 'com.snapwork.hdfc',
        title: 'HDFC Bank',
        text: 'Rs.500.00 debited from A/c XX1234 to SWIGGY. Ref 998877665544',
        postedAt: t,
      )!;
      expect(p.amountPaise, 50000);
      expect(p.accountSuffix, '1234');
    });
    test('requests, rewards and reminders are ignored', () {
      expect(
        np.parse(
          packageName: 'com.google.android.apps.nbu.paisa.user',
          title: 'Rahul',
          text: 'Rahul is requesting ₹500',
          postedAt: t,
        ),
        isNull,
      );
      expect(
        np.parse(
          packageName: 'com.phonepe.app',
          title: 'Cashback won!',
          text: 'You won ₹20 cashback. Scratch card inside',
          postedAt: t,
        ),
        isNull,
      );
      expect(
        np.parse(
          packageName: 'net.one97.paytm',
          title: 'Bill due',
          text: 'Electricity bill of ₹1,200 is due on 20 Nov. Pay now',
          postedAt: t,
        ),
        isNull,
      );
      expect(
        np.parse(
          packageName: 'com.phonepe.app',
          title: 'Hi',
          text: 'Your app is up to date',
          postedAt: t,
        ),
        isNull,
      );
    });
  });

  group('screenshot OCR parser', () {
    final engine = ScreenshotParserEngine();
    final ref = DateTime(2026, 11, 15, 18);

    test('detail receipt with reference', () {
      final lines = [
        const OcrLine('₹450'),
        const OcrLine('Paid to'),
        const OcrLine('Sharma Grocery'),
        const OcrLine('Completed'),
        const OcrLine('15 Nov 2026, 10:22 am'),
        const OcrLine('UPI transaction ID'),
        const OcrLine('432109876543'),
        const OcrLine('Paid with UPI Lite'),
      ];
      final r = engine.parse(lines, reference: ref);
      expect(r, hasLength(1));
      expect(r.first.amountPaise, 45000);
      expect(r.first.merchant, 'Sharma Grocery');
      expect(r.first.reference, '432109876543');
      expect(r.first.occurredAt, DateTime(2026, 11, 15, 10, 22));
      expect(r.first.status, TxnStatus.cleared);
      expect(r.first.layout, 'detail');
    });

    test('history list with geometry (multiple rows)', () {
      OcrLine l(String s, double left, double top) =>
          OcrLine(s, left: left, top: top, right: left + 200, bottom: top + 30);
      final lines = [
        l('UPI Lite history', 20, 40),
        l('Sharma Grocery', 80, 200),
        l('₹45', 820, 200),
        l('14 Nov, 8:15 pm', 80, 240),
        l('Chai Point', 80, 340),
        l('₹20', 820, 340),
        l('15 Nov, 9:02 am', 80, 380),
        l('Metro Card Recharge', 80, 480),
        l('₹200', 820, 480),
        l('15 Nov, 9:30 am', 80, 520),
        l('Failed', 820, 520),
      ];
      final r = engine.parse(lines, reference: ref);
      expect(r, hasLength(3));
      expect(r[0].merchant, 'Sharma Grocery');
      expect(r[0].amountPaise, 4500);
      expect(r[0].occurredAt, DateTime(2026, 11, 14, 20, 15));
      expect(r[1].merchant, 'Chai Point');
      expect(r[2].status, TxnStatus.failed);
      expect(r.every((x) => x.layout == 'history'), isTrue);
    });

    test('history list without geometry (sequential fallback)', () {
      final lines = [
        const OcrLine('Dosa Corner'),
        const OcrLine('- ₹80'),
        const OcrLine('13 Nov, 1:10 pm'),
        const OcrLine('Rahul'),
        const OcrLine('+ ₹500'),
        const OcrLine('12 Nov, 6:00 pm'),
      ];
      final r = engine.parse(lines, reference: ref);
      expect(r, hasLength(2));
      expect(r[0].direction, TxnDirection.debit);
      expect(r[1].direction, TxnDirection.credit);
      expect(r[1].merchant, 'Rahul');
    });

    test('missing fields are reported', () {
      final r = engine.parse([
        const OcrLine('₹99'),
        const OcrLine('Transaction successful'),
        const OcrLine('UPI Ref No 998877665544'),
      ], reference: ref);
      expect(r, hasLength(1));
      expect(r.first.missingFields, containsAll(['date', 'merchant']));
    });

    // Line sequences exactly as on-device ML Kit returned them for rendered
    // UPI receipts (see integration_test/screenshot_ocr_test.dart).
    group('real OCR output (₹ dropped or read as 7)', () {
      List<OcrLine> seq(List<String> t, {Map<int, bool>? glyph}) => [
        for (final (i, x) in t.indexed) OcrLine(x, rupeeGlyph: glyph?[i]),
      ];

      test('"To X" receipt, ₹ read as 7, glyph check says ₹', () {
        final r = engine.parse(
          seq(
            [
              '1:43',
              'To Ramesh Kumar',
              '+91 98XXXXXX21',
              '71,250',
              '✔ Completed',
              '17 Nov 2026, 1:42 pm',
              'UPI transaction ID',
              '431987654321',
              'To: RAMESH KUMAR',
              'Google Pay ramesh.k@okaxis',
              'From: JATEEN YADAV (HDFC Bank)',
              'jateen@okhdfcbank',
              'Google transaction ID',
              'CICAgOjm7a2dZA',
              '5G 82%',
            ],
            glyph: {3: true},
          ),
          reference: ref,
        );
        expect(r, hasLength(1));
        expect(r.single.amountPaise, 125000);
        expect(
          r.single.direction,
          TxnDirection.debit,
          reason: '"From:" in the details card must not flip it',
        );
        expect(r.single.merchant, 'Ramesh Kumar');
        expect(r.single.reference, '431987654321');
        expect(r.single.occurredAt, DateTime(2026, 11, 17, 13, 42));
      });

      test('genuine leading 7 is kept when glyph check says 7', () {
        final r = engine.parse(
          seq(
            [
              'To Chai Point',
              '7750',
              'Completed',
              '15 Nov 2026, 7:30 pm',
              'UPI transaction ID',
              '431555666777',
            ],
            glyph: {1: false},
          ),
          reference: ref,
        );
        expect(r.single.amountPaise, 775000);
      });

      test(
        '"Paid to" receipt: amount confirmed by a second copy ("7349" + "349")',
        () {
          final r = engine.parse(
            seq([
              'Transaction Successful',
              '01:42 pm on 17 Nov 2026',
              'Paid to',
              'Sharma General Store',
              'sharmastore @ybl',
              'Transaction ID',
              'T2611171342123456789012',
              'Debited from',
              'XXXXXX4321',
              'UTR: 431987650011',
              '349',
              '7349',
            ]),
            reference: ref,
          );
          expect(r.single.amountPaise, 34900);
          expect(r.single.merchant, 'Sharma General Store');
          expect(
            r.single.reference,
            '431987650011',
            reason: '12-digit UTR preferred over app transaction ID',
          );
        },
      );

      test('"Paid Successfully to", ₹ dropped, no year in date', () {
        final r = engine.parse(
          seq([
            'Paid Successfully to',
            'Zomato Ltd',
            'zomato.payu@hdfcbank',
            '486',
            '17 Nov, 08:15 PM',
            'UPI Ref No: 431912345678',
            'From: State Bank of India - 1234',
          ]),
          reference: ref,
        );
        expect(r.single.amountPaise, 48600);
        expect(r.single.merchant, 'Zomato Ltd');
        expect(r.single.occurredAt, DateTime(2026, 11, 17, 20, 15));
      });

      test('"From X" receipt is money received; "2,000" is not a year', () {
        final r = engine.parse(
          seq([
            '9:06',
            'From Priya Singh',
            '2,000',
            'V Completed',
            '16 Nov 2026, 9:05 am',
            'UPI transaction ID',
            '431100223344',
            'To: JATEEN YADAV',
            'jateen@okhdfcbank',
            'From: PRIYA SINGH (State Bank of India)',
          ]),
          reference: ref,
        );
        expect(r.single.amountPaise, 200000);
        expect(r.single.direction, TxnDirection.credit);
        expect(r.single.merchant, 'Priya Singh');
      });

      test('biggest font wins over small numbers when geometry is known', () {
        OcrLine l(String s, double top, double h) =>
            OcrLine(s, left: 40, top: top, right: 300, bottom: top + h);
        final r = engine.parse([
          l('To Dosa Corner', 100, 40),
          l('120', 160, 110),
          l('Completed', 290, 40),
          l('UPI transaction ID', 400, 30),
          l('431000111222', 440, 34),
          l('Paid with 2 offers, saved 15', 500, 30),
        ], reference: ref);
        expect(r.single.amountPaise, 12000);
      });
    });

    test(
      'Tata Neu receipt, OCR lines out of screen order (real phone output)',
      () {
        // Exact lines + boxes ML Kit returned for a real Tata Neu UPI receipt.
        OcrLine l(String t, double top, double h, {double left = 80}) =>
            OcrLine(
              t,
              left: left,
              top: top,
              right: left + 400,
              bottom: top + h,
            );
        final lines = [
          l('Paid to', 581, 31),
          l('259', 255, 53, left: 450),
          l('12:54 PM, 17 Nov "26-RRN: 668752185079', 446, 22, left: 250),
          l('4 Successfully Paid', 369, 33, left: 350),
          l('Maiz Mexican Kitchen', 670, 26, left: 193),
          l('Paid from', 864, 31),
          l('paytm.s1100nz@pty', 720, 30, left: 193),
          l('JATEEN YADAV', 954, 25, left: 193),
          l('HDFC BANK CREDIT CARD 652926 •... 91', 1004, 23, left: 193),
          l('Credit Card', 1113, 19, left: 212),
          l('.. .6788@tnaxis', 1043, 37, left: 193),
          l('TXN ID: AXB6e28b34aa27d454283b2bb29a223641f', 1194, 31, left: 126),
          l('TATA', 1351, 14, left: 410),
          l('NEU', 1372, 25, left: 410),
          l('|LIPI»', 1347, 39, left: 505),
          l('UNIFIED PAYMENTS INTERFACE', 1390, 7, left: 505),
        ];
        expect(DetailScreenParser().score(lines), greaterThanOrEqualTo(80));
        final t = engine.parse(lines, reference: ref).single;
        expect(t.amountPaise, 25900);
        expect(t.direction, TxnDirection.debit);
        expect(t.merchant, 'Maiz Mexican Kitchen');
        expect(t.reference, '668752185079');
        expect(t.occurredAt, DateTime(2026, 11, 17, 12, 54));
        expect(t.status, TxnStatus.cleared);
      },
    );
    test('non-payment screenshot yields nothing', () {
      expect(
        engine.parse([
          const OcrLine('Hello world'),
          const OcrLine('Settings'),
        ], reference: ref),
        isEmpty,
      );
    });
  });
}
