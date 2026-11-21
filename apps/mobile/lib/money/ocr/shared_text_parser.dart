/// Reads the text a payment app sends with its own "Share" button
/// ("Paid ₹160 to AJOY SEN ... UPI Ref 668878203763"), or a receipt copied as text.
library;

import '../parsing/date_extractor.dart';
import '../parsing/field_extractors.dart';
import '../parsing/notification_parser.dart';
import 'screenshot_parser.dart';

class SharedTextParser {
  SharedTextParser._();

  static final _link = RegExp(r'https?://\S+|www\.\S+', caseSensitive: false);

  static List<ScreenshotTxn> parse(String text, {DateTime? now}) {
    final today = now ?? DateTime.now();
    final clean = text.replaceAll(_link, ' ').replaceAll('\r', '');
    if (clean.trim().isEmpty) return const [];

    // 1. Receipt laid out line by line, like a screenshot.
    final lines = clean
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .map((l) => OcrLine(l))
        .toList();
    final asScreen = ScreenshotParserEngine().parse(lines, reference: today);
    if (asScreen.length == 1 && asScreen.single.amountPaise != null) {
      return [_withDate(asScreen.single, clean, today)];
    }

    // 2. One sentence ("Paid ₹160 to AJOY SEN via ..."): the notification parser.
    //    Try the whole text, then each paragraph (promo lines can hide it).
    final chunks = [
      clean,
      ...clean.split(RegExp(r'\n\s*\n|\n')),
    ].map((c) => c.trim()).where((c) => c.isNotEmpty);
    for (final chunk in chunks) {
      final p = NotificationParser().parse(
        packageName: 'share',
        title: '',
        text: chunk,
        postedAt: today,
      );
      if (p == null) continue;
      final date = DateExtractor.extract(clean, reference: today);
      return [
        ScreenshotTxn(
          amountPaise: p.amountPaise,
          direction: p.direction,
          occurredAt: date ?? today,
          merchant: _tidy(p.merchant) ?? p.upiId,
          status: p.status,
          reference: p.reference ?? FieldExtractors.reference(clean),
          layout: 'shared_text',
        ),
      ];
    }
    return asScreen;
  }

  /// "AJOY SEN" → "Ajoy Sen"; mixed-case names stay as they are.
  static String? _tidy(String? name) {
    if (name == null || name != name.toUpperCase()) return name;
    return name
        .split(' ')
        .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
        .join(' ');
  }

  static ScreenshotTxn _withDate(ScreenshotTxn t, String text, DateTime today) {
    if (t.occurredAt != null) return t;
    return ScreenshotTxn(
      amountPaise: t.amountPaise,
      direction: t.direction,
      occurredAt: DateExtractor.extract(text, reference: today) ?? today,
      merchant: t.merchant,
      status: t.status,
      reference: t.reference,
      layout: t.layout,
    );
  }

  /// Image + text from the same share describe one payment: keep the image's
  /// result and fill its gaps from the text when the amounts agree.
  static List<ScreenshotTxn> merge(
    List<ScreenshotTxn> fromImages,
    List<ScreenshotTxn> fromText,
  ) {
    if (fromImages.isEmpty) return fromText;
    if (fromText.isEmpty) return fromImages;
    return [
      for (final img in fromImages)
        () {
          final t = fromText
              .where((x) => x.amountPaise == img.amountPaise)
              .firstOrNull;
          if (t == null) return img;
          return ScreenshotTxn(
            amountPaise: img.amountPaise,
            direction: img.direction,
            occurredAt: img.occurredAt ?? t.occurredAt,
            merchant: img.merchant ?? t.merchant,
            status: img.status,
            reference: img.reference ?? t.reference,
            layout: img.layout,
          );
        }(),
    ];
  }
}
