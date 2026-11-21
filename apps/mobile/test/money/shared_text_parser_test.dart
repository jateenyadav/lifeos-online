import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/models.dart';
import 'package:lifeos_mobile/money/ocr/screenshot_parser.dart';
import 'package:lifeos_mobile/money/ocr/shared_text_parser.dart';

void main() {
  final now = DateTime(2026, 11, 20, 10);

  test('one-sentence share text (app Share button)', () {
    final t = SharedTextParser.parse(
      'I have paid ₹160 to AJOY SEN using Tata Neu UPI. UPI Ref No: 668878203763\nPay with Tata Neu: https://tataneu.com/x',
      now: now,
    ).single;
    expect(t.amountPaise, 16000);
    expect(t.direction, TxnDirection.debit);
    expect(t.merchant, 'Ajoy Sen');
    expect(t.reference, '668878203763');
    expect(t.occurredAt, isNotNull);
  });

  test('receipt copied line by line', () {
    final t = SharedTextParser.parse(
      '₹160\nSuccessfully Paid\n11:08 PM, 18 Nov \'26 · RRN: 668878203763\nPaid to\nAJOY SEN\n••••••6944@superyes',
      now: now,
    ).single;
    expect(t.amountPaise, 16000);
    expect(t.merchant, 'Ajoy Sen');
    expect(t.reference, '668878203763');
    expect(t.occurredAt?.day, 18);
  });

  test('money received text is a credit', () {
    final t = SharedTextParser.parse(
      'Received Rs.2,500 from PRIYA SINGH. UPI Ref 431100223344',
      now: now,
    ).single;
    expect(t.amountPaise, 250000);
    expect(t.direction, TxnDirection.credit);
  });

  test('plain chat text or a promo link is not a payment', () {
    expect(
      SharedTextParser.parse('Check out this offer https://x.y/z', now: now),
      isEmpty,
    );
    expect(SharedTextParser.parse('see you at 5', now: now), isEmpty);
  });

  test(
    'image + text from one share: one payment, gaps filled from the text',
    () {
      const img = ScreenshotTxn(
        amountPaise: 16000,
        merchant: null,
        layout: 'detail',
      );
      final txt = SharedTextParser.parse(
        'Paid ₹160 to AJOY SEN. UPI Ref 668878203763',
        now: now,
      );
      final merged = SharedTextParser.merge([img], txt);
      expect(merged, hasLength(1));
      expect(merged.single.merchant?.toLowerCase(), contains('ajoy'));
      expect(merged.single.reference, '668878203763');
      expect(SharedTextParser.merge(const [], txt), txt);
    },
  );
}
