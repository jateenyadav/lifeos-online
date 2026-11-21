import 'dart:typed_data';

/// Tells "₹" from "7" by shape, for when OCR reads the rupee sign as a 7.
///
/// Both glyphs start with a full-width top bar and a diagonal. The rupee sign
/// has a second horizontal bar in its upper half; a 7 does not. We count
/// horizontal "bands" (rows where ink spans most of the glyph's width) in the
/// top 60% of the character's box.
class RupeeGlyph {
  /// [rgba] is the decoded image (4 bytes per pixel, [width] × [height]).
  /// The box is the character's bounding box in image pixels.
  /// Returns true for "₹", false for "7", null when the box is unusable.
  static bool? looksLikeRupee(
    Uint8List rgba,
    int width,
    int height, {
    required double left,
    required double top,
    required double right,
    required double bottom,
  }) {
    final l = left.floor().clamp(0, width - 1);
    final r = right.ceil().clamp(0, width - 1);
    final t = top.floor().clamp(0, height - 1);
    final b = bottom.ceil().clamp(0, height - 1);
    final w = r - l + 1, h = b - t + 1;
    if (w < 4 || h < 8) return null;

    // Background = median luminance of the box border.
    int lum(int x, int y) {
      final i = (y * width + x) * 4;
      return (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) ~/ 1000;
    }

    final border = <int>[];
    for (var x = l; x <= r; x++) {
      border
        ..add(lum(x, t))
        ..add(lum(x, b));
    }
    for (var y = t; y <= b; y++) {
      border
        ..add(lum(l, y))
        ..add(lum(r, y));
    }
    border.sort();
    final bg = border[border.length ~/ 2];

    // Ink coverage per row.
    final cover = List<double>.filled(h, 0);
    for (var y = 0; y < h; y++) {
      var ink = 0;
      for (var x = l; x <= r; x++) {
        if ((lum(x, t + y) - bg).abs() > 70) ink++;
      }
      cover[y] = ink / w;
    }
    final maxCover = cover.reduce((a, b) => a > b ? a : b);
    if (maxCover < 0.3) return null;

    // Count separate bands of wide rows in the top 60%.
    final limit = (h * 0.6).ceil();
    var bands = 0;
    var inBand = false;
    for (var y = 0; y < limit; y++) {
      final wide = cover[y] >= maxCover * 0.6;
      if (wide && !inBand) bands++;
      inBand = wide;
    }
    if (bands == 0) return null;
    return bands >= 2;
  }
}
