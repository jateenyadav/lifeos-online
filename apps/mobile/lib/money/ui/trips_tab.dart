import 'package:flutter/material.dart';
import '../../spending/money_editor.dart';
import '../../spending/money_utils.dart';
import '../../widgets/ui.dart';
import '../../workspaces/workspace_controller.dart';
import '../core/money.dart';

/// Trips keep using the existing workspace trip records (docs/MONEY.md §3).
class TripsTab extends StatelessWidget {
  const TripsTab({super.key, required this.store});
  final WorkspaceController store;

  Future<void> _open(
    BuildContext context,
    String mode, {
    Map<String, dynamic>? trip,
  }) => showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => MoneyEditor(store: store, mode: mode, trip: trip),
  );

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) {
      final trips = store.data['trips'] ?? [];
      final items = store.data['tripItems'] ?? [];
      return ListView(
        key: const Key('trips_list'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          OutlinedButton.icon(
            onPressed: store.saving ? null : () => _open(context, 'trip'),
            icon: const Icon(Icons.luggage_outlined),
            label: const Text('Plan a trip'),
          ),
          const SizedBox(height: 12),
          if (trips.isEmpty)
            const EmptyState(
              icon: Icons.luggage_outlined,
              title: 'No trips yet.',
              detail:
                  'Plan a trip to split shared costs with friends. Trip costs stay separate from personal spending.',
            ),
          for (final trip in trips) _trip(context, trip, items),
        ],
      );
    },
  );

  Widget _trip(
    BuildContext context,
    Map<String, dynamic> trip,
    List<Map<String, dynamic>> items,
  ) {
    final t = Theme.of(context).textTheme;
    final entries = items
        .where((entry) => entry['tripId'] == trip['id'])
        .toList();
    final spent = entries
        .where((entry) => entry['kind'] == 'expense')
        .fold<int>(0, (total, entry) => total + (entry['amountMinor'] as int));
    final budget = (trip['budgetMinor'] as num? ?? 0).toInt();
    return LCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(trip['title'] as String, style: t.titleMedium),
          Text((trip['members'] as List).join(', '), style: t.bodySmall),
          if (trip['startDate'] != null)
            Text(
              '${trip['startDate']}${trip['endDate'] == null ? '' : ' to ${trip['endDate']}'}',
              style: t.bodySmall,
            ),
          const SizedBox(height: 8),
          Text('Trip spent: ${Money.format(spent)}', style: t.titleSmall),
          if (budget > 0)
            Text(
              'Budget: ${Money.format(budget)} · Remaining: ${Money.format(budget - spent)}',
            ),
          const SizedBox(height: 6),
          for (final row in splitBalances(trip, items).entries)
            Text(
              '${row.key}: ${row.value > 0
                  ? 'gets back ${Money.format(row.value)}'
                  : row.value < 0
                  ? 'owes ${Money.format(-row.value)}'
                  : 'settled'}',
            ),
          Wrap(
            children: [
              TextButton(
                onPressed: store.saving
                    ? null
                    : () => _open(context, 'tripItem', trip: trip),
                child: const Text('Add shared cost'),
              ),
              TextButton(
                onPressed: store.saving
                    ? null
                    : () => _open(context, 'settlement', trip: trip),
                child: const Text('Record trip repayment'),
              ),
            ],
          ),
          for (final entry in entries.take(8))
            Text(
              '${entry['title']}: ${Money.format(entry['amountMinor'] as int)} · ${entry['payer']} paid · ${entry['kind'] == 'expense' ? 'Split with' : 'To'} ${(entry['participants'] as List).join(', ')}',
              style: t.bodySmall,
            ),
        ],
      ),
    );
  }
}
