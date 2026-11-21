import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/ocr/account_list_parser.dart';
import 'package:lifeos_mobile/money/ocr/screenshot_parser.dart';

List<OcrLine> rows(List<String> texts) => [
  for (var i = 0; i < texts.length; i++)
    OcrLine(
      texts[i],
      left: 200,
      top: 100.0 + i * 120,
      right: 900,
      bottom: 140.0 + i * 120,
    ),
];

List<String> keys(List<FoundAccount> a) => a.map((x) => x.toString()).toList();

void main() {
  test('Google Pay "Check balance" list (user screenshot text)', () {
    final found = AccountListParser.parse(
      rows([
        '10:21',
        '94',
        'Check balance',
        'State Bank of India 6390',
        'HDFC Bank 8981',
        'YES BANK',
        'Yes Bank 0091',
        'slice',
        'small finance bank',
        'Slice Small Finance Bank 0949',
        'HDFC Bank Credit card 91',
        'Wi-Fi network not secure.',
        'Disconnect now',
      ]),
    );
    expect(keys(found), [
      'SBI|6390|savings',
      'HDFC Bank|8981|savings',
      'Yes Bank|0091|savings',
      'Slice Small Finance Bank|0949|savings',
      'HDFC Bank|91|creditCard',
    ]);
    expect(found.last.nickname, 'HDFC Bank Credit Card ••91');
    expect(found.first.nickname, 'SBI ••6390');
  });

  test('PhonePe / Paytm / bank-app styles', () {
    final found = AccountListParser.parse(
      rows([
        'Bank accounts',
        'HDFC Bank - 8981',
        'ICICI Bank',
        'XXXXXXXX4321',
        'Axis Bank Savings A/c •• 7788',
        'Kotak Bank',
        'A/c No. **5566',
        'Paytm Wallet 1234',
        'SBI Current Account XX2468',
        'Amex 1005',
      ]),
    );
    expect(keys(found), [
      'HDFC Bank|8981|savings',
      'ICICI Bank|4321|savings',
      'Axis Bank|7788|savings',
      'Kotak Bank|5566|savings',
      'Paytm Wallet|1234|wallet',
      'SBI|2468|current',
      'Amex|1005|savings',
    ]);
  });

  test('amounts, times, dates and plain text are not accounts', () {
    final found = AccountListParser.parse(
      rows([
        '11:08 PM, 18 Nov \'26',
        '₹1,250',
        'Balance Rs. 4500',
        'HDFC Bank balance 1,234',
        'Paid to AJOY SEN',
        'Offer 50%',
        'Ref 123456789012',
        'State Bank of India 12.50',
      ]),
    );
    expect(found, isEmpty);
  });

  test('same account twice is kept once', () {
    final found = AccountListParser.parse(
      rows(['HDFC Bank 8981', 'HDFC Bank •• 8981']),
    );
    expect(keys(found), ['HDFC Bank|8981|savings']);
  });
}
