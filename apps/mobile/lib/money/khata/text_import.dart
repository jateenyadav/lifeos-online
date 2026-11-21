/// Turns hand-written khata notes ("- 24000 suresh - 5000 bori (3 sep)
/// + 50k neha 5 oct") into separate lines the user can check and save.
library;

class ImportLine {
  /// +1 = adds to the total, -1 = takes away.
  final int sign;
  final int amountPaise;
  final String note;
  final DateTime? date;
  const ImportLine(this.sign, this.amountPaise, this.note, this.date);

  ImportLine copyWith({int? sign, int? amountPaise, String? note}) =>
      ImportLine(
        sign ?? this.sign,
        amountPaise ?? this.amountPaise,
        note ?? this.note,
        date,
      );

  int get signedPaise => sign * amountPaise;

  @override
  String toString() =>
      '${sign > 0 ? '+' : '-'}${amountPaise ~/ 100} "$note" ${date?.toIso8601String() ?? ''}';
}

class KhataTextImport {
  KhataTextImport._();

  static const _months = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, //
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  };

  static final _date = RegExp(
    r'\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*(20\d\d))?',
    caseSensitive: false,
  );

  /// "50k", "1lac", "1.5 lakh", "1,34,250", "1 34250" (Indian spacing).
  static final _amount = RegExp(
    r'(?<![\w.])(\d{1,2}\s\d{2,3}\s?\d{3}|\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)(?:\s*(k|lac|lakh|lakhs|l)(?![a-z]))?(?![\d])',
    caseSensitive: false,
  );

  /// Splits [text] into lines. Each "+" / "-" (outside brackets) starts a new
  /// line; text without a number is kept as a note on the line before it.
  static List<ImportLine> parse(String text, {DateTime? now}) {
    final today = now ?? DateTime.now();
    final s = text.replaceAll(RegExp('[−–—]'), '-').replaceAll('\n', ' + ');
    // Someone forgot to close a bracket: split on every +/- instead.
    final terms = _split(s, brackets: true) ?? _split(s, brackets: false)!;
    // "Maa - 68000 + ...": a leading name is a heading, not a minus.
    if (terms.length > 1 &&
        _line(terms[0].$1, terms[0].$2, today) == null &&
        terms[1].$1 < 0) {
      terms[1] = (1, terms[1].$2);
    }

    final out = <ImportLine>[];
    for (final (sg, term) in terms) {
      final line = _line(sg, term, today);
      if (line != null) {
        out.add(line);
      } else if (out.isNotEmpty) {
        final extra = _clean(term);
        if (extra.isNotEmpty) {
          final last = out.removeLast();
          out.add(
            last.copyWith(
              note: last.note.isEmpty ? extra : '${last.note} · $extra',
            ),
          );
        }
      }
    }
    return out;
  }

  /// Terms with their signs, or null when [brackets] and they do not balance.
  static List<(int, String)>? _split(String s, {required bool brackets}) {
    final terms = <(int, String)>[];
    var depth = 0;
    var sign = 1;
    final buf = StringBuffer();
    void flush(int nextSign) {
      final t = buf.toString().trim();
      if (t.isNotEmpty) terms.add((sign, t));
      buf.clear();
      sign = nextSign;
    }

    for (var i = 0; i < s.length; i++) {
      final c = s[i];
      if (brackets) {
        if (c == '(' || c == '{' || c == '[') depth++;
        if (c == ')' || c == '}' || c == ']') depth--;
        if (depth < 0) return null;
      }
      if (depth == 0 && (c == '+' || c == '=' || c == '-')) {
        // A hyphen inside a word ("e-mail") is not a minus.
        final prev = i > 0 ? s[i - 1] : ' ';
        final next = i + 1 < s.length ? s[i + 1] : ' ';
        final inWord =
            c == '-' &&
            RegExp(r'[A-Za-z]').hasMatch(prev) &&
            RegExp(r'[A-Za-z]').hasMatch(next);
        if (!inWord) {
          flush(c == '-' ? -1 : 1);
          continue;
        }
      }
      buf.write(c);
    }
    if (depth != 0) return null;
    flush(1);
    return terms;
  }

  static ImportLine? _line(int sign, String term, DateTime today) {
    // "(47826+40000)": a bracket of pure sums counts as one amount.
    final sum = RegExp(
      r'^\(\s*([\d\s+.,k]+)\)$',
      caseSensitive: false,
    ).firstMatch(term.trim());
    if (sum != null) {
      var total = 0;
      for (final part in sum.group(1)!.split('+')) {
        total += _paise(part.trim()) ?? 0;
      }
      if (total > 0) return ImportLine(sign, total, '', null);
    }

    // Dates first, so "3 sep" is not read as ₹3.
    final dateMatch = _date.firstMatch(term);
    DateTime? date;
    if (dateMatch != null) {
      final day = int.parse(dateMatch.group(1)!);
      final month = _months[dateMatch.group(2)!.toLowerCase().substring(0, 3)]!;
      var year = int.tryParse(dateMatch.group(3) ?? '') ?? today.year;
      var d = DateTime(
        year,
        month,
        day.clamp(1, 28) == day ? day : day.clamp(1, 31),
      );
      if (dateMatch.group(3) == null && d.isAfter(today)) {
        d = DateTime(--year, month, day);
      }
      date = d;
    }
    final noDates = term.replaceAll(_date, ' ');
    // The amount is the first number outside brackets.
    final outside = noDates.replaceAll(RegExp(r'\([^()]*\)|\{[^{}]*\}'), (' '));
    final m = _amount.firstMatch(outside) ?? _amount.firstMatch(noDates);
    if (m == null) return null;
    final paise = _paise(m.group(0)!);
    if (paise == null || paise == 0) return null;
    final note = _clean(noDates.replaceFirst(m.group(0)!, ' '));
    return ImportLine(sign, paise, note, date);
  }

  static int? _paise(String raw) {
    final m = RegExp(
      r'^([\d\s,.]+?)\s*(k|lac|lakh|lakhs|l)?$',
      caseSensitive: false,
    ).firstMatch(raw.trim());
    if (m == null) return null;
    final n = double.tryParse(m.group(1)!.replaceAll(RegExp(r'[\s,]'), ''));
    if (n == null) return null;
    final mult = switch (m.group(2)?.toLowerCase()) {
      'k' => 1000,
      'lac' || 'lakh' || 'lakhs' || 'l' => 100000,
      _ => 1,
    };
    return (n * mult * 100).round();
  }

  static String _clean(String s) => s
      .replaceAll(RegExp(r'[(){}\[\]]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'^[\s,.:;-]+|[\s,.:;-]+$'), '')
      .trim();

  static int total(Iterable<ImportLine> lines) =>
      lines.fold(0, (a, l) => a + l.signedPaise);
}
