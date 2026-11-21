import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The 8 colour pairs a generated avatar can use.
const avatarPairs = <(Color, Color)>[
  (Color(0xFF34D399), Color(0xFF38BDF8)),
  (Color(0xFFFB7185), Color(0xFFFBBF24)),
  (Color(0xFF2DD4BF), Color(0xFFA3E635)),
  (Color(0xFFC084FC), Color(0xFF38BDF8)),
  (Color(0xFFF472B6), Color(0xFFFB7185)),
  (Color(0xFFFBBF24), Color(0xFF34D399)),
  (Color(0xFF38BDF8), Color(0xFFC084FC)),
  (Color(0xFFA3E635), Color(0xFF2DD4BF)),
];

/// Stable (FNV-1a) hash so the same name always gets the same colours.
int nameHash(String name) {
  var hash = 0x811c9dc5;
  for (final unit in name.trim().toLowerCase().codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash;
}

int avatarPairFor(String name) => nameHash(name) % avatarPairs.length;

String initialsOf(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  final first = String.fromCharCode(words.first.runes.first);
  if (words.length == 1) return first.toUpperCase();
  return (first + String.fromCharCode(words.last.runes.first)).toUpperCase();
}

/// Rounded square, 2-colour mesh, initials in Sora, optional status dot.
class GeneratedAvatar extends StatelessWidget {
  const GeneratedAvatar({
    super.key,
    required this.name,
    this.size = 44,
    this.pair,
    this.statusDot = false,
  });
  final String name;
  final double size;
  final int? pair;
  final bool statusDot;

  @override
  Widget build(BuildContext context) {
    final colours = avatarPairs[(pair ?? avatarPairFor(name)) % 8];
    final radius = BorderRadius.circular(size * .32);
    return Semantics(
      label: 'Avatar for $name',
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              decoration: BoxDecoration(
                borderRadius: radius,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [colours.$1, colours.$2],
                ),
              ),
              child: ClipRRect(
                borderRadius: radius,
                child: Stack(
                  children: [
                    Positioned(
                      right: -size * .25,
                      top: -size * .25,
                      child: Container(
                        width: size * .8,
                        height: size * .8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              Colors.white.withValues(alpha: .45),
                              Colors.white.withValues(alpha: 0),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Center(
                      child: Text(
                        initialsOf(name),
                        style: TextStyle(
                          fontFamily: headingFont,
                          fontWeight: FontWeight.w700,
                          fontSize: size * .38,
                          color: const Color(0xFF0B1220),
                          height: 1,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (statusDot)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: size * .28,
                  height: size * .28,
                  decoration: BoxDecoration(
                    color: const Color(0xFF34D399),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      width: 2,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
