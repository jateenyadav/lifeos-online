import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/ocr/rupee_glyph.dart';

/// Draws a crude glyph from filled rectangles on a white 40×60 canvas.
Uint8List canvas(List<(int, int, int, int)> rects, {bool dark = false}) {
  const w = 40, h = 60;
  final px = Uint8List(w * h * 4);
  final bg = dark ? 18 : 255, ink = dark ? 232 : 20;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final on = rects.any(
        (r) => x >= r.$1 && x < r.$1 + r.$3 && y >= r.$2 && y < r.$2 + r.$4,
      );
      final v = on ? ink : bg;
      final i = (y * w + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

// Diagonal stroke as a staircase of small blocks.
List<(int, int, int, int)> diagonal(int fromY) => [
  for (var y = fromY; y < 56; y += 4) (30 - (y - fromY) ~/ 3, y, 6, 4),
];

bool? check(Uint8List px) => RupeeGlyph.looksLikeRupee(
  px,
  40,
  60,
  left: 4,
  top: 4,
  right: 36,
  bottom: 56,
);

void main() {
  test('rupee sign (two top bars) is recognised', () {
    final rupee = canvas([
      (6, 6, 28, 4),
      (6, 18, 24, 4),
      (8, 10, 10, 8),
      ...diagonal(24),
    ]);
    expect(check(rupee), isTrue);
  });

  test('seven (one top bar) is not a rupee', () {
    final seven = canvas([(6, 6, 28, 5), ...diagonal(11)]);
    expect(check(seven), isFalse);
  });

  test('works on dark-mode screenshots', () {
    final rupee = canvas([
      (6, 6, 28, 4),
      (6, 18, 24, 4),
      (8, 10, 10, 8),
      ...diagonal(24),
    ], dark: true);
    expect(check(rupee), isTrue);
  });

  test('empty or tiny boxes give no answer', () {
    expect(check(canvas([])), isNull);
    expect(
      RupeeGlyph.looksLikeRupee(
        canvas([]),
        40,
        60,
        left: 1,
        top: 1,
        right: 3,
        bottom: 4,
      ),
      isNull,
    );
  });
}
