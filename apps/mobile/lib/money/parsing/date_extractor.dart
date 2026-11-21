/// Extracts dates/times from Indian bank SMS and UPI app text.
/// Supported: 15/11/26, 15-11-2026, 15-Nov-26, 15Nov26, 15 Nov 2026,
/// 2026-11-15, 15-NOV-2026 10:22:33, "15 Nov, 10:22 am", "Nov 15, 2026".
library;

class DateExtractor {
  DateExtractor._();

  static const _months = {
    'jan': 1,
    'feb': 2,
    'mar': 3,
    'apr': 4,
    'may': 5,
    'jun': 6,
    'jul': 7,
    'aug': 8,
    'sep': 9,
    'sept': 9,
    'oct': 10,
    'nov': 11,
    'dec': 12,
  };

  static final _iso = RegExp(r'\b(20\d{2})-(\d{1,2})-(\d{1,2})\b');
  static final _numeric = RegExp(
    r'\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b',
  );
  static final _named = RegExp(
    r'\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/]?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s\-/,]*(?:(\d{2,4})(?![\d:]))?',
    caseSensitive: false,
  );
  static final _namedMonthFirst = RegExp(
    r'\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})?\b',
    caseSensitive: false,
  );
  static final _time = RegExp(
    r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b',
  );

  /// Returns the extracted date or null. [reference] supplies the year when
  /// the text omits it and is used to resolve two-digit years.
  static DateTime? extract(String text, {DateTime? reference}) {
    final ref = reference ?? DateTime.now();
    int? y, m, d;
    var dateEnd = 0;

    final iso = _iso.firstMatch(text);
    if (iso != null) {
      y = int.parse(iso.group(1)!);
      m = int.parse(iso.group(2)!);
      d = int.parse(iso.group(3)!);
      dateEnd = iso.end;
    } else {
      final named = _named.firstMatch(text);
      final numeric = _numeric.firstMatch(text);
      final monthFirst = _namedMonthFirst.firstMatch(text);
      if (named != null && (numeric == null || named.start <= numeric.start)) {
        d = int.parse(named.group(1)!);
        m = _months[named.group(2)!.toLowerCase().substring(0, 3)];
        y = named.group(3) != null ? _year(int.parse(named.group(3)!)) : null;
        dateEnd = named.end;
      } else if (numeric != null) {
        d = int.parse(numeric.group(1)!);
        m = int.parse(numeric.group(2)!);
        y = _year(int.parse(numeric.group(3)!));
        dateEnd = numeric.end;
      } else if (monthFirst != null) {
        m = _months[monthFirst.group(1)!.toLowerCase().substring(0, 3)];
        d = int.parse(monthFirst.group(2)!);
        y = monthFirst.group(3) != null
            ? int.parse(monthFirst.group(3)!)
            : null;
        dateEnd = monthFirst.end;
      }
    }
    if (d == null || m == null) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    y ??= _inferYear(m, d, ref);

    var hour = 0, minute = 0, second = 0;
    // Prefer a time that follows the date (avoids reading "15:10" out of
    // "2026-11-15:10:22:33"); fall back to any time in the text.
    final t =
        _time.firstMatch(text.substring(dateEnd)) ??
        (dateEnd == 0 ? null : _time.firstMatch(text));
    if (t != null) {
      hour = int.parse(t.group(1)!);
      minute = int.parse(t.group(2)!);
      second = t.group(3) != null ? int.parse(t.group(3)!) : 0;
      final ampm = t.group(4)?.toLowerCase();
      if (ampm == 'pm' && hour < 12) hour += 12;
      if (ampm == 'am' && hour == 12) hour = 0;
      if (hour > 23 || minute > 59 || second > 59) {
        hour = minute = second = 0;
      }
    }
    final dt = DateTime(y, m, d, hour, minute, second);
    // Reject dates that overflowed (e.g. 31 Feb) or are absurd.
    if (dt.month != m || dt.day != d) return null;
    return dt;
  }

  /// True when the text contained an explicit time-of-day.
  static bool hasTime(String text) => _time.hasMatch(text);

  static int _year(int y) => y < 100 ? 2000 + y : y;

  static int _inferYear(int m, int d, DateTime ref) {
    final candidate = DateTime(ref.year, m, d);
    // A date more than ~2 days in the future most likely belongs to last year.
    return candidate.isAfter(ref.add(const Duration(days: 2)))
        ? ref.year - 1
        : ref.year;
  }
}
