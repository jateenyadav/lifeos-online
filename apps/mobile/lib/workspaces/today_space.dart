import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'shared.dart';
import 'utils.dart';

class TodaySpace extends StatelessWidget {
  const TodaySpace({
    super.key,
    required this.store,
    required this.name,
    required this.onOpen,
  });
  final WorkspaceController store;
  final String name;
  final void Function(int, bool) onOpen;
  @override
  Widget build(BuildContext context) {
    final today = dateKey();
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
                  (entry['dueDate'] as String).compareTo(today) <= 0,
            )
            .toList()
          ..sort(
            (first, second) => (first['dueDate'] as String).compareTo(
              second['dueDate'] as String,
            ),
          );
    final workouts = store.data['workouts']!
        .where((entry) => recentDays().contains(entry['date']))
        .length;
    final spend = store.data['expenses']!
        .where(
          (entry) =>
              (entry['date'] as String).startsWith(today.substring(0, 7)),
        )
        .fold<num>(0, (sum, entry) => sum + entry['amountMinor']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SpaceCard(
          tone: const Color(0xFFEEF3E6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'YOUR DAY, A LITTLE LIGHTER',
                style: TextStyle(fontSize: 9, letterSpacing: 1.3, color: muted),
              ),
              const SizedBox(height: 12),
              Text(
                'Hello, ${name.split(' ').first}.',
                style: const TextStyle(
                  fontSize: 29,
                  fontWeight: FontWeight.w600,
                  color: ink,
                ),
              ),
              const SizedBox(height: 9),
              const Text(
                'No need to do it all. Start with one small thing.',
                style: TextStyle(color: muted, height: 1.7, fontSize: 13),
              ),
              const SizedBox(height: 18),
              Text(
                '${routines.length - done} routines left · ${reminders.length} reminders need a look',
                style: const TextStyle(color: muted, fontSize: 11),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SpaceStats(
          stats: [
            ('Daily usuals', '$done / ${routines.length}'),
            ('Sessions · 7 days', '$workouts'),
            ('Spent this month', money(spend)),
          ],
        ),
        const SectionTitle('A little space for everything'),
        for (final action in [
          (
            1,
            'Catch a thought',
            'New note or reminder',
            Icons.edit_note_outlined,
            const Color(0xFFF0F4E7),
          ),
          (
            2,
            'Make a little move',
            'Log your workout',
            Icons.fitness_center_outlined,
            const Color(0xFFFAF1E8),
          ),
          (
            3,
            'Keep a small promise',
            'Add a daily routine',
            Icons.favorite_border,
            const Color(0xFFF2EFF7),
          ),
          (
            4,
            'Know where it goes',
            'Add an expense',
            Icons.account_balance_wallet_outlined,
            const Color(0xFFF7F3E5),
          ),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: action.$5,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => onOpen(action.$1, true),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      Icon(action.$4, color: muted),
                      const SizedBox(width: 15),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              action.$2,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                color: ink,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              action.$3,
                              style: const TextStyle(
                                color: muted,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.arrow_outward, size: 18, color: muted),
                    ],
                  ),
                ),
              ),
            ),
          ),
        const SectionTitle('Your daily usuals'),
        if (routines.isEmpty)
          const SpaceEmpty(
            title: 'A routine you can return to.',
            detail: 'Add medicine, skin care, or any everyday habit.',
          ),
        for (final entry in routines)
          SpaceCard(
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
                        style: TextStyle(
                          color: ink,
                          fontWeight: FontWeight.w500,
                          decoration: isDone(entry, today)
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${entry['time']} · ${entry['category']}',
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        const SectionTitle('On your mind'),
        if (reminders.isEmpty)
          const SpaceEmpty(
            title: 'A little less to carry.',
            detail: 'No reminders are due. Capture an idea while it is fresh.',
          ),
        for (final entry in reminders.take(5))
          SpaceCard(
            child: Row(
              children: [
                const Icon(Icons.notifications_none_outlined, color: muted),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry['title'], style: const TextStyle(color: ink)),
                      const SizedBox(height: 5),
                      Text(
                        '${entry['dueDate']} · ${entry['tag']}',
                        style: const TextStyle(color: muted, fontSize: 11),
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
                  icon: const Icon(Icons.check, color: muted),
                ),
              ],
            ),
          ),
        if (reminders.length > 5)
          TextButton(
            onPressed: () => onOpen(1, false),
            child: Text('See all ${reminders.length} reminders'),
          ),
        const SizedBox(height: 20),
        const Text(
          'You do not need a perfect day to make a little progress.',
          textAlign: TextAlign.center,
          style: TextStyle(color: muted, fontSize: 11, height: 1.8),
        ),
      ],
    );
  }
}
