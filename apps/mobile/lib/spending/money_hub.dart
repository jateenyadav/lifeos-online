import 'package:flutter/material.dart';
import '../workspaces/shared.dart';
import '../workspaces/utils.dart';
import '../workspaces/workspace_controller.dart';
import 'money_utils.dart';
import 'money_editor.dart';

class MoneyHub extends StatefulWidget {
  const MoneyHub({super.key, required this.store});
  final WorkspaceController store;
  @override
  State<MoneyHub> createState() => _MoneyHubState();
}

class _MoneyHubState extends State<MoneyHub> {
  String _tab = 'Payments';
  Future<void> _open(
    String mode, {
    Map<String, dynamic>? entry,
    Map<String, dynamic>? trip,
  }) => showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) =>
        MoneyEditor(store: widget.store, mode: mode, entry: entry, trip: trip),
  );
  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final payments = store.data['payments'] ?? [];
    final pending = payments
        .where((entry) => entry['status'] == 'pending')
        .toList();
    final trips = store.data['trips'] ?? [];
    final items = store.data['tripItems'] ?? [];
    return SpaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Your money, with context',
            style: TextStyle(
              fontSize: 20,
              color: ink,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Review new payments. Keep self transfers out of spending. Track people and trips.',
          ),
          if (pending.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: FilledButton(
                onPressed: store.saving
                    ? null
                    : () => _open('payment', entry: pending.first),
                child: Text('${pending.length} waiting · Review payment'),
              ),
            ),
          Wrap(
            spacing: 8,
            children: [
              for (final tab in ['Payments', 'People', 'Trips'])
                ChoiceChip(
                  label: Text(tab),
                  selected: _tab == tab,
                  onSelected: (_) => setState(() => _tab = tab),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_tab == 'Payments') ...[
            OutlinedButton(
              onPressed: store.saving ? null : () => _open('payment'),
              child: const Text('Record payment'),
            ),
            for (final entry in pending)
              _card([
                Text(
                  '${entry['title']} · ${money(entry['amountMinor'])}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  entry['direction'] == 'incoming'
                      ? 'Money received'
                      : 'Money sent',
                ),
                if (entry['suggested'] == true)
                  const Text('Remembered details. Please check before saving.'),
                Wrap(
                  children: [
                    TextButton(
                      onPressed: store.saving
                          ? null
                          : () => _open('payment', entry: entry),
                      child: const Text('Check amount and details'),
                    ),
                    TextButton(
                      onPressed: store.saving
                          ? null
                          : () => store.moneyCommand(
                              'payments/${entry['id']}/dismiss',
                              {},
                            ),
                      child: const Text('Not mine / Ignore'),
                    ),
                  ],
                ),
              ]),
            const Text(
              'Recent saved payments',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            for (final entry
                in payments
                    .where((entry) => entry['status'] == 'confirmed')
                    .take(12))
              _card([
                Text('${entry['title']} · ${money(entry['amountMinor'])}'),
                Text(
                  '${paymentLabels[entry['kind']]}${entry['person'] == '' ? '' : ' · ${entry['person']}'} · ${entry['date']}',
                ),
              ]),
            const Text(
              'Nothing counts as spending until you save it. Record missing payments here.',
            ),
          ],
          if (_tab == 'People') ...[
            const Text(
              'Who owes whom?',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            OutlinedButton(
              onPressed: store.saving
                  ? null
                  : () => _open('payment', entry: {'kind': 'lent'}),
              child: const Text('Record money with a person'),
            ),
            for (final row in peopleBalances(payments))
              _card([
                Text(
                  row['person'],
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  'Gave ${money(row['gave'])} · Received ${money(row['received'])}',
                ),
                Text(
                  row['balance'] > 0
                      ? 'They owe you ${money(row['balance'])}'
                      : row['balance'] < 0
                      ? 'You owe them ${money(-row['balance'])}'
                      : 'All settled',
                ),
                TextButton(
                  onPressed: store.saving
                      ? null
                      : () => _open(
                          'payment',
                          entry: {
                            'person': row['person'],
                            'kind': row['balance'] >= 0
                                ? 'repayment_received'
                                : 'repayment_paid',
                            'title': 'Repayment',
                            'amountMinor': (row['balance'] as int).abs(),
                          },
                        ),
                  child: const Text('Record repayment'),
                ),
              ]),
            const Text(
              'These records do not move real money. People with the same name share a balance.',
            ),
          ],
          if (_tab == 'Trips') ...[
            OutlinedButton(
              onPressed: store.saving ? null : () => _open('trip'),
              child: const Text('Plan a trip'),
            ),
            for (final trip in trips) _trip(trip, items),
            const Text(
              'Trip records belong to your account. Trip costs are separate from personal spending.',
            ),
          ],
        ],
      ),
    );
  }

  Widget _card(List<Widget> children) => Container(
    margin: const EdgeInsets.symmetric(vertical: 8),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      border: Border.all(color: const Color(0xFFDFE5D8)),
      borderRadius: BorderRadius.circular(9),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    ),
  );
  Widget _trip(Map<String, dynamic> trip, List<Map<String, dynamic>> items) {
    final entries = items
        .where((entry) => entry['tripId'] == trip['id'])
        .toList();
    final spent = entries
        .where((entry) => entry['kind'] == 'expense')
        .fold<int>(0, (total, entry) => total + (entry['amountMinor'] as int));
    return _card([
      Text(trip['title'], style: const TextStyle(fontWeight: FontWeight.w600)),
      Text((trip['members'] as List).join(', ')),
      if (trip['startDate'] != null)
        Text(
          '${trip['startDate']}${trip['endDate'] == null ? '' : ' to ${trip['endDate']}'}',
        ),
      Text('Trip spent: ${money(spent)}'),
      if ((trip['budgetMinor'] as num) > 0)
        Text(
          'Budget: ${money(trip['budgetMinor'])} · Remaining: ${money(trip['budgetMinor'] - spent)}',
        ),
      for (final row in splitBalances(trip, items).entries)
        Text(
          '${row.key}: ${row.value > 0
              ? 'gets back ${money(row.value)}'
              : row.value < 0
              ? 'owes ${money(-row.value)}'
              : 'settled'}',
        ),
      Wrap(
        children: [
          TextButton(
            onPressed: widget.store.saving
                ? null
                : () => _open('tripItem', trip: trip),
            child: const Text('Add shared cost'),
          ),
          TextButton(
            onPressed: widget.store.saving
                ? null
                : () => _open('settlement', trip: trip),
            child: const Text('Record trip repayment'),
          ),
        ],
      ),
      for (final entry in entries.take(8))
        Text(
          '${entry['title']}: ${money(entry['amountMinor'])} · ${entry['payer']} paid · ${entry['kind'] == 'expense' ? 'Split with' : 'To'} ${(entry['participants'] as List).join(', ')}',
        ),
    ]);
  }
}
