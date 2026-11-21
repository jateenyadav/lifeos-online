import '../core/money.dart';
import '../models.dart';

/// Reusable regex-based field extractors used by every bank parser and the
/// generic fallback parser.
class FieldExtractors {
  FieldExtractors._();

  static final _amountWithCurrency = RegExp(
    r'(?:rs\.?|inr|₹|rupees)\s*:?\s*([\d,]+(?:\.\d{1,2})?)',
    caseSensitive: false,
  );
  static final _amountAfterVerb = RegExp(
    r'\b(?:debited|credited|spent|paid|sent|received|withdrawn|deposited)\s+(?:by|with|for|of)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)',
    caseSensitive: false,
  );
  static final _balanceContext = RegExp(
    r'(bal|balance|limit|lmt|avl|avbl|available|outstanding|due|total)[\s.:a-z]{0,14}$',
    caseSensitive: false,
  );

  /// First amount in the text that is not a balance/limit figure.
  static int? amount(String text) {
    for (final m in _amountWithCurrency.allMatches(text)) {
      final before = text.substring(
        (m.start - 22).clamp(0, text.length),
        m.start,
      );
      if (_balanceContext.hasMatch(before)) continue;
      final v = Money.parseToPaise(m.group(1)!);
      if (v != null && v > 0) return v;
    }
    final m = _amountAfterVerb.firstMatch(text);
    if (m != null) {
      final v = Money.parseToPaise(m.group(1)!);
      if (v != null && v > 0) return v;
    }
    return null;
  }

  static final _availableBalance = RegExp(
    r'(?:avl\.?\s*bal|avbl\.?\s*bal|available balance|bal(?:ance)?|avlbl amt)[\s.:]*(?:is)?[\s:]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)',
    caseSensitive: false,
  );
  static int? availableBalance(String text) {
    final m = _availableBalance.firstMatch(text);
    if (m == null) return null;
    return Money.parseToPaise(m.group(1)!);
  }

  static final _debitWords = RegExp(
    r'\b(debited|debit(?!\s*card)|spent|paid|sent|withdrawn|withdrawal|purchase|purchased|transferred from|dr|deducted|charged|used for|used at)\b',
    caseSensitive: false,
  );
  static final _creditWords = RegExp(
    r'\b(credited|credit(?!\s*card)|received|deposited|added|refunded|refund|reversed|reversal|cr)\b',
    caseSensitive: false,
  );

  static final _weakDebit = RegExp(
    r'\b((transaction|txn|payment|purchase) of\b|(was|is|has been) successful|successfully done)',
    caseSensitive: false,
  );

  /// Direction based on the earliest debit/credit keyword.
  static TxnDirection? direction(String text) {
    final d = _debitWords.firstMatch(text);
    final c = _creditWords.firstMatch(text);
    if (d == null && c == null) {
      // "Transaction of INR 1,050 on your card at UBER was successful".
      if (_weakDebit.hasMatch(text)) return TxnDirection.debit;
      return null;
    }
    if (d == null) return TxnDirection.credit;
    if (c == null) return TxnDirection.debit;
    return d.start <= c.start ? TxnDirection.debit : TxnDirection.credit;
  }

  static final _acctSuffix = RegExp(
    r'(?:\b(?:a\/c|acct|account|ac|a\/c\.)\b|card\b)\s*(?:no\.?|number|ending(?:\s*(?:with|in))?)?\s*[:\-]?\s*(?:[x*.]+\s*|\d{2,8}[x*]{2,})?(\d{3,6})\b',
    caseSensitive: false,
  );

  /// All masked account/card suffixes mentioned, in order of appearance.
  static List<String> accountSuffixes(String text) {
    final out = <String>[];
    for (final m in _acctSuffix.allMatches(text)) {
      final digits = m.group(1)!;
      final s = digits.length > 4
          ? digits.substring(digits.length - 4)
          : digits;
      if (!out.contains(s)) out.add(s);
    }
    return out;
  }

  static final _upiRefSlash = RegExp(
    r'upi\/(?:p2[am]\/)?(\d{9,16})',
    caseSensitive: false,
  );
  static final _ref = RegExp(
    r'(?:upi\s*ref(?:\.|erence)?\s*(?:no\.?|number|id)?|ref(?:erence)?\.?\s*(?:no\.?|number|id)?|utr(?:\s*no\.?)?|txn\s*(?:id|no\.?|#)|transaction\s*(?:id|ref(?:erence)?)\s*(?:no\.?)?|rrn|upi(?:\s*txn)?)\s*[:\-#]?\s*\(?\s*([a-z0-9]{6,22})',
    caseSensitive: false,
  );

  static String? reference(String text) {
    final slash = _upiRefSlash.firstMatch(text);
    if (slash != null) return slash.group(1);
    for (final m in _ref.allMatches(text)) {
      final v = m.group(1)!;
      if (RegExp(r'\d{6,}').hasMatch(v)) return v.toUpperCase();
    }
    return null;
  }

  static final _upiId = RegExp(
    r'\b([a-z0-9][a-z0-9.\-_]{1,255}@[a-z]{2,64})(?![.\w])',
    caseSensitive: false,
  );
  static String? upiId(String text) =>
      _upiId.firstMatch(text)?.group(1)?.toLowerCase();

  static final List<RegExp> _merchantPatterns = [
    RegExp(r'upi\/p2[am]\/\d+\/([^\n\/]+)', caseSensitive: false),
    RegExp(
      r';\s*([A-Za-z0-9&.\x27 \-]{2,60}?)\s+credited',
      caseSensitive: false,
    ),
    RegExp(
      r'\btrf to\s+([A-Za-z0-9&.\x27 \-]{2,60}?)(?=\s+(?:ref|on|upi|via)\b|\.|$)',
      caseSensitive: false,
    ),
    RegExp(
      r'\btransfer from\s+([A-Za-z0-9&.\x27 \-]{2,60}?)(?=\s+(?:ref|on|upi|via)\b|\.|$)',
      caseSensitive: false,
    ),
    RegExp(
      r'^\s*to\s*:?\s+([^\n]{2,60})$',
      caseSensitive: false,
      multiLine: true,
    ),
    RegExp(
      r'\b(?:paid to|sent to|transferred to|payment to|to vpa|at)\s+([A-Za-z0-9@&.\x27_ \-]{2,60}?)(?=\s+(?:on|ref|upi|via|using|thru|txn|avl|for|from|was|is)\b|\s*[.,;(]|\n|$)',
      caseSensitive: false,
    ),
    RegExp(
      r'\b(?:info|towards)\s*[:\-]?\s*([A-Za-z0-9&.\x27 \-]{2,60}?)(?=\s+(?:on|ref)\b|\.|\n|$)',
      caseSensitive: false,
    ),
    RegExp(
      r'\bto\s+([A-Za-z0-9@&.\x27_ \-]{2,60}?)(?=\s+(?:on|ref|upi|via|using|thru|txn|avl|credited|debited|for|in|has|is|was)\b|\s*[.,;(]|\n|$)',
      caseSensitive: false,
    ),
    RegExp(
      r'\b(?:by vpa|from vpa|by|from)\s+([A-Za-z0-9@&.\x27_ \-]{2,60}?)(?=\s+(?:on|ref|upi|via|thru|txn|avl|credited|debited|for|in|has|is|was)\b|\s*[.,;(]|\n|$)',
      caseSensitive: false,
    ),
  ];

  static final _merchantJunk = RegExp(
    r'^(your|you|the|a\/c|acct|account|ac|card|bank|us|me|self|rs|inr|upi|vpa|mobile|beneficiary)\b',
    caseSensitive: false,
  );

  /// Best-effort merchant/beneficiary extraction.
  static String? merchant(String text) {
    for (final p in _merchantPatterns) {
      for (final m in p.allMatches(text)) {
        final cleaned = cleanMerchant(m.group(1)!);
        if (cleaned != null) return cleaned;
      }
    }
    return null;
  }

  static String? cleanMerchant(String raw) {
    var s = raw.trim();
    s = s.replaceAll(
      RegExp(r'^(vpa|upi|m\/s\.?|ms\.?)\s+', caseSensitive: false),
      '',
    );
    s = s.replaceAll(RegExp(r'\s+'), ' ');
    s = s.replaceAll(RegExp(r'[\s.,;:\-]+$'), '');
    if (s.length < 2) return null;
    if (_merchantJunk.hasMatch(s)) return null;
    if (RegExp(r'^[x*.\d\s]+$', caseSensitive: false).hasMatch(s)) return null;
    if (RegExp(r'^(rs|inr|₹)', caseSensitive: false).hasMatch(s)) return null;
    // Dates / pure numbers are not merchants.
    if (RegExp(r'^\d{1,2}[\-/]').hasMatch(s)) return null;
    return s;
  }

  static TxnChannel channel(String text) {
    final t = text.toLowerCase();
    if (RegExp(r'\b(upi|vpa)\b').hasMatch(t) || t.contains('@')) {
      return TxnChannel.upi;
    }
    if (RegExp(r'\b(atm|cash withdrawal|withdrawn)\b').hasMatch(t)) {
      return TxnChannel.atm;
    }
    if (RegExp(r'\bneft\b').hasMatch(t)) return TxnChannel.neft;
    if (RegExp(r'\bimps\b').hasMatch(t)) return TxnChannel.imps;
    if (RegExp(r'\brtgs\b').hasMatch(t)) return TxnChannel.rtgs;
    if (RegExp(r'\b(card|pos|spent)\b').hasMatch(t)) return TxnChannel.card;
    if (RegExp(r'\b(net ?banking|netbanking|ib)\b').hasMatch(t)) {
      return TxnChannel.netbanking;
    }
    if (RegExp(r'\bcheque|chq\b').hasMatch(t)) return TxnChannel.cheque;
    if (RegExp(r'\bwallet\b').hasMatch(t)) return TxnChannel.wallet;
    return TxnChannel.other;
  }

  static bool isRefund(String text) => RegExp(
    r'\b(refund|refunded|reversal|reversed|returned|chargeback)\b',
    caseSensitive: false,
  ).hasMatch(text);

  static bool isFailed(String text) => RegExp(
    r'\b(failed|declined|unsuccessful|could not be processed|rejected)\b',
    caseSensitive: false,
  ).hasMatch(text);

  static bool isPending(String text) => RegExp(
    r'\b(pending|in process|processing)\b',
    caseSensitive: false,
  ).hasMatch(text);

  static bool mentionsSelf(String text) => RegExp(
    r'\b(self|own account|to self|self transfer|self-transfer)\b',
    caseSensitive: false,
  ).hasMatch(text);
}
