import 'package:flutter/material.dart';
import '../money/core/money.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Rounded card with the token border (and a soft shadow in light mode).
class LCard extends StatelessWidget {
  const LCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = const EdgeInsets.only(bottom: 12),
    this.hero = false,
    this.onTap,
    this.color,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final bool hero;
  final VoidCallback? onTap;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final radius = BorderRadius.circular(20);
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? c.surface,
        borderRadius: radius,
        border: Border.all(color: c.border),
        gradient: hero
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.alphaBlend(c.primary.withValues(alpha: .10), c.surface),
                  Color.alphaBlend(c.info.withValues(alpha: .10), c.surface),
                ],
              )
            : null,
        boxShadow: c.dark
            ? null
            : const [
                BoxShadow(
                  color: Color(0x140E1726),
                  blurRadius: 2,
                  offset: Offset(0, 1),
                ),
                BoxShadow(
                  color: Color(0x0F0E1726),
                  blurRadius: 24,
                  offset: Offset(0, 8),
                ),
              ],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Large Sora page title with an optional subtitle and trailing widget.
class LargeTitle extends StatelessWidget {
  const LargeTitle(this.title, {super.key, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18, top: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: context.lc.muted),
                ),
              ],
            ],
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 10),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
        ),
        if (action != null)
          TextButton(onPressed: onAction, child: Text(action!)),
      ],
    ),
  );
}

/// Coloured rounded icon tile (space accents).
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, required this.color, this.size = 40});
  final IconData icon;
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: context.lc.dark ? .16 : .14),
      borderRadius: BorderRadius.circular(size * .32),
    ),
    child: Icon(
      icon,
      size: size * .52,
      color: context.lc.dark ? color : Color.lerp(color, Colors.black, .35),
    ),
  );
}

/// Formatted paise in tabular figures.
class MoneyText extends StatelessWidget {
  const MoneyText(
    this.paise, {
    super.key,
    this.style,
    this.signed = false,
    this.color,
    this.compact = false,
  });
  final int paise;
  final TextStyle? style;
  final bool signed;
  final Color? color;
  final bool compact;
  @override
  Widget build(BuildContext context) => Text(
    compact ? Money.compact(paise) : Money.format(paise, signed: signed),
    style: (style ?? Theme.of(context).textTheme.titleMedium)?.copyWith(
      fontFeatures: tabular,
      color: color,
    ),
  );
}

/// Hero number that counts up once (instant when animations are off).
class CountUpMoney extends StatelessWidget {
  const CountUpMoney(this.paise, {super.key, this.size = 40, this.color});
  final int paise;
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: headingFont,
      fontWeight: FontWeight.w700,
      fontSize: size,
      fontFeatures: tabular,
      color: color ?? context.lc.text,
      letterSpacing: -1,
      height: 1.1,
    );
    if (context.reduceMotion) {
      return Text(Money.format(paise), style: style);
    }
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: paise.toDouble()),
      duration: const Duration(milliseconds: 700),
      curve: Curves.easeOutCubic,
      builder: (context, value, _) => Text(
        Money.format(value.round() == paise ? paise : (value ~/ 100) * 100),
        style: style,
        semanticsLabel: Money.format(paise),
      ),
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.color,
    this.icon,
  });
  final String label;
  final String value;
  final Color? color;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => LCard(
    margin: EdgeInsets.zero,
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: color ?? context.lc.muted),
              const SizedBox(width: 6),
            ],
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelSmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontFeatures: tabular,
              color: color == null || context.lc.dark
                  ? color
                  : Color.lerp(color, Colors.black, .35),
            ),
          ),
        ),
      ],
    ),
  );
}

/// Grid of stat tiles that reflows on narrow screens / big text.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children, this.minWidth = 120});
  final List<Widget> children;
  final double minWidth;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final minimum = minWidth * MediaQuery.textScalerOf(context).scale(1);
      final columns = (constraints.maxWidth / minimum).floor().clamp(
        1,
        children.length,
      );
      final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
      return Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final child in children) SizedBox(width: width, child: child),
          ],
        ),
      );
    },
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.detail,
    this.icon = Icons.spa_outlined,
  });
  final String title;
  final String detail;
  final IconData icon;
  @override
  Widget build(BuildContext context) => LCard(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Column(
        children: [
          IconTile(icon, color: LifeColors.today, size: 48),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    ),
  );
}

class Banner2 extends StatelessWidget {
  const Banner2({
    super.key,
    required this.text,
    this.tone,
    this.action,
    this.onAction,
    this.icon = Icons.info_outline,
  });
  final String text;
  final Color? tone;
  final String? action;
  final VoidCallback? onAction;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final color = tone ?? context.lc.info;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: .35)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Semantics(
              liveRegion: true,
              child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
            ),
          ),
          if (action != null)
            TextButton(onPressed: onAction, child: Text(action!)),
        ],
      ),
    );
  }
}

Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String body,
  String yes = 'Delete',
  bool danger = true,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            style: danger
                ? TextButton.styleFrom(foregroundColor: context.lc.danger)
                : null,
            onPressed: () => Navigator.pop(context, true),
            child: Text(yes),
          ),
        ],
      ),
    ) ==
    true;

void snack(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
