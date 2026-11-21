import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/khata/text_import.dart';

void main() {
  final now = DateTime(2026, 11, 18);
  List<ImportLine> parse(String s) => KhataTextImport.parse(s, now: now);

  test('name heading, plus and minus, notes in brackets, dates', () {
    final l = parse(
      'Maa - 68000 + 17000( maa) -20000(rakesh mama) - 5000 varun 7 oct',
    );
    expect(l.map((e) => e.signedPaise ~/ 100), [68000, 17000, -20000, -5000]);
    expect(l[2].note, 'rakesh mama');
    expect(l[3].note, 'varun');
    expect(l[3].date, DateTime(2026, 10, 7));
    expect(KhataTextImport.total(l) ~/ 100, 60000);
  });

  test('k / lac / lakh, glued words, dates are not amounts', () {
    final l = parse(
      '50000sent(amex card 10 march) + 50k sbi debit card + 1lac recived 29 oct + 1.5 lakh + 5100(canteen 3sep)',
    );
    expect(l.map((e) => e.amountPaise ~/ 100), [
      50000,
      50000,
      100000,
      150000,
      5100,
    ]);
    expect(l[0].date, DateTime(2026, 3, 10));
    expect(l[0].note, 'sent amex card');
    expect(l[4].date, DateTime(2026, 9, 3));
  });

  test('bracket of sums counts as one amount; future date means last year', () {
    final l = parse('100000−(47826+40000) + 3526 sbi (9 dec)');
    expect(l.map((e) => e.signedPaise ~/ 100), [100000, -87826, 3526]);
    expect(l[2].date, DateTime(2025, 12, 9));
  });

  test('text without a number becomes a note on the line before', () {
    final l = parse(
      '- 50000(neha 5 oct) {minus from dada ji} - 11300 (maruti 12 nov)',
    );
    expect(l, hasLength(2));
    expect(l[0].note, contains('minus from dada ji'));
    expect(l[1].note, 'maruti');
  });

  test('a forgotten closing bracket does not swallow the next lines', () {
    final l = parse(
      '- 5100 canteen (10k got cancelled for crackers(4850 and sweets 4500 ) -11300 (hyundai 12 nov)',
    );
    expect(l.map((e) => e.signedPaise ~/ 100), [-5100, -11300]);
  });

  test('Indian spacing and commas', () {
    expect(parse('1 34250')[0].amountPaise ~/ 100, 134250);
    expect(parse('1,34,250 rent')[0].amountPaise ~/ 100, 134250);
    expect(parse('e-mail refund 500')[0].note, 'e-mail refund');
  });

  test('each new line is a new entry', () {
    final l = parse('Lent 2000 for bike 3 jan\nGot back 500 4 feb');
    expect(l, hasLength(2));
    expect(l[1].note, 'Got back');
  });
}
