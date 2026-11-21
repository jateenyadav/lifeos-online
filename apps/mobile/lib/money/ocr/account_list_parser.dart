/// Reads a screenshot of a list of bank accounts / cards, like Google Pay's
/// "Check balance" screen ("State Bank of India 6390", "HDFC Bank Credit card 91"),
/// PhonePe / Paytm bank lists ("HDFC Bank - 8981", "XXXX8981" under the name)
/// or a bank app's account list.
library;

import '../models.dart';
import '../parsing/bank_registry.dart';
import 'screenshot_parser.dart';

class FoundAccount {
  final String bankName;
  final String suffix;
  final AccountType type;

  /// The text it came from, shown so the user can check it.
  final String source;
  const FoundAccount(this.bankName, this.suffix, this.type, this.source);

  bool get isCard => type == AccountType.creditCard;
  String get nickname =>
      isCard ? '$bankName Credit Card ••$suffix' : '$bankName ••$suffix';

  FoundAccount copyWith({String? bankName, AccountType? type}) => FoundAccount(
    bankName ?? this.bankName,
    suffix,
    type ?? this.type,
    source,
  );

  @override
  String toString() => '$bankName|$suffix|${type.name}';
}

class AccountListParser {
  AccountListParser._();

  /// Words that make a line look like a bank / card / wallet name.
  static final _keyword = RegExp(
    r'\b(bank|card|wallet|paytm|amex|american express|onecard|slice|jupiter|niyo|fi money|payments|a/?c|account)\b',
    caseSensitive: false,
  );

  /// A line that is only a masked number ("XXXXXXXX8981", "A/c **8981", "•• 6390").
  static final _onlyNumber = RegExp(
    r'^(?:(?:a/?c|acct|account|card)(?:\s*no\.?)?|ending(?:\s*in)?)?[\s:\-•·*xX.]*(\d{2,4})\s*$',
    caseSensitive: false,
  );

  static final _noise = RegExp(
    r'\b(credit card|debit card|savings account|savings a/?c|savings|current account|current a/?c|salary account|account|a/?c|acct|no|ending|in)\b\.?',
    caseSensitive: false,
  );

  static List<FoundAccount> parse(List<OcrLine> lines) {
    final texts = readingOrder(
      lines,
    ).map((l) => l.text.trim()).where((t) => t.isNotEmpty).toList();
    final out = <FoundAccount>[];
    final seen = <String>{};
    void add(FoundAccount? a) {
      if (a == null) return;
      final k = '${a.bankName.toLowerCase()}|${a.suffix}|${a.isCard}';
      if (seen.add(k)) out.add(a);
    }

    for (var i = 0; i < texts.length; i++) {
      final t = texts[i];
      final own = fromLine(t);
      if (own != null) {
        add(own);
        continue;
      }
      // "HDFC Bank" on one line, "XXXXXXXX8981" on the next.
      if (i + 1 < texts.length &&
          !RegExp(r'\d').hasMatch(t) &&
          _looksLikeName(t)) {
        final n = _onlyNumber.firstMatch(texts[i + 1]);
        if (n != null &&
            RegExp(
              r'[xX*•·]|a/?c|acct|account|card|ending',
              caseSensitive: false,
            ).hasMatch(texts[i + 1])) {
          add(_build(t, n.group(1)!, '$t ${texts[i + 1]}'));
          i++;
        }
      }
    }
    return out;
  }

  /// One line with a name and a masked number, or null.
  static FoundAccount? fromLine(String text) {
    final t = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (t.contains('₹') ||
        RegExp(r'\brs\.?\s*\d', caseSensitive: false).hasMatch(t)) {
      return null;
    }
    if (RegExp(r'\d:\d|%').hasMatch(t)) return null;
    final m = RegExp(r'(\d{2,4})$').firstMatch(t);
    if (m == null) return null;
    final digits = m.group(1)!;
    final before = t.substring(0, m.start);
    // The number must be separated from the name ("Bank 6390", "XX8981", "•• 6390").
    if (before.isEmpty || !RegExp(r'[\s:\-–•·*.xX]$').hasMatch(before)) {
      return null;
    }
    // "1,234" / "12.50" / "123 4567": an amount or a long number, not a masked one.
    if (RegExp(r'\d[\s,.]*$').hasMatch(before)) return null;
    final name = before.replaceAll(_maskTail, '');
    if (RegExp(r'\d').hasMatch(name)) return null;
    if (!_looksLikeName(name)) return null;
    return _build(name, digits, t);
  }

  /// Trailing separators / masks before the digits: " •• ", " - ", " XXXX", "****".
  static final _maskTail = RegExp(r'(?:[\s:\-–•·*.]|(?<![A-Za-z])[xX]+)+$');

  static bool _looksLikeName(String name) {
    final letters = name.replaceAll(RegExp(r'[^A-Za-z]'), '');
    if (letters.length < 3) return false;
    return _keyword.hasMatch(name) || BankRegistry.fromBody(name) != null;
  }

  static FoundAccount? _build(String name, String digits, String source) {
    final lower = name.toLowerCase();
    final type = lower.contains('credit')
        ? AccountType.creditCard
        : lower.contains('wallet')
        ? AccountType.wallet
        : RegExp(r'\bcurrent\b').hasMatch(lower)
        ? AccountType.current
        : lower.contains('salary')
        ? AccountType.salary
        : AccountType.savings;
    final known = BankRegistry.fromBody(name)?.name;
    final bank = known ?? _titleCase(name.replaceAll(_noise, ' '));
    if (bank.replaceAll(RegExp(r'[^A-Za-z]'), '').length < 2) return null;
    return FoundAccount(bank, digits, type, source);
  }

  static String _titleCase(String s) {
    final words = s
        .replaceAll(RegExp(r'[^A-Za-z&\s]'), ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();
    return [
      for (var i = 0; i < words.length; i++)
        () {
          final w = words[i];
          final lw = w.toLowerCase();
          if (i > 0 && (lw == 'of' || lw == 'and')) return lw;
          if (w.length <= 4 && w == w.toUpperCase()) return w; // AU, IDFC, YES
          return lw[0].toUpperCase() + lw.substring(1);
        }(),
    ].join(' ');
  }
}
