import '../core/money.dart';
import '../models.dart';
import '../parsing/date_extractor.dart';
import '../parsing/field_extractors.dart';

/// A recognised line of text with its bounding box (pixels).
class OcrLine {
  final String text;
  final double left, top, right, bottom;

  /// Pixel check of the line's first character: true when it is shaped like
  /// "₹" (two top bars) even though OCR read it as "7". Null = not checked.
  final bool? rupeeGlyph;
  const OcrLine(
    this.text, {
    this.left = 0,
    this.top = 0,
    this.right = 0,
    this.bottom = 0,
    this.rupeeGlyph,
  });
  double get height => (bottom - top).abs() < 1 ? 20 : (bottom - top).abs();
  double get centerY => (top + bottom) / 2;
}

/// A transaction extracted from a screenshot, possibly incomplete.
class ScreenshotTxn {
  final int? amountPaise;
  final TxnDirection direction;
  final DateTime? occurredAt;
  final String? merchant;
  final TxnStatus status;
  final String? reference;
  final String layout;
  const ScreenshotTxn({
    this.amountPaise,
    this.direction = TxnDirection.debit,
    this.occurredAt,
    this.merchant,
    this.status = TxnStatus.cleared,
    this.reference,
    required this.layout,
  });

  List<String> get missingFields => [
    if (amountPaise == null) 'amount',
    if (occurredAt == null) 'date',
    if (merchant == null) 'merchant',
  ];
}

abstract class ScreenshotLayoutParser {
  String get id;

  /// Confidence 0..100 that this parser understands the layout.
  int score(List<OcrLine> lines);
  List<ScreenshotTxn> parse(List<OcrLine> lines, DateTime reference);
}

final _amountLine = RegExp(
  r'^\s*([+\-–])?\s*(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)\s*(cr|dr)?\s*$',
  caseSensitive: false,
);
final _txnIdLabel = RegExp(
  r'(upi\s*(transaction|txn|ref)\.?\s*(id|no)?|\butr\b|\brrn\b|transaction\s*id|\btxn\s*(id|no)|ref(erence)?\s*(no|id))',
  caseSensitive: false,
);

/// A big amount line as OCR really returns it: the "₹" is often dropped
/// ("486") or misread as "7" ("71,250"), "%", "Z" or "F".
final _bareAmount = RegExp(
  r'^\s*([+\-–])?\s*(₹|rs\.?|inr|[7%zZF])?\s?(\d{1,3}(?:,\d{2,3})+|\d{1,7})(\.\d{1,2})?\s*$',
  caseSensitive: false,
);

class _AmountPick {
  final int paise;
  final bool credit;
  const _AmountPick(this.paise, this.credit);
}

/// Picks the payment amount on a single-payment screen: an explicit ₹ amount
/// wins, otherwise the largest-font bare number. Resolves the "₹ read as 7"
/// ambiguity with the pixel check or with a matching amount elsewhere.
_AmountPick? _pickDetailAmount(List<OcrLine> lines) {
  final cands = <(OcrLine, RegExpMatch)>[];
  for (final l in lines) {
    final t = l.text.trim();
    final m = _bareAmount.firstMatch(t);
    if (m == null) continue;
    final digits = m.group(3)!.replaceAll(',', '');
    final symbol = m.group(2);
    // Long digit runs without a currency sign are IDs / phone numbers.
    if (symbol == null && !m.group(3)!.contains(',') && digits.length > 6) {
      continue;
    }
    // Bare years like "2026" are not amounts.
    if (symbol == null &&
        !m.group(3)!.contains(',') &&
        RegExp(r'^(19|20)\d\d$').hasMatch(digits)) {
      continue;
    }
    cands.add((l, m));
  }
  if (cands.isEmpty) return null;

  String valueOf(RegExpMatch m, {required bool stripSeven}) {
    var v = m.group(3)!;
    final sym = m.group(2);
    if (sym != null && sym == '7' && !stripSeven) v = '7$v';
    return '$v${m.group(4) ?? ''}';
  }

  bool isExplicit(RegExpMatch m) {
    final sym = m.group(2)?.toLowerCase();
    return sym != null && sym != '7';
  }

  // Normalised values for cross-checking ("₹349" shown twice).
  final plain = <String>{
    for (final (_, m) in cands)
      if (m.group(2) != '7') valueOf(m, stripSeven: false).replaceAll(',', ''),
  };

  final hasGeometry = lines.any((l) => l.bottom > 0);
  final explicit = cands.where((c) => isExplicit(c.$2)).toList();
  (OcrLine, RegExpMatch) best;
  if (explicit.isNotEmpty) {
    best = explicit.first;
  } else if (hasGeometry) {
    best = cands.reduce((a, b) => b.$1.height > a.$1.height * 1.05 ? b : a);
  } else {
    best = cands.first;
  }

  final m = best.$2;
  var stripSeven = false;
  if (m.group(2) == '7') {
    final stripped = valueOf(m, stripSeven: true).replaceAll(',', '');
    if (best.$1.rupeeGlyph != null) {
      stripSeven = best.$1.rupeeGlyph!;
    } else if (plain.contains(stripped)) {
      stripSeven = true;
    } else {
      // A "7" glued to a comma-grouped number that is no longer valid Indian
      // grouping once the 7 is kept (e.g. "7349" vs "₹349") stays ambiguous;
      // keep the digits as read.
      stripSeven = false;
    }
  }
  final paise = Money.parseToPaise(valueOf(m, stripSeven: stripSeven));
  if (paise == null || paise <= 0) return null;
  final credit = m.group(1) == '+';
  return _AmountPick(paise, credit);
}

/// "To X" / "Paid to" vs "From X" / "Received from": whichever headline comes first.
final _debitHead = RegExp(
  r'^(to|paid to|sent to|paid successfully to|payment to|paying|transfer(?:red)? to)\b\s*:?\s*(.*)$',
  caseSensitive: false,
);
final _creditHead = RegExp(
  r'^(from|received from|money received from|received)\b\s*:?\s*(.*)$',
  caseSensitive: false,
);

TxnStatus _statusFrom(String text) {
  final t = text.toLowerCase();
  if (RegExp(r'\b(failed|declined)\b').hasMatch(t)) return TxnStatus.failed;
  if (RegExp(r'\b(pending|processing)\b').hasMatch(t)) return TxnStatus.pending;
  return TxnStatus.cleared;
}

bool _isNoise(String s) {
  final t = s.trim();
  if (t.length < 2) return true;
  if (_amountLine.hasMatch(t)) return true;
  if (DateExtractor.extract(t) != null && t.length < 30) return true;
  if (RegExp(
    r'^(completed|successful|success|paid|failed|pending|today|yesterday|upi lite|history|transactions|search|filter|all|debit|credit|show more|view details|balance|payments?)$',
    caseSensitive: false,
  ).hasMatch(t)) {
    return true;
  }
  if (RegExp(r'^\d{1,2}:\d{2}').hasMatch(t)) return true;
  return false;
}

/// Single transaction detail screen (GPay/PhonePe/Paytm/BHIM receipts).
class DetailScreenParser implements ScreenshotLayoutParser {
  @override
  String get id => 'detail';

  @override
  int score(List<OcrLine> lines) {
    final text = lines.map((l) => l.text).join('\n');
    var s = 0;
    if (_txnIdLabel.hasMatch(text)) s += 50;
    if (RegExp(
      r'\b(paid to|to:|received from|from:|sent to|transaction successful|payment successful|paid successfully|successfully paid|completed)\b',
      caseSensitive: false,
    ).hasMatch(text)) {
      s += 30;
    }
    final amounts = lines.where((l) => _amountLine.hasMatch(l.text)).length;
    if (amounts == 1) s += 20;
    if (amounts > 3) s -= 40;
    return s.clamp(0, 100);
  }

  @override
  List<ScreenshotTxn> parse(List<OcrLine> lines, DateTime reference) {
    final texts = readingOrder(
      lines,
    ).map((l) => l.text.trim()).where((t) => t.isNotEmpty).toList();
    final all = texts.join('\n');

    final pick = _pickDetailAmount(lines);
    final amount = pick?.paise;

    // Direction + payee from the first "To …" / "From …" headline.
    var direction = TxnDirection.debit;
    String? merchant;
    String? candidateAfter(int i, String inline) {
      final raw = inline.trim().isNotEmpty
          ? inline.trim()
          : (i + 1 < texts.length ? texts[i + 1] : '');
      final cleaned = FieldExtractors.cleanMerchant(raw);
      if (cleaned == null || _isNoise(cleaned)) return null;
      if (_debitHead.hasMatch(cleaned) || _creditHead.hasMatch(cleaned)) {
        return null;
      }
      return cleaned;
    }

    for (var i = 0; i < texts.length; i++) {
      final d = _debitHead.firstMatch(texts[i]);
      final c = d == null ? _creditHead.firstMatch(texts[i]) : null;
      if (d == null && c == null) continue;
      direction = d != null ? TxnDirection.debit : TxnDirection.credit;
      final name = candidateAfter(i, (d ?? c)!.group(2)!);
      if (name != null && !name.contains('@')) {
        merchant = _titleCase(name.replaceAll(RegExp(r'\s*\(.*\)$'), ''));
      } else if (name != null) {
        merchant = name;
      }
      break;
    }
    if (RegExp(
          r'\b(money received|credited to your|received successfully)\b',
          caseSensitive: false,
        ).hasMatch(all) &&
        !RegExp(
          r'\b(paid to|sent to|paid successfully)\b',
          caseSensitive: false,
        ).hasMatch(all)) {
      direction = TxnDirection.credit;
    }
    if (pick?.credit == true) direction = TxnDirection.credit;

    // Reference: prefer the 12-digit UPI reference / UTR (matches bank SMS).
    final refs = <String>[];
    for (var i = 0; i < texts.length; i++) {
      if (!_txnIdLabel.hasMatch(texts[i])) continue;
      final utr = RegExp(
        r'(?<!\d)(\d{12})(?!\d)',
      ).firstMatch(texts[i].substring(_txnIdLabel.firstMatch(texts[i])!.start));
      if (utr != null) {
        refs.add(utr.group(1)!);
        continue;
      }
      final inline = RegExp(
        r'([A-Z0-9]{8,40})\s*$',
        caseSensitive: false,
      ).firstMatch(texts[i]);
      if (inline != null && RegExp(r'\d{6,}').hasMatch(inline.group(1)!)) {
        refs.add(inline.group(1)!.toUpperCase());
      } else if (i + 1 < texts.length &&
          RegExp(
            r'^[A-Z0-9 ]{8,30}$',
            caseSensitive: false,
          ).hasMatch(texts[i + 1])) {
        final v = texts[i + 1].replaceAll(' ', '').toUpperCase();
        if (RegExp(r'\d{6,}').hasMatch(v)) refs.add(v);
      }
    }
    final ref = refs.firstWhere(
      (r) => RegExp(r'^\d{12}$').hasMatch(r),
      orElse: () => refs.firstOrNull ?? '',
    );

    DateTime? date;
    for (final t in texts) {
      date = DateExtractor.extract(t, reference: reference);
      if (date != null) break;
    }

    return [
      ScreenshotTxn(
        amountPaise: amount,
        direction: direction,
        occurredAt: date,
        merchant: merchant,
        status: _statusFrom(all),
        reference: ref.isEmpty ? null : ref,
        layout: id,
      ),
    ];
  }
}

/// Transaction history list (UPI Lite history etc.). Rows contain a name
/// on the left, an amount on the right and a date below the name.
class HistoryListParser implements ScreenshotLayoutParser {
  @override
  String get id => 'history';

  @override
  int score(List<OcrLine> lines) {
    final amounts = lines.where((l) => _amountLine.hasMatch(l.text)).length;
    if (amounts >= 2) return 60 + (amounts * 5).clamp(0, 30);
    return amounts == 1 ? 30 : 0;
  }

  @override
  List<ScreenshotTxn> parse(List<OcrLine> lines, DateTime reference) {
    final hasGeometry = lines.any((l) => l.bottom > 0);
    return hasGeometry
        ? _parseGeometric(lines, reference)
        : _parseSequential(lines, reference);
  }

  List<ScreenshotTxn> _parseGeometric(List<OcrLine> lines, DateTime reference) {
    final sorted = [...lines]..sort((a, b) => a.top.compareTo(b.top));
    final amountLines = sorted
        .where((l) => _amountLine.hasMatch(l.text))
        .toList();
    final out = <ScreenshotTxn>[];
    for (var idx = 0; idx < amountLines.length; idx++) {
      final a = amountLines[idx];
      final m = _amountLine.firstMatch(a.text)!;
      final tol = a.height * 1.3;
      final prevTop = idx > 0 ? amountLines[idx - 1].bottom : -1e9;
      final nextTop = idx + 1 < amountLines.length
          ? amountLines[idx + 1].top
          : 1e9;
      // Lines belonging to this row: between neighbouring amount rows.
      final row = sorted
          .where(
            (l) =>
                l != a &&
                l.top > prevTop - 2 &&
                l.top < nextTop - 2 &&
                (l.centerY - a.centerY).abs() < tol * 3,
          )
          .toList();
      OcrLine? nameLine;
      for (final l in row) {
        if (l.left >= a.left) continue;
        if (_isNoise(l.text)) continue;
        if ((l.centerY - a.centerY).abs() > tol) continue;
        nameLine = l;
        break;
      }
      nameLine ??= row
          .where((l) => !_isNoise(l.text) && l.left < a.left)
          .firstOrNull;
      DateTime? date;
      for (final l in row) {
        final d = DateExtractor.extract(l.text, reference: reference);
        if (d != null) {
          date = d;
          break;
        }
      }
      final rowText = row.map((l) => l.text).join(' ');
      var dir = TxnDirection.debit;
      if (m.group(1) == '+' ||
          m.group(3)?.toLowerCase() == 'cr' ||
          RegExp(
            r'\b(received|credited|refund)\b',
            caseSensitive: false,
          ).hasMatch(rowText)) {
        dir = TxnDirection.credit;
      }
      out.add(
        ScreenshotTxn(
          amountPaise: Money.parseToPaise(m.group(2)!),
          direction: dir,
          occurredAt: date,
          merchant: nameLine == null
              ? null
              : FieldExtractors.cleanMerchant(_stripPrefix(nameLine.text)),
          status: _statusFrom(rowText),
          layout: id,
        ),
      );
    }
    return out;
  }

  List<ScreenshotTxn> _parseSequential(
    List<OcrLine> lines,
    DateTime reference,
  ) {
    final texts = lines
        .map((l) => l.text.trim())
        .where((t) => t.isNotEmpty)
        .toList();
    final out = <ScreenshotTxn>[];
    for (var i = 0; i < texts.length; i++) {
      final m = _amountLine.firstMatch(texts[i]);
      if (m == null) continue;
      String? name;
      for (var j = i - 1; j >= 0 && j >= i - 2; j--) {
        if (!_isNoise(texts[j])) {
          name = texts[j];
          break;
        }
      }
      DateTime? date;
      final window = [
        for (var j = i - 2; j <= i + 2; j++)
          if (j >= 0 && j < texts.length && j != i) texts[j],
      ];
      for (final w in window) {
        date = DateExtractor.extract(w, reference: reference);
        if (date != null) break;
      }
      final ctx = window.join(' ');
      out.add(
        ScreenshotTxn(
          amountPaise: Money.parseToPaise(m.group(2)!),
          direction:
              m.group(1) == '+' ||
                  RegExp(r'\breceived\b', caseSensitive: false).hasMatch(ctx)
              ? TxnDirection.credit
              : TxnDirection.debit,
          occurredAt: date,
          merchant: name == null
              ? null
              : FieldExtractors.cleanMerchant(_stripPrefix(name)),
          status: _statusFrom(ctx),
          layout: id,
        ),
      );
    }
    return out;
  }

  static String _stripPrefix(String s) => s.replaceFirst(
    RegExp(
      r'^(paid to|sent to|received from|to|from)\s*:?\s*',
      caseSensitive: false,
    ),
    '',
  );
}

/// OCR returns blocks in its own order; put lines back in screen order
/// (top to bottom, left to right within a row). No-op without geometry.
List<OcrLine> readingOrder(List<OcrLine> lines) {
  if (!lines.any((l) => l.bottom > 0)) return lines;
  final sorted = [...lines]
    ..sort((a, b) {
      final tol = (a.height < b.height ? a.height : b.height) * 0.5;
      if ((a.centerY - b.centerY).abs() <= tol) return a.left.compareTo(b.left);
      return a.centerY.compareTo(b.centerY);
    });
  return sorted;
}

/// Picks the best layout parser for the recognised text.
class ScreenshotParserEngine {
  final List<ScreenshotLayoutParser> parsers;
  ScreenshotParserEngine({List<ScreenshotLayoutParser>? parsers})
    : parsers = parsers ?? [DetailScreenParser(), HistoryListParser()];

  List<ScreenshotTxn> parse(List<OcrLine> lines, {DateTime? reference}) {
    if (lines.isEmpty) return const [];
    final ref = reference ?? DateTime.now();
    ScreenshotLayoutParser? best;
    var bestScore = 0;
    for (final p in parsers) {
      final s = p.score(lines);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (best == null || bestScore < 20) return const [];
    return best
        .parse(lines, ref)
        .where((t) => t.amountPaise != null && t.amountPaise! > 0)
        .toList();
  }
}

String _titleCase(String s) {
  // Keep mixed-case names as they are; tidy ALL-CAPS ones ("RAMESH KUMAR").
  if (s != s.toUpperCase()) return s;
  return s
      .split(' ')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');
}
