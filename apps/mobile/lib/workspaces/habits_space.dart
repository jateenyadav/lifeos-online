import 'package:flutter/material.dart';
import 'routines_space.dart';
import 'workouts_space.dart';
import 'workspace_controller.dart';

/// "Habits" = daily routines + workouts, one tap apart.
class HabitsSpace extends StatelessWidget {
  const HabitsSpace({
    super.key,
    required this.store,
    required this.tab,
    required this.onTab,
  });
  final WorkspaceController store;
  final int tab;
  final ValueChanged<int> onTab;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SegmentedButton<int>(
        key: const Key('habits_switch'),
        segments: const [
          ButtonSegment(
            value: 0,
            icon: Icon(Icons.favorite_border),
            label: Text('Routines'),
          ),
          ButtonSegment(
            value: 1,
            icon: Icon(Icons.fitness_center_outlined),
            label: Text('Workouts', key: Key('habits_workouts')),
          ),
        ],
        selected: {tab},
        onSelectionChanged: (value) => onTab(value.first),
      ),
      const SizedBox(height: 18),
      if (tab == 0)
        RoutinesSpace(store: store)
      else
        WorkoutsSpace(store: store),
    ],
  );
}
