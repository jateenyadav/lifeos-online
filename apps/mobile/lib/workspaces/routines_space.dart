import 'dart:math';
import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'shared.dart';
import 'utils.dart';

class RoutinesSpace extends StatefulWidget {
  const RoutinesSpace({super.key, required this.store});
  final WorkspaceController store;
  @override
  State<RoutinesSpace> createState() => _RoutinesSpaceState();
}

class _RoutinesSpaceState extends State<RoutinesSpace> {
  String _date = dateKey();
  String _filter = 'All';
  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final routines = store.data['routines']!;
    final scheduled = routines.where((entry) => dueOn(entry, _date)).toList();
    final done = scheduled.where((entry) => isDone(entry, _date)).length;
    final visible = scheduled
        .where(
          (entry) =>
              _filter == 'All' ||
              (_filter == 'Done'
                  ? isDone(entry, _date)
                  : !isDone(entry, _date)),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SpaceHeading(
          title: 'Daily routines',
          description: 'Keep your usuals close. One gentle check-in at a time.',
          action: 'Add routine',
          onAction: () => openEditor(context, store, 'routines'),
        ),
        SpaceStats(
          stats: [
            ('Done for the day', '$done / ${scheduled.length}'),
            (
              'Daily progress',
              '${scheduled.isEmpty ? 0 : (done / scheduled.length * 100).round()}%',
            ),
            (
              'Best streak',
              '${routines.fold<int>(0, (best, entry) => max(best, routineStreak(entry)))} days',
            ),
          ],
        ),
        if (scheduled.isNotEmpty) ...[
          LinearProgressIndicator(
            value: done / scheduled.length,
            minHeight: 6,
            borderRadius: BorderRadius.circular(8),
          ),
          const SizedBox(height: 20),
        ],
        OutlinedButton.icon(
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: DateTime.parse(_date),
              firstDate: DateTime(2000),
              lastDate: DateTime.now(),
            );
            if (picked != null && mounted) {
              setState(() => _date = dateKey(picked));
            }
          },
          icon: const Icon(Icons.calendar_today_outlined, size: 17),
          label: Text('Check-in: $_date'),
        ),
        const SizedBox(height: 16),
        SpaceFilter(
          options: const ['All', 'To do', 'Done'],
          selected: _filter,
          onChange: (value) => setState(() => _filter = value),
        ),
        for (final entry in visible)
          SpaceCard(
            tone: isDone(entry, _date) ? const Color(0xFFF3F7EB) : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Checkbox(
                      value: isDone(entry, _date),
                      onChanged: store.saving
                          ? null
                          : (value) => store.check(entry['id'], _date, value!),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            entry['title'],
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              color: ink,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${entry['category']} · ${entry['time']}',
                            style: const TextStyle(color: muted, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    EntryMenu(
                      title: entry['title'],
                      saving: store.saving,
                      onEdit: () =>
                          openEditor(context, store, 'routines', entry: entry),
                      onDelete: () =>
                          deleteEntry(context, store, 'routines', entry),
                    ),
                  ],
                ),
                const SizedBox(height: 13),
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    for (final day in recentDays())
                      Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(
                          color: isDone(entry, day)
                              ? const Color(0xFFDEECD1)
                              : const Color(0xFFF4F6EF),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(
                          dayNames[DateTime.parse(day).weekday % 7].substring(
                            0,
                            1,
                          ),
                          style: TextStyle(
                            color: dueOn(entry, day)
                                ? muted
                                : const Color(0xFFB0BAA6),
                            fontSize: 10,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  '${routineStreak(entry)} day streak · scheduled days only',
                  style: const TextStyle(color: muted, fontSize: 11),
                ),
              ],
            ),
          ),
        if (visible.isEmpty)
          SpaceEmpty(
            title: scheduled.isNotEmpty && done == scheduled.length
                ? 'Your daily usuals are done. Nicely done.'
                : 'Make a little room for your routines.',
            detail:
                'Choose your days and time. Check things off here or on Today.',
          ),
        if (routines.any((entry) => !dueOn(entry, _date)))
          const SectionTitle('Not scheduled for this day'),
        for (final entry in routines.where((entry) => !dueOn(entry, _date)))
          SpaceCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry['title'], style: const TextStyle(color: ink)),
                      const SizedBox(height: 7),
                      Text(
                        '${(entry['days'] as List).map((day) => dayNames[day]).join(', ')} · ${entry['time']}',
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                EntryMenu(
                  title: entry['title'],
                  saving: store.saving,
                  onEdit: () =>
                      openEditor(context, store, 'routines', entry: entry),
                  onDelete: () =>
                      deleteEntry(context, store, 'routines', entry),
                ),
              ],
            ),
          ),
        const Text(
          'Medicine tracking records your existing routine. It does not recommend medicines or doses.',
          style: TextStyle(color: muted, fontSize: 11, height: 1.8),
        ),
      ],
    );
  }
}
