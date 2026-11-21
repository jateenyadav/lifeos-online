import 'package:flutter/material.dart';
import 'tokens.dart';

const headingFont = 'Sora';
const bodyFont = 'Manrope';

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark
      ? LifeColors.darkTokens
      : LifeColors.lightTokens;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primary,
    onPrimary: c.primaryInk,
    secondary: c.info,
    onSecondary: c.primaryInk,
    tertiary: c.accent,
    onTertiary: Colors.white,
    error: c.danger,
    onError: Colors.white,
    surface: c.bg,
    onSurface: c.text,
    onSurfaceVariant: c.muted,
    surfaceContainerLowest: c.bgElevated,
    surfaceContainerLow: c.surface,
    surfaceContainer: c.surface,
    surfaceContainerHigh: c.surface2,
    surfaceContainerHighest: c.surface2,
    outline: c.border,
    outlineVariant: c.border,
    primaryContainer: c.primary.withValues(alpha: .16),
    onPrimaryContainer: c.text,
    secondaryContainer: c.primary.withValues(alpha: .16),
    onSecondaryContainer: c.text,
  );
  TextStyle h(double size, [FontWeight weight = FontWeight.w700]) => TextStyle(
    fontFamily: headingFont,
    fontSize: size,
    fontWeight: weight,
    color: c.text,
    letterSpacing: -0.4,
    height: 1.2,
  );
  TextStyle b(double size, [FontWeight weight = FontWeight.w500]) => TextStyle(
    fontFamily: bodyFont,
    fontSize: size,
    fontWeight: weight,
    color: c.text,
    height: 1.4,
  );
  final radius = BorderRadius.circular(14);
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: bodyFont,
    scaffoldBackgroundColor: c.bg,
    canvasColor: c.bg,
    extensions: [c],
    splashFactory: InkSparkle.constantTurbulenceSeedSplashFactory,
    textTheme: TextTheme(
      displaySmall: h(44),
      headlineLarge: h(32),
      headlineMedium: h(24),
      headlineSmall: h(20, FontWeight.w600),
      titleLarge: h(20, FontWeight.w600),
      titleMedium: b(16, FontWeight.w700),
      titleSmall: b(14, FontWeight.w700),
      bodyLarge: b(16),
      bodyMedium: b(14),
      bodySmall: b(12).copyWith(color: c.muted),
      labelLarge: b(14, FontWeight.w700),
      labelMedium: b(12, FontWeight.w600),
      labelSmall: b(11, FontWeight.w600).copyWith(color: c.muted),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      surfaceTintColor: Colors.transparent,
      foregroundColor: c.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: h(20, FontWeight.w600),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: c.border),
      ),
    ),
    dividerTheme: DividerThemeData(color: c.border, space: 1),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.bgElevated,
      surfaceTintColor: Colors.transparent,
      indicatorColor: c.primary.withValues(alpha: c.dark ? .18 : .14),
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) =>
            b(
              12,
              states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w600,
            ).copyWith(
              color: states.contains(WidgetState.selected) ? c.text : c.muted,
            ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? c.primary : c.muted,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface2,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: b(15).copyWith(color: c.muted),
      labelStyle: b(15).copyWith(color: c.muted),
      errorMaxLines: 3,
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: c.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: c.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: c.primary, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        textStyle: b(15, FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 48),
        foregroundColor: c.text,
        side: BorderSide(color: c.border),
        textStyle: b(14, FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 44),
        foregroundColor: c.primary,
        textStyle: b(14, FontWeight.w700),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.primary,
      foregroundColor: c.primaryInk,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface2,
      selectedColor: c.primary.withValues(alpha: .2),
      side: BorderSide(color: c.border),
      labelStyle: b(13, FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.bgElevated,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.bgElevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      titleTextStyle: h(20, FontWeight.w600),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.dark ? c.surface2 : c.text,
      contentTextStyle: b(14).copyWith(color: c.dark ? c.text : c.bg),
      shape: RoundedRectangleBorder(borderRadius: radius),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: c.muted,
      titleTextStyle: b(15, FontWeight.w600),
      subtitleTextStyle: b(13).copyWith(color: c.muted),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? c.primaryInk : c.muted,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? c.primary : c.surface2,
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: c.primary.withValues(alpha: .18),
        selectedForegroundColor: c.text,
        side: BorderSide(color: c.border),
      ),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: c.text,
      unselectedLabelColor: c.muted,
      indicatorColor: c.primary,
      dividerColor: Colors.transparent,
      labelStyle: b(14, FontWeight.w700),
      unselectedLabelStyle: b(14, FontWeight.w600),
      tabAlignment: TabAlignment.start,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.primary,
      linearTrackColor: c.surface2,
    ),
  );
}
