import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import '../ocr/rupee_glyph.dart';
import '../ocr/screenshot_parser.dart';

/// On-device OCR. ML Kit's bundled Latin model runs fully offline; images
/// never leave the phone.
abstract class OcrService {
  Future<List<OcrLine>> recognize(String imagePath);
}

class MlKitOcrService implements OcrService {
  /// Flatten transparent / tiny images first (what apps' own "Share" buttons make).
  final bool prepare;
  MlKitOcrService({this.prepare = true});

  @override
  Future<List<OcrLine>> recognize(String imagePath) async {
    if (!prepare) return _recognize(imagePath);
    OcrPrepResult? prep;
    try {
      prep = await OcrImagePrep.prepare(
        imagePath,
        background: const ui.Color(0xFFFFFFFF),
      );
    } catch (_) {
      prep = null; // Unreadable here; let ML Kit try the original.
    }
    if (prep == null) return _recognize(imagePath);
    try {
      var lines = await _recognize(prep.path);
      // Light text on a see-through background vanishes on white: try black.
      if (prep.hadTransparency && lines.length < 3) {
        final dark = await OcrImagePrep.prepare(
          imagePath,
          background: const ui.Color(0xFF000000),
        );
        if (dark != null) {
          try {
            final alt = await _recognize(dark.path);
            if (alt.length > lines.length) lines = alt;
          } finally {
            _delete(dark.path);
          }
        }
      }
      return lines;
    } finally {
      _delete(prep.path);
    }
  }

  static void _delete(String path) {
    try {
      File(path).deleteSync();
    } catch (_) {}
  }

  Future<List<OcrLine>> _recognize(String imagePath) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final result = await recognizer.processImage(
        InputImage.fromFilePath(imagePath),
      );
      final lines = <OcrLine>[];
      _Pixels? pixels;
      for (final block in result.blocks) {
        for (final line in block.lines) {
          final r = line.boundingBox;
          bool? rupee;
          // "71,250": was the leading 7 really a ₹? Check the glyph's shape.
          if (_sevenAmount.hasMatch(line.text.trim()) &&
              line.elements.isNotEmpty) {
            final el = line.elements.first;
            final box = el.symbols.isNotEmpty
                ? el.symbols.first.boundingBox
                : ui.Rect.fromLTWH(
                    el.boundingBox.left,
                    el.boundingBox.top,
                    el.boundingBox.width / el.text.length.clamp(1, 99),
                    el.boundingBox.height,
                  );
            try {
              pixels ??= await _Pixels.load(imagePath);
              rupee = RupeeGlyph.looksLikeRupee(
                pixels.rgba,
                pixels.width,
                pixels.height,
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
              );
            } catch (_) {
              rupee = null;
            }
          }
          lines.add(
            OcrLine(
              line.text,
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
              rupeeGlyph: rupee,
            ),
          );
        }
      }
      return lines;
    } finally {
      await recognizer.close();
    }
  }
}

class OcrPrepResult {
  final String path;
  final bool hadTransparency;
  final double scale;
  const OcrPrepResult(this.path, this.hadTransparency, this.scale);
}

/// Images made by an app's "Share" button are often PNGs with a see-through
/// background (Android turns that black, so dark text disappears) or small
/// cards where letters are too tiny for OCR. Draws the image on a solid
/// background and enlarges small ones. Returns null when nothing needs fixing.
class OcrImagePrep {
  OcrImagePrep._();

  /// ML Kit needs letters roughly 16+ px tall; receipts this narrow are too small.
  static const minWidth = 900;
  static const targetWidth = 1080;

  static double scaleFor(int width) =>
      width >= minWidth ? 1.0 : (targetWidth / width).clamp(1.0, 4.0);

  /// True when any pixel is not fully opaque (checks every pixel; cheap for screenshots).
  static bool hasTransparency(Uint8List rgba) {
    for (var i = 3; i < rgba.length; i += 4) {
      if (rgba[i] != 255) return true;
    }
    return false;
  }

  static Future<OcrPrepResult?> prepare(
    String path, {
    required ui.Color background,
  }) async {
    final codec = await ui.instantiateImageCodec(
      await File(path).readAsBytes(),
    );
    final img = (await codec.getNextFrame()).image;
    codec.dispose();
    try {
      final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      final transparent =
          data != null && hasTransparency(data.buffer.asUint8List());
      final scale = scaleFor(img.width);
      if (!transparent && scale == 1.0) return null;
      final w = (img.width * scale).round();
      final h = (img.height * scale).round();
      final rec = ui.PictureRecorder();
      final canvas = ui.Canvas(rec);
      canvas.drawRect(
        ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
        ui.Paint()..color = background,
      );
      canvas.drawImageRect(
        img,
        ui.Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()),
        ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
        ui.Paint()..filterQuality = ui.FilterQuality.high,
      );
      final out = await rec.endRecording().toImage(w, h);
      try {
        final png = await out.toByteData(format: ui.ImageByteFormat.png);
        final f = File(
          '${Directory.systemTemp.path}/ocrprep-${DateTime.now().microsecondsSinceEpoch}.png',
        );
        await f.writeAsBytes(png!.buffer.asUint8List(), flush: true);
        return OcrPrepResult(f.path, transparent, scale);
      } finally {
        out.dispose();
      }
    } finally {
      img.dispose();
    }
  }
}

final _sevenAmount = RegExp(r'^[+\-]?\s*7\s?[\d,]+(\.\d{1,2})?$');

class _Pixels {
  final Uint8List rgba;
  final int width, height;
  _Pixels(this.rgba, this.width, this.height);

  static Future<_Pixels> load(String path) async {
    final codec = await ui.instantiateImageCodec(
      await File(path).readAsBytes(),
    );
    final frame = await codec.getNextFrame();
    final img = frame.image;
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    final p = _Pixels(data!.buffer.asUint8List(), img.width, img.height);
    img.dispose();
    codec.dispose();
    return p;
  }
}

/// Test double returning fixed lines.
class FakeOcrService implements OcrService {
  final List<OcrLine> lines;
  FakeOcrService(this.lines);
  @override
  Future<List<OcrLine>> recognize(String imagePath) async => lines;
}
