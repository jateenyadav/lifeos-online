import 'package:flutter/material.dart';
import '../auth/auth_api.dart';
import '../theme/theme_controller.dart';
import '../theme/tokens.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';

/// More: profile, LifeOS AI (when set up), tracking, appearance, account.
class MoreSpace extends StatelessWidget {
  const MoreSpace({
    super.key,
    required this.account,
    required this.theme,
    required this.aiAvailable,
    required this.onOpenAi,
    required this.onOpenCapture,
    required this.onSignOut,
    required this.onDeleteAccount,
    this.busy = false,
  });
  final Account account;
  final ThemeController theme;
  final bool aiAvailable;
  final VoidCallback onOpenAi;
  final VoidCallback onOpenCapture;
  final VoidCallback onSignOut;
  final VoidCallback onDeleteAccount;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = context.lc;
    return AnimatedBuilder(
      animation: theme,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const LargeTitle('More'),
          LCard(
            hero: true,
            child: Row(
              children: [
                GeneratedAvatar(
                  name: account.name,
                  pair: theme.avatarPair,
                  size: 56,
                  statusDot: true,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(account.name, style: t.titleMedium),
                      Text(
                        account.email,
                        style: t.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          LCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                if (aiAvailable)
                  ListTile(
                    key: const Key('more_ai'),
                    leading: IconTile(
                      Icons.auto_awesome,
                      color: LifeColors.ai,
                      size: 36,
                    ),
                    title: const Text('LifeOS AI'),
                    subtitle: const Text('Free answers about your saved data'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: onOpenAi,
                  ),
                ListTile(
                  key: const Key('more_capture'),
                  leading: IconTile(
                    Icons.sms_outlined,
                    color: LifeColors.money,
                    size: 36,
                  ),
                  title: const Text('Automatic tracking'),
                  subtitle: const Text('Bank SMS, payment alerts, screenshots'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: onOpenCapture,
                ),
              ],
            ),
          ),
          const SectionHeader('Appearance'),
          LCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Theme', style: t.titleSmall),
                const SizedBox(height: 8),
                SegmentedButton<ThemeMode>(
                  key: const Key('theme_toggle'),
                  segments: const [
                    ButtonSegment(
                      value: ThemeMode.system,
                      icon: Icon(Icons.brightness_auto_outlined),
                      label: Text('System'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.light,
                      icon: Icon(Icons.light_mode_outlined),
                      label: Text('Light'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.dark,
                      icon: Icon(Icons.dark_mode_outlined),
                      label: Text('Dark'),
                    ),
                  ],
                  selected: {theme.mode},
                  onSelectionChanged: (value) => theme.setMode(value.first),
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  key: const Key('lumi_toggle'),
                  contentPadding: EdgeInsets.zero,
                  value: theme.lumiEnabled,
                  onChanged: theme.setLumi,
                  title: const Text('Show Lumi on Today'),
                  subtitle: const Text(
                    'The little mint helper with a daily tip',
                  ),
                ),
                const SizedBox(height: 4),
                Text('Avatar colours', style: t.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (var i = 0; i < avatarPairs.length; i++)
                      Semantics(
                        selected:
                            (theme.avatarPair ?? avatarPairFor(account.name)) ==
                            i,
                        button: true,
                        label: 'Colour pair ${i + 1}',
                        child: InkWell(
                          key: Key('avatar_pair_$i'),
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => theme.setAvatarPair(i),
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color:
                                    (theme.avatarPair ??
                                            avatarPairFor(account.name)) ==
                                        i
                                    ? c.primary
                                    : Colors.transparent,
                                width: 2,
                              ),
                            ),
                            child: GeneratedAvatar(
                              name: account.name,
                              pair: i,
                              size: 40,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SectionHeader('Account'),
          LCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                ListTile(
                  key: const Key('more_sign_out'),
                  leading: const Icon(Icons.logout),
                  title: Text(busy ? 'Please wait…' : 'Sign out'),
                  onTap: busy ? null : onSignOut,
                ),
                ListTile(
                  key: const Key('more_delete'),
                  leading: Icon(Icons.delete_forever_outlined, color: c.danger),
                  title: Text(
                    'Delete account',
                    style: TextStyle(color: c.danger),
                  ),
                  onTap: busy ? null : onDeleteAccount,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'LifeOS 0.2.0 · Sora and Manrope fonts (SIL Open Font License)',
            textAlign: TextAlign.center,
            style: t.bodySmall,
          ),
        ],
      ),
    );
  }
}
