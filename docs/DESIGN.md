# LifeOS look — "Midnight + mint"

One design language for the website and the Flutter app. Modern, calm, a little playful.
It must not copy SpendSense (no glassmorphism purple gradient, no Plus Jakarta Sans, no "Chillar").

## Colours (tokens)

| token | dark (default at night / system dark) | light |
|---|---|---|
| bg | `#0B1220` | `#F5F7FB` |
| bg-elevated (sidebar, nav bar) | `#0F1A2E` | `#FFFFFF` |
| surface (cards) | `#131F35` at 92% + 1px `#22314F` border | `#FFFFFF` + 1px `#E3E8F2` border |
| surface-2 (inputs, chips) | `#1A2842` | `#EEF2F8` |
| text | `#E8EEF9` | `#0E1726` |
| text-muted | `#93A3BF` | `#5B6B85` |
| primary (mint) | `#34D399` | `#0FA678` |
| primary-ink (text on primary) | `#04221A` | `#FFFFFF` |
| accent (coral) | `#FB7185` | `#E5486A` |
| info (sky) | `#38BDF8` | `#0284C7` |
| warn (amber) | `#FBBF24` | `#B7791F` |
| danger | `#F87171` | `#DC2626` |
| money-in | mint | mint |
| money-out | coral | coral |

Space colours (icon tiles, small accents only, never whole-page washes): Today mint, Notes sky,
Workouts coral, Routines amber, Money `#2DD4BF` teal, AI `#A3E635` lime.
Charts: categorical order mint, sky, coral, amber, teal, lime, `#F472B6` pink, `#C084FC` lilac,
`#94A3B8` slate (validated for both backgrounds). No rainbow gradients on text.

Background: flat `bg` plus one very soft radial glow (mint 6% top-left, sky 5% bottom-right).
Cards: radius 20 (web) / 20 (mobile), shadow only in light mode (`0 1px 2px #0E172614, 0 8px 24px #0E17260F`).
A "hero" card per screen may use a subtle mint→sky 10% tint.

## Type

- Headings: **Sora** (600/700). Body and UI: **Manrope** (400/500/600/700). Numbers: Manrope with
  `font-variant-numeric: tabular-nums` (Flutter: `FontFeature.tabularFigures()`).
- Web: self-host with `@fontsource/sora` and `@fontsource/manrope` (no Google Fonts request at runtime).
- Flutter: bundle the TTFs under `apps/mobile/assets/fonts/` (both are SIL OFL; keep the licence files).
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 44. Money hero numbers 36–44 Sora 700.

## Avatars

- **User avatar:** generated from the user's name: a rounded square with a 2-colour mesh (picked
  deterministically from the palette by name hash), initials in Sora, and a tiny status dot.
  Users can pick one of 8 colour pairs in Settings (stored on the user profile, field `avatar`).
- **Mascot "Lumi":** a small mint orb with a face, drawn in code (SVG on web, CustomPainter on mobile),
  blinks every few seconds, floats gently, and changes mood: happy (good day), proud (streak/budget
  ok), worried (over budget / overdue), sleepy (late night), thinking (loading). It sits in the Today
  hero and says one short tip. Respect `prefers-reduced-motion` / disable animations setting. It can be
  turned off in Settings.
- Khata people get generated avatars the same way as the user avatar (initials + colour pair).

## Layout

- Web: left sidebar (collapsible to icons ≥ 900 px; bottom tab bar < 900 px), top bar with search,
  theme toggle (system / light / dark), avatar menu. Full-height sidebar (fix the current bug where
  its background stops at 900 px). Max content width 1200 px.
- Mobile: bottom navigation (Today, Money, Notes, Habits, More), large titles, FAB per space.
- Motion: 150–250 ms ease-out; cards lift 2 px on hover (web). Numbers count up once on first load.
- Accessibility: contrast ≥ 4.5:1 for text, focus rings in mint, tap targets ≥ 44 px, full keyboard use.
