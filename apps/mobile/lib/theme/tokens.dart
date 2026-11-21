import 'package:flutter/material.dart';

/// "Midnight + mint" colour tokens from docs/DESIGN.md.
@immutable
class LifeColors extends ThemeExtension<LifeColors> {
  const LifeColors({
    required this.bg,
    required this.bgElevated,
    required this.surface,
    required this.border,
    required this.surface2,
    required this.text,
    required this.muted,
    required this.primary,
    required this.primaryInk,
    required this.accent,
    required this.info,
    required this.warn,
    required this.danger,
    required this.dark,
  });

  final Color bg;
  final Color bgElevated;
  final Color surface;
  final Color border;
  final Color surface2;
  final Color text;
  final Color muted;
  final Color primary;
  final Color primaryInk;
  final Color accent;
  final Color info;
  final Color warn;
  final Color danger;
  final bool dark;

  Color get moneyIn => primary;
  Color get moneyOut => accent;

  static const darkTokens = LifeColors(
    bg: Color(0xFF0B1220),
    bgElevated: Color(0xFF0F1A2E),
    surface: Color(0xEB131F35),
    border: Color(0xFF22314F),
    surface2: Color(0xFF1A2842),
    text: Color(0xFFE8EEF9),
    muted: Color(0xFF93A3BF),
    primary: Color(0xFF34D399),
    primaryInk: Color(0xFF04221A),
    accent: Color(0xFFFB7185),
    info: Color(0xFF38BDF8),
    warn: Color(0xFFFBBF24),
    danger: Color(0xFFF87171),
    dark: true,
  );

  static const lightTokens = LifeColors(
    bg: Color(0xFFF5F7FB),
    bgElevated: Color(0xFFFFFFFF),
    surface: Color(0xFFFFFFFF),
    border: Color(0xFFE3E8F2),
    surface2: Color(0xFFEEF2F8),
    text: Color(0xFF0E1726),
    muted: Color(0xFF5B6B85),
    primary: Color(0xFF0FA678),
    primaryInk: Color(0xFFFFFFFF),
    accent: Color(0xFFE5486A),
    info: Color(0xFF0284C7),
    warn: Color(0xFFB7791F),
    danger: Color(0xFFDC2626),
    dark: false,
  );

  /// Space accent colours (icon tiles and small accents only).
  static const today = Color(0xFF34D399);
  static const notes = Color(0xFF38BDF8);
  static const workouts = Color(0xFFFB7185);
  static const routines = Color(0xFFFBBF24);
  static const money = Color(0xFF2DD4BF);
  static const ai = Color(0xFFA3E635);

  /// Categorical chart order, validated on both backgrounds.
  static const chart = [
    Color(0xFF34D399),
    Color(0xFF38BDF8),
    Color(0xFFFB7185),
    Color(0xFFFBBF24),
    Color(0xFF2DD4BF),
    Color(0xFFA3E635),
    Color(0xFFF472B6),
    Color(0xFFC084FC),
    Color(0xFF94A3B8),
  ];

  @override
  LifeColors copyWith() => this;

  @override
  LifeColors lerp(ThemeExtension<LifeColors>? other, double t) =>
      other is LifeColors && t >= .5 ? other : this;
}

extension LifeThemeContext on BuildContext {
  LifeColors get lc =>
      Theme.of(this).extension<LifeColors>() ?? LifeColors.lightTokens;
  bool get reduceMotion => MediaQuery.maybeDisableAnimationsOf(this) ?? false;
}

const tabular = [FontFeature.tabularFigures()];
