import '../core/money.dart';
import 'bank_registry.dart';
import 'date_extractor.dart';

/// A credit-card statement / bill reminder / available-limit message.
/// These are not transactions, so the main engine ignores them; this parser
/// keeps the card's bill and due date up to date.
class CardBillInfo {
  final String? bankName;
  final String? cardSuffix;
  final int? totalDuePaise;
  final int? minDuePaise;
  final DateTime? dueDate;
  final int? availableLimitPaise;

  /// True for a statement ("statement generated"), false for a reminder.
  final bool isStatement;
  const CardBillInfo({
    this.bankName,
    this.cardSuffix,
    this.totalDuePaise,
    this.minDuePaise,
    this.dueDate,
    this.availableLimitPaise,
    this.isStatement = false,
  });

  bool get hasBill => totalDuePaise != null || dueDate != null;
}

class CardBillParser {
  static const _amt = r'(?:rs\.?|inr|₹)\s*:?\s*([\d,]+(?:\.\d{1,2})?)';
  static final _card = RegExp(
    r'\b(credit\s*card|card)\b',
    caseSensitive: false,
  );
  static final _suffix = RegExp(
    r'(?:card|cc)\s*(?:no\.?|number|ending(?:\s+with)?|ending in)?\s*[:\-]?\s*(?:[x*•.]+\s*)?(\d{4})\b',
    caseSensitive: false,
  );
  static final _total = RegExp(
    '(?:total\\s*(?:amount|amt)?\\s*(?:due|payable|outstanding)|statement\\s*(?:amount|amt|balance)|total\\s*due|amount\\s*due|bill\\s*(?:amount|amt|of))\\s*(?:is|of|:|-)?\\s*$_amt',
    caseSensitive: false,
  );
  static final _min = RegExp(
    '(?:min(?:imum)?\\.?\\s*(?:amount|amt)?\\s*(?:due|payable))\\s*(?:is|of|:|-)?\\s*$_amt',
    caseSensitive: false,
  );
  static final _payOf = RegExp(
    'payment\\s+of\\s+$_amt[^.]*?\\bdue\\b',
    caseSensitive: false,
  );
  static final _dueLabel = RegExp(
    r'(?:due\s*(?:date|on|by)?|payable\s*by|pay\s*by|payment\s*due\s*date)\s*(?:is|:|-)?\s*(?=(.{6,20}))',
    caseSensitive: false,
  );
  static final _limit = RegExp(
    '(?:avl\\.?\\s*(?:lmt|limit)|available\\s*(?:credit\\s*)?limit|avbl\\.?\\s*(?:lmt|limit))\\s*(?:is|:|-)?\\s*$_amt',
    caseSensitive: false,
  );
  static final _statement = RegExp(
    r'\b(statement|e-?statement|bill (is )?generated)\b',
    caseSensitive: false,
  );

  /// Returns null unless the message is about a credit card bill or limit.
  static CardBillInfo? parse(
    String sender,
    String body, {
    DateTime? reference,
  }) {
    if (!_card.hasMatch(body)) return null;
    final total = _total.firstMatch(body) ?? _payOf.firstMatch(body);
    final min = _min.firstMatch(body);
    final limit = _limit.firstMatch(body);
    DateTime? due;
    // "Total Amt Due: Rs 12,345 … Due Date: 05-12-2026": take the first "due …" followed by a date.
    for (final dl in _dueLabel.allMatches(body)) {
      due = DateExtractor.extract(dl.group(1)!, reference: reference);
      if (due != null) break;
    }
    if (total == null && min == null && due == null && limit == null) {
      return null;
    }
    // A due date alone (without "card"+"due") is too weak.
    if (total == null &&
        min == null &&
        limit == null &&
        !RegExp(r'\bdue\b', caseSensitive: false).hasMatch(body)) {
      return null;
    }
    final bank = BankRegistry.fromSender(sender) ?? BankRegistry.fromBody(body);
    final suffix = _suffix.firstMatch(body)?.group(1);
    return CardBillInfo(
      bankName: bank?.name,
      cardSuffix: suffix,
      totalDuePaise: total == null ? null : Money.parseToPaise(total.group(1)!),
      minDuePaise: min == null ? null : Money.parseToPaise(min.group(1)!),
      dueDate: due,
      availableLimitPaise: limit == null
          ? null
          : Money.parseToPaise(limit.group(1)!),
      isStatement: _statement.hasMatch(body),
    );
  }
}
