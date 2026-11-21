/// Exact money handling. All amounts are stored as integer paise.
/// Floating point is never used for financial arithmetic.
library;

class Money {
  Money._();

  /// Parses an amount string such as "1,23,456.78", "450", "Rs.450.5",
  /// "INR 2,000.00" or "₹ 99" into integer paise. Returns null when the
  /// input does not contain a valid amount.
  static int? parseToPaise(String input) {
    final match = RegExp(r'(\d[\d,]*)(?:\.(\d{1,2}))?').firstMatch(input);
    if (match == null) return null;
    final rupeePart = match.group(1)!.replaceAll(',', '');
    if (rupeePart.isEmpty) return null;
    final rupees = int.tryParse(rupeePart);
    if (rupees == null) return null;
    var paiseStr = match.group(2) ?? '0';
    if (paiseStr.length == 1) paiseStr = '${paiseStr}0';
    final paise = int.parse(paiseStr);
    return rupees * 100 + paise;
  }

  /// Formats paise using the Indian numbering system, e.g. 12345678 paise
  /// -> "₹1,23,456.78". Whole amounts omit decimals unless [forceDecimals].
  static String format(
    int paise, {
    bool symbol = true,
    bool forceDecimals = false,
    bool signed = false,
  }) {
    final negative = paise < 0;
    final abs = paise.abs();
    final rupees = abs ~/ 100;
    final rem = abs % 100;
    final grouped = groupIndian(rupees);
    final decimals = (rem != 0 || forceDecimals)
        ? '.${rem.toString().padLeft(2, '0')}'
        : '';
    final sign = negative ? '-' : (signed && paise > 0 ? '+' : '');
    return '$sign${symbol ? '₹' : ''}$grouped$decimals';
  }

  /// Compact form for charts: ₹1.2L, ₹3.4Cr, ₹12.5K.
  static String compact(int paise) {
    final negative = paise < 0;
    final rupees = paise.abs() ~/ 100;
    String body;
    if (rupees >= 10000000) {
      body = '${_oneDecimal(rupees, 10000000)}Cr';
    } else if (rupees >= 100000) {
      body = '${_oneDecimal(rupees, 100000)}L';
    } else if (rupees >= 1000) {
      body = '${_oneDecimal(rupees, 1000)}K';
    } else {
      body = '$rupees';
    }
    return '${negative ? '-' : ''}₹$body';
  }

  static String _oneDecimal(int value, int unit) {
    final tenths = (value * 10) ~/ unit;
    final whole = tenths ~/ 10;
    final frac = tenths % 10;
    return frac == 0 ? '$whole' : '$whole.$frac';
  }

  /// Indian digit grouping: 1234567 -> 12,34,567
  static String groupIndian(int value) {
    final s = value.toString();
    if (s.length <= 3) return s;
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    return '${parts.join(',')},$last3';
  }

  /// Converts user-entered text (e.g. "450.5") to paise. Rejects negatives,
  /// more than two decimals and non-numeric input.
  static int? fromUserInput(String text) {
    final t = text.trim().replaceAll(',', '').replaceAll('₹', '');
    if (!RegExp(r'^\d+(\.\d{0,2})?$').hasMatch(t)) return null;
    return parseToPaise(t);
  }

  /// Plain editable representation: 45050 -> "450.50", 45000 -> "450".
  static String toInput(int paise) {
    final r = paise ~/ 100;
    final p = paise % 100;
    return p == 0 ? '$r' : '$r.${p.toString().padLeft(2, '0')}';
  }

  /// Splits [total] into [parts] near-equal integer shares that sum exactly.
  static List<int> splitEven(int total, int parts) {
    if (parts <= 0) throw ArgumentError('parts must be > 0');
    final base = total ~/ parts;
    final remainder = total - base * parts;
    return List<int>.generate(parts, (i) => base + (i < remainder ? 1 : 0));
  }
}
