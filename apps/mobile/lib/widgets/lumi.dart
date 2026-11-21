import 'dart:io' show Platform;
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/tokens.dart';

/// Endless float/blink would keep widget tests from settling.
final bool _underTest = Platform.environment.containsKey('FLUTTER_TEST');

enum LumiMood { happy, proud, worried, sleepy, thinking }

/// Picks Lumi's mood from the day. Late night wins, then money worries.
LumiMood lumiMoodFor({
  required DateTime now,
  bool overBudget = false,
  bool overdue = false,
  bool streakOrBudgetOk = false,
  bool loading = false,
}) {
  if (loading) return LumiMood.thinking;
  if (now.hour >= 23 || now.hour < 5) return LumiMood.sleepy;
  if (overBudget || overdue) return LumiMood.worried;
  if (streakOrBudgetOk) return LumiMood.proud;
  return LumiMood.happy;
}

/// The LifeOS mascot: a small mint orb with a face, drawn in code.
/// Floats gently and blinks every few seconds unless animations are off.
class Lumi extends StatefulWidget {
  const Lumi({super.key, this.mood = LumiMood.happy, this.size = 64});
  final LumiMood mood;
  final double size;
  @override
  State<Lumi> createState() => _LumiState();
}

class _LumiState extends State<Lumi> with SingleTickerProviderStateMixin {
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 4),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion || _underTest) {
      _clock.stop();
      _clock.value = 0;
    } else if (!_clock.isAnimating) {
      _clock.repeat();
    }
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Lumi, the LifeOS helper, looks ${widget.mood.name}',
    child: SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _clock,
        builder: (context, _) {
          final t = _clock.value;
          final float = math.sin(t * math.pi * 2) * widget.size * .04;
          // Blink in the last ~5% of each 4 s cycle.
          final blink = t > .94
              ? 1 - ((t - .97).abs() / .03).clamp(0.0, 1.0)
              : 0.0;
          return Transform.translate(
            offset: Offset(0, float),
            child: CustomPaint(
              painter: LumiPainter(
                mood: widget.mood,
                blink: blink,
                dark: context.lc.dark,
              ),
            ),
          );
        },
      ),
    ),
  );
}

class LumiPainter extends CustomPainter {
  LumiPainter({required this.mood, this.blink = 0, this.dark = true});
  final LumiMood mood;
  final double blink;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final center = Offset(size.width / 2, size.height / 2);
    final r = s * .42;
    // Soft glow.
    canvas.drawCircle(
      center,
      r * 1.18,
      Paint()
        ..color = const Color(0xFF34D399).withValues(alpha: dark ? .22 : .18)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, s * .08),
    );
    // Body.
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(-.35, -.45),
          radius: 1,
          colors: [Color(0xFFA7F3D0), Color(0xFF34D399), Color(0xFF0FA678)],
          stops: [0, .55, 1],
        ).createShader(Rect.fromCircle(center: center, radius: r)),
    );
    // Shine.
    canvas.drawOval(
      Rect.fromCenter(
        center: center + Offset(-r * .38, -r * .5),
        width: r * .5,
        height: r * .28,
      ),
      Paint()..color = Colors.white.withValues(alpha: .55),
    );
    const ink = Color(0xFF04221A);
    final eye = Paint()..color = ink;
    final stroke = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = s * .045;
    final eyeY = center.dy - r * .08;
    final eyeDx = r * .34;
    final closed = mood == LumiMood.sleepy || blink > .5;
    for (final side in [-1, 1]) {
      final eyeCenter = Offset(center.dx + side * eyeDx, eyeY);
      if (closed) {
        canvas.drawArc(
          Rect.fromCenter(center: eyeCenter, width: r * .26, height: r * .16),
          0,
          math.pi,
          false,
          stroke,
        );
      } else if (mood == LumiMood.proud || mood == LumiMood.happy) {
        // Smiling eyes for proud, round for happy.
        if (mood == LumiMood.proud) {
          canvas.drawArc(
            Rect.fromCenter(center: eyeCenter, width: r * .26, height: r * .22),
            math.pi,
            math.pi,
            false,
            stroke,
          );
        } else {
          canvas.drawOval(
            Rect.fromCenter(center: eyeCenter, width: r * .17, height: r * .23),
            eye,
          );
        }
      } else {
        final dy = mood == LumiMood.thinking ? -r * .06 : 0.0;
        final dx = mood == LumiMood.thinking ? r * .05 : 0.0;
        canvas.drawOval(
          Rect.fromCenter(
            center: eyeCenter + Offset(dx, dy),
            width: r * .16,
            height: r * .2,
          ),
          eye,
        );
      }
    }
    // Cheeks.
    if (mood == LumiMood.happy || mood == LumiMood.proud) {
      final cheek = Paint()
        ..color = const Color(0xFFFB7185).withValues(alpha: .45);
      for (final side in [-1, 1]) {
        canvas.drawCircle(
          Offset(center.dx + side * r * .56, center.dy + r * .16),
          r * .1,
          cheek,
        );
      }
    }
    // Mouth.
    final mouthY = center.dy + r * .28;
    switch (mood) {
      case LumiMood.happy:
      case LumiMood.proud:
        canvas.drawArc(
          Rect.fromCenter(
            center: Offset(center.dx, mouthY - r * .08),
            width: r * .44,
            height: r * .32,
          ),
          .15,
          math.pi - .3,
          false,
          stroke,
        );
      case LumiMood.worried:
        canvas.drawArc(
          Rect.fromCenter(
            center: Offset(center.dx, mouthY + r * .06),
            width: r * .36,
            height: r * .22,
          ),
          math.pi + .25,
          math.pi - .5,
          false,
          stroke,
        );
      case LumiMood.sleepy:
        canvas.drawCircle(Offset(center.dx, mouthY), r * .07, eye);
        final z = TextPainter(
          text: TextSpan(
            text: 'z',
            style: TextStyle(
              fontSize: r * .42,
              fontWeight: FontWeight.w700,
              color: dark ? const Color(0xFFE8EEF9) : ink,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        z.paint(canvas, center + Offset(r * .72, -r * 1.05));
      case LumiMood.thinking:
        canvas.drawLine(
          Offset(center.dx - r * .14, mouthY),
          Offset(center.dx + r * .14, mouthY + r * .03),
          stroke,
        );
    }
  }

  @override
  bool shouldRepaint(LumiPainter old) =>
      old.mood != mood || old.blink != blink || old.dark != dark;
}
