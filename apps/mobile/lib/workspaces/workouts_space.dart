import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'shared.dart';
import 'utils.dart';

class WorkoutsSpace extends StatefulWidget {
  const WorkoutsSpace({super.key, required this.store});
  final WorkspaceController store;
  @override
  State<WorkoutsSpace> createState() => _WorkoutsSpaceState();
}

class _WorkoutsSpaceState extends State<WorkoutsSpace> {
  String _filter = 'All';
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final workouts = store.data['workouts']!;
    final recent = workouts
        .where((entry) => recentDays().contains(entry['date']))
        .toList();
    final visible =
        workouts
            .where(
              (entry) =>
                  (_filter == 'All' || entry['type'] == _filter) &&
                  '${entry['title']} ${entry['exercises']}'
                      .toLowerCase()
                      .contains(_query.toLowerCase()),
            )
            .toList()
          ..sort(
            (first, second) =>
                (second['date'] as String).compareTo(first['date'] as String),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SpaceHeading(
          title: 'Workout tracker',
          description:
              'A training journal that makes your next session easier.',
          action: 'Log workout',
          onAction: () => openEditor(context, store, 'workouts'),
        ),
        SpaceStats(
          stats: [
            ('Sessions · 7 days', '${recent.length}'),
            (
              'Time moving',
              '${recent.fold<num>(0, (sum, entry) => sum + entry['duration'])} min',
            ),
            (
              'Active days',
              '${recent.map((entry) => entry['date']).toSet().length} / 7',
            ),
          ],
        ),
        SpaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Your week in motion',
                style: TextStyle(fontWeight: FontWeight.w600, color: ink),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final day in recentDays())
                    Chip(
                      avatar: Icon(
                        workouts.any((entry) => entry['date'] == day)
                            ? Icons.fitness_center_outlined
                            : Icons.remove,
                        size: 15,
                      ),
                      label: Text(day.substring(5)),
                      backgroundColor:
                          workouts.any((entry) => entry['date'] == day)
                          ? const Color(0xFFE4ECDA)
                          : null,
                    ),
                ],
              ),
            ],
          ),
        ),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search workouts',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) => setState(() => _query = value),
        ),
        const SizedBox(height: 18),
        SpaceFilter(
          options: const ['All', ...workoutTypes],
          selected: _filter,
          onChange: (value) => setState(() => _filter = value),
        ),
        for (final entry in visible)
          SpaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${entry['date']} · ${entry['type']}',
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ),
                    EntryMenu(
                      title: entry['title'],
                      saving: store.saving,
                      onEdit: () =>
                          openEditor(context, store, 'workouts', entry: entry),
                      onDelete: () =>
                          deleteEntry(context, store, 'workouts', entry),
                      extra: const {'repeat': 'Use again'},
                      onExtra: (_) => openEditor(
                        context,
                        store,
                        'workouts',
                        entry: {...entry, 'id': null, 'date': dateKey()},
                      ),
                    ),
                  ],
                ),
                Text(
                  entry['title'],
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${entry['duration']} min · ${entry['effort']}',
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
                if (entry['exercises'] != '') ...[
                  const SizedBox(height: 14),
                  Text(
                    entry['exercises'],
                    style: const TextStyle(
                      color: muted,
                      height: 1.8,
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          ),
        if (visible.isEmpty)
          const SpaceEmpty(
            title: 'Your first session is a fresh start.',
            detail:
                'Keep the details you need. Repeat a past session from its menu.',
          ),
      ],
    );
  }
}
