import 'package:flutter/material.dart';
import '../money/api/money_api.dart';
import '../money/core/money.dart';
import '../money/ui/money_store.dart';
import '../theme/tokens.dart';
import '../widgets/avatar.dart';
import '../widgets/lumi.dart';
import '../widgets/ui.dart';
import 'workspace_controller.dart';
import 'utils.dart';

enum TodayAction { note, routine, workout, payment, ai, money, notes, habits }

/// One short, kind tip for Lumi to say.
String lumiTip({
  required DateTime now,
  required int routinesLeft,
  required int reminders,
  required int reviewCount,
  required bool overBudget,
}) {
  if (now.hour >= 23 || now.hour < 5) {
    return 'It is late. The rest can wait for tomorrow.';
  }
  if (overBudget) {
    return 'This month is over budget. One quiet no-spend day helps.';
  }
  if (reviewCount > 0) {
    return '$reviewCount payment${reviewCount == 1 ? '' : 's'} need a quick look in Money.';
  }
  if (reminders > 0) {
    return '$reminders reminder${reminders == 1 ? ' is' : 's are'} due. Pick the smallest one first.';
  }
  if (routinesLeft > 0) {
    return '$routinesLeft little routine${routinesLeft == 1 ? '' : 's'} left today. You have got this.';
  }
  return 'All caught up. Enjoy a calm moment.';
}

class TodaySpace extends StatefulWidget {
  const TodaySpace({
    super.key,
    required this.store,
    required this.money,
    required this.name,
    required this.onAction,
    this.aiAvailable = false,
    this.lumiEnabled = true,
    this.avatarPair,
    this.now,
  });
  final WorkspaceController store;
  final MoneyStore? money;
  final String name;
  final ValueChanged<TodayAction> onAction;
  final bool aiAvailable;
  final bool lumiEnabled;
  final int? avatarPair;
  final DateTime Function()? now;
  @override
  State<TodaySpace> createState() => _TodaySpaceState();
}

class _TodaySpaceState extends State<TodaySpace> {
  Json? _overview;
  bool _moneyLoading = true;

  @override
  void initState() {
    super.initState();
    widget.money?.addListener(_loadMoney);
    _loadMoney();
  }

  @override
  void dispose() {
    widget.money?.removeListener(_loadMoney);
    super.dispose();
  }

  Future<void> _loadMoney() async {
    final money = widget.money;
    if (money == null) {
      setState(() => _moneyLoading = false);
      return;
    }
    try {
      final data = await money.api.overview(monthKey(DateTime.now()));
      if (mounted) setState(() => _overview = data);
    } catch (_) {
      // Money is optional on Today; the Money space shows the error.
    } finally {
      if (mounted) setState(() => _moneyLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final now = (widget.now ?? DateTime.now)();
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final today = dateKey(now);
    final routines = store.data['routines']!
        .where((entry) => dueOn(entry, today))
        .toList();
    final done = routines.where((entry) => isDone(entry, today)).length;
    final reminders =
        store.data['notes']!
            .where(
              (entry) =>
                  entry['kind'] == 'reminder' &&
                  entry['archived'] != true &&
                  entry['completed'] != true &&
                  (entry['dueDate'] as String? ?? '9').compareTo(today) <= 0,
            )
            .toList()
          ..sort(
            (a, b) =>
                (a['dueDate'] as String).compareTo(b['dueDate'] as String),
          );
    final workouts = store.data['workouts']!
        .where((entry) => recentDays().contains(entry['date']))
        .length;
    final spent = asInt(_overview?['spentMinor']);
    final budget = _overview?['budget'] as Map?;
    final overBudget =
        budget != null &&
        asInt(budget['usedMinor']) > asInt(budget['limitMinor']);
    final review = asInt(_overview?['reviewCount']);
    final mood = lumiMoodFor(
      now: now,
      overBudget: overBudget,
      overdue: reminders.any(
        (r) => (r['dueDate'] as String).compareTo(today) < 0,
      ),
      streakOrBudgetOk: routines.isNotEmpty && done == routines.length,
      loading: store.loading,
    );
    final greeting = now.hour < 12
        ? 'Good morning'
        : now.hour < 17
        ? 'Good afternoon'
        : 'Good evening';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(greeting, style: t.bodyMedium?.copyWith(color: c.muted)),
                  Semantics(
                    header: true,
                    child: Text(
                      widget.name.split(' ').first,
                      style: t.headlineLarge,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            GeneratedAvatar(
              name: widget.name,
              pair: widget.avatarPair,
              size: 48,
              statusDot: true,
            ),
          ],
        ),
        const SizedBox(height: 16),
        LCard(
          key: const Key('today_hero'),
          hero: true,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (widget.lumiEnabled) ...[
                Lumi(mood: mood, size: 72),
                const SizedBox(width: 14),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.lumiEnabled ? 'Lumi says' : 'Today',
                      style: t.labelMedium?.copyWith(color: c.primary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      lumiTip(
                        now: now,
                        routinesLeft: routines.length - done,
                        reminders: reminders.length,
                        reviewCount: review,
                        overBudget: overBudget,
                      ),
                      key: const Key('lumi_tip'),
                      style: t.titleMedium,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        StatGrid(
          minWidth: 110,
          children: [
            StatTile(
              label: 'Daily usuals',
              value: '$done / ${routines.length}',
              icon: Icons.favorite_border,
              color: LifeColors.routines,
            ),
            StatTile(
              label: 'Sessions · 7 days',
              value: '$workouts',
              icon: Icons.fitness_center_outlined,
              color: LifeColors.workouts,
            ),
            StatTile(
              key: const Key('today_spent'),
              label: 'Spent this month',
              value:
                  widget.money == null || (_moneyLoading && _overview == null)
                  ? '—'
                  : Money.format(spent),
              icon: Icons.account_balance_wallet_outlined,
              color: LifeColors.money,
            ),
          ],
        ),
        const SectionTitle('Quick add'),
        GridView.count(
          crossAxisCount: MediaQuery.textScalerOf(context).scale(1) > 1.3
              ? 1
              : 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: MediaQuery.textScalerOf(context).scale(1) > 1.3
              ? 4.2
              : 2.3,
          children: [
            _Quick(
              icon: Icons.edit_note_outlined,
              color: LifeColors.notes,
              title: 'Note',
              onTap: () => widget.onAction(TodayAction.note),
            ),
            _Quick(
              icon: Icons.account_balance_wallet_outlined,
              color: LifeColors.money,
              title: 'Payment',
              onTap: () => widget.onAction(TodayAction.payment),
            ),
            _Quick(
              icon: Icons.favorite_border,
              color: LifeColors.routines,
              title: 'Routine',
              onTap: () => widget.onAction(TodayAction.routine),
            ),
            _Quick(
              icon: Icons.fitness_center_outlined,
              color: LifeColors.workouts,
              title: 'Workout',
              onTap: () => widget.onAction(TodayAction.workout),
            ),
          ],
        ),
        if (widget.aiAvailable) ...[
          const SizedBox(height: 12),
          LCard(
            key: const Key('today_ai'),
            onTap: () => widget.onAction(TodayAction.ai),
            child: Row(
              children: [
                IconTile(Icons.auto_awesome, color: LifeColors.ai),
                const SizedBox(width: 12),
                const Expanded(child: Text('Ask LifeOS AI about your week')),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
        ],
        const SectionTitle('Your daily usuals'),
        if (routines.isEmpty)
          const EmptyState(
            title: 'A routine you can return to.',
            detail: 'Add medicine, skin care, or any everyday habit.',
          ),
        for (final entry in routines)
          LCard(
            padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
            margin: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Checkbox(
                  value: isDone(entry, today),
                  onChanged: store.saving
                      ? null
                      : (value) => store.check(entry['id'], today, value!),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry['title'],
                        style: t.titleSmall?.copyWith(
                          decoration: isDone(entry, today)
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      Text(
                        '${entry['time']} · ${entry['category']}',
                        style: t.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        const SectionTitle('On your mind'),
        if (reminders.isEmpty)
          const EmptyState(
            title: 'A little less to carry.',
            detail: 'No reminders are due. Capture an idea while it is fresh.',
          ),
        for (final entry in reminders.take(5))
          LCard(
            padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
            margin: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Icon(Icons.notifications_none_outlined, color: c.muted),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry['title'], style: t.titleSmall),
                      Text(
                        '${entry['dueDate']} · ${entry['tag']}',
                        style: t.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Complete ${entry['title']}',
                  onPressed: store.saving
                      ? null
                      : () => store.save('notes', {
                          'completed': true,
                        }, id: entry['id']),
                  icon: const Icon(Icons.check),
                ),
              ],
            ),
          ),
        if (reminders.length > 5)
          TextButton(
            onPressed: () => widget.onAction(TodayAction.notes),
            child: Text('See all ${reminders.length} reminders'),
          ),
        const SizedBox(height: 16),
        Text(
          'You do not need a perfect day to make a little progress.',
          textAlign: TextAlign.center,
          style: t.bodySmall,
        ),
      ],
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => SectionHeader(title);
}

class _Quick extends StatelessWidget {
  const _Quick({
    required this.icon,
    required this.color,
    required this.title,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String title;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => LCard(
    margin: EdgeInsets.zero,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    onTap: onTap,
    child: Row(
      children: [
        IconTile(icon, color: color, size: 38),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleSmall,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Icon(Icons.add, size: 18, color: context.lc.muted),
      ],
    ),
  );
}
