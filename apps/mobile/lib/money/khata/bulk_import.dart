/// Old khata notes for many people at once:
///
///   dadaji Pending= 1 34250 + 227000 - 24000 suresh ...
///   Maa - 68000 + 17000 (maa) - 20000 (rakesh mama) ...
///   Rohan (pune) - 101260 + 61904 ...
///
///   pending
///   dada ji - 100000 - 11300 = 88700 (+34250 variable)
///   maa - 0
///
/// Each person becomes one block of lines (read by [KhataTextImport]); the
/// optional "pending" section gives the totals the user worked out, used to
/// check the lines.
library;

import '../ocr/screenshot_parser.dart';
import 'text_import.dart';

/// What to save for one person.
enum BulkChoice {
  /// Every line, then one extra line so the balance equals the user's own total.
  linesAndFix,

  /// Every line as read.
  lines,

  /// Only one line: the user's own total (or the lines' total when there is none).
  totalOnly,

  /// Do not import this person.
  skip,
}

class BulkPerson {
  String name;

  /// Bracket text after the name ("pune"), kept as the contact's note.
  final String? tag;
  final String body;
  List<ImportLine> lines;

  /// The total the user wrote in the "pending" section, in the notes' own sign
  /// (positive = same as "+"). Null when not given.
  int? statedPaise;
  BulkChoice choice;

  /// true: "+" in the notes means this person owes me. Default false: in the
  /// user's own notes "Dadaji pending = 1,34,250 + ..." is Dadaji's money kept
  /// with me, i.e. I owe Dadaji.
  bool plusTheyOwe;

  BulkPerson({
    required this.name,
    this.tag,
    required this.body,
    required this.lines,
    this.statedPaise,
    this.choice = BulkChoice.lines,
    this.plusTheyOwe = false,
  });

  int get linesPaise => KhataTextImport.total(lines);
  bool get matches => statedPaise == null || statedPaise == linesPaise;

  /// Difference to add after the lines so the balance equals [statedPaise] (notes' sign).
  int get fixPaise => (statedPaise ?? linesPaise) - linesPaise;

  /// Final balance in the notes' sign for the current [choice].
  int get finalPaise => switch (choice) {
    BulkChoice.linesAndFix || BulkChoice.totalOnly => statedPaise ?? linesPaise,
    BulkChoice.lines => linesPaise,
    BulkChoice.skip => 0,
  };

  /// Positive = they owe me.
  int owedToMe(int notesSignedPaise) =>
      plusTheyOwe ? notesSignedPaise : -notesSignedPaise;

  String get key => KhataBulkImport.nameKey(name);
}

class KhataBulkImport {
  KhataBulkImport._();

  static final _summaryHeader = RegExp(
    r'^\s*(pending|pendings|total|totals|balance|balances|summary|final|net)\s*[:\-=]?\s*$',
    caseSensitive: false,
  );

  /// "dadaji Pending=", "Maa -", "Rohan ( pune) -", "Ramesh:" at the start of a line.
  static final _head = RegExp(
    r'^\s*([A-Za-z][A-Za-z .]{0,40}?)\s*(\([^()]{0,40}\))?\s*(?:\b(?:pending|balance|total|khata|hisab)\b)?\s*(?:[:=\-–—−]|(?=\s*[+\d]))',
    caseSensitive: false,
  );

  /// Lowercase letters only, so "Dada ji", "dadaji" and "DADAJI" are the same person.
  static String nameKey(String name) =>
      name.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');

  static List<BulkPerson> parse(String text, {DateTime? now}) {
    // Lines with the paragraph they belong to (blank lines separate paragraphs).
    final rows = <(String, int)>[];
    var para = 0;
    for (final raw in text.replaceAll('\r', '').split('\n')) {
      final line = raw.replaceAll(RegExp('[−–—]'), '-').trim();
      if (line.isEmpty) {
        para++;
        continue;
      }
      rows.add((line, para));
    }

    // Pre-scan the "pending" section for the real people's names.
    final summaryAt = rows.indexWhere((r) => _summaryHeader.hasMatch(r.$1));
    final summaryKeys = <String>{};
    if (summaryAt >= 0) {
      for (final (line, _) in rows.skip(summaryAt + 1)) {
        final h = _head.firstMatch(line);
        final n = h == null ? null : _cleanName(h.group(1)!);
        if (n != null) summaryKeys.add(nameKey(n));
      }
    }
    final notes = summaryAt >= 0 ? rows.sublist(0, summaryAt) : rows;
    // When people are separated by blank lines, a line in the middle of a
    // paragraph is a wrapped continuation ("chachiji - 5000 bori ..."), not a new person.
    final paragraphs = notes.map((r) => r.$2).toSet().length;
    final usesParagraphs = paragraphs > 1;

    final people = <BulkPerson>[];
    String? curName;
    String? curTag;
    final curBody = StringBuffer();
    void flush() {
      if (curName != null) {
        final body = curBody.toString().trim();
        people.add(
          BulkPerson(
            name: curName!,
            tag: curTag,
            body: body,
            lines: KhataTextImport.parse(body, now: now),
          ),
        );
      }
      curName = null;
      curTag = null;
      curBody.clear();
    }

    for (var i = 0; i < notes.length; i++) {
      final (line, p) = notes[i];
      final paragraphStart = i == 0 || notes[i - 1].$2 != p;
      final head = _head.firstMatch(line);
      final name = head == null ? null : _cleanName(head.group(1)!);
      final startsPerson =
          name != null &&
          (curName == null ||
              paragraphStart ||
              !usesParagraphs ||
              summaryKeys.contains(nameKey(name)));
      if (startsPerson) {
        flush();
        curName = name;
        final tag = head!.group(2)?.replaceAll(RegExp(r'[()]'), '').trim();
        curTag = (tag == null || tag.isEmpty) ? null : tag;
        curBody.write(line.substring(head.end));
      } else if (curName != null) {
        // Wrapped line: keep it in the same sentence. A line that starts with a
        // number after a finished amount is a new entry (like a new line in the notes).
        final prev = curBody.toString().trimRight();
        final joinsOperator =
            RegExp(r'[+\-=(\[{]$').hasMatch(prev) ||
            RegExp(r'^[+\-=)\]}]').hasMatch(line);
        final sep = !joinsOperator && RegExp(r'^\d').hasMatch(line)
            ? ' + '
            : ' ';
        curBody.write('$sep$line');
      }
    }
    flush();

    // Join the "pending" totals to the people (and add people only listed there).
    if (summaryAt >= 0) {
      for (final (line, _) in rows.skip(summaryAt + 1)) {
        final h = _head.firstMatch(line);
        final name = h == null ? null : _cleanName(h.group(1)!);
        if (name == null) continue;
        final total = _statedTotal(line.substring(h!.end), now);
        final p = people.where((p) => p.key == nameKey(name)).firstOrNull;
        if (p != null) {
          p.statedPaise = total;
        } else {
          people.add(
            BulkPerson(
              name: name,
              body: '',
              lines: const [],
              statedPaise: total,
            ),
          );
        }
      }
    }
    for (final p in people) {
      p.choice = p.lines.isEmpty
          ? BulkChoice.totalOnly
          : (p.matches ? BulkChoice.lines : BulkChoice.linesAndFix);
    }
    return people;
  }

  /// Text of a screenshot of notes. A blank line goes wherever there is a
  /// visible gap (so each person stays one paragraph), and a line that runs to
  /// the right edge is a wrap of the same sentence, so it is joined with a space.
  static String textFromOcr(List<OcrLine> lines) {
    final ordered = readingOrder(
      lines,
    ).where((l) => l.text.trim().isNotEmpty).toList();
    if (ordered.isEmpty) return '';
    final heights = ordered.map((l) => l.height).toList()..sort();
    final h = heights[heights.length ~/ 2];
    final maxRight = ordered
        .map((l) => l.right)
        .reduce((a, b) => a > b ? a : b);
    final out = StringBuffer(ordered.first.text.trim());
    for (var i = 1; i < ordered.length; i++) {
      final prev = ordered[i - 1];
      final gap = ordered[i].top - prev.bottom;
      final wrapped = maxRight > 0 && prev.right >= maxRight * 0.75;
      out.write(gap > h * 0.9 ? '\n\n' : (wrapped ? ' ' : '\n'));
      out.write(ordered[i].text.trim());
    }
    return out.toString();
  }

  /// "100000 - 11300 = 88700 (+34250 variable)" → 88700; "0" → 0; "+ 0" → 0.
  static int _statedTotal(String rest, DateTime? now) {
    final s = rest.replaceAll(RegExp(r'\([^()]*\)|\{[^{}]*\}'), ' ');
    final eq = s.lastIndexOf('=');
    final part = eq >= 0 ? s.substring(eq + 1) : s;
    final lines = KhataTextImport.parse(part, now: now);
    if (eq >= 0) return lines.isEmpty ? 0 : lines.first.signedPaise;
    return KhataTextImport.total(lines);
  }

  static String? _cleanName(String raw) {
    final words = raw
        .replaceAll(
          RegExp(
            r'\b(pending|balance|total|khata|hisab)\b',
            caseSensitive: false,
          ),
          ' ',
        )
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.isEmpty || words.join().length < 2 || words.length > 4) {
      return null;
    }
    return words
        .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
        .join(' ');
  }
}
