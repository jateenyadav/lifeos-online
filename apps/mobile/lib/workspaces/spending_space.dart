import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'workspace_controller.dart';
import 'shared.dart';
import 'utils.dart';
import '../spending/notification_tracking_card.dart';
import '../spending/money_hub.dart';

class SpendingSpace extends StatefulWidget {
  const SpendingSpace({super.key, required this.store});
  final WorkspaceController store;
  @override
  State<SpendingSpace> createState() => _SpendingSpaceState();
}

class _SpendingSpaceState extends State<SpendingSpace> {
  String _month = dateKey().substring(0, 7);
  String _filter = 'All';
  String _query = '';
  Future<void> _copyCsv(List<Map<String, dynamic>> entries) async {
    String cell(dynamic value) {
      var text = '$value';
      if (RegExp(r'^\s*[=+\-@]|^[\t\r\n]').hasMatch(text)) text = "'$text";
      return '"${text.replaceAll('"', '""')}"';
    }

    final rows = [
      ['Date', 'Title', 'Category', 'Amount (INR)', 'Payment', 'Note'],
      ...entries.map(
        (entry) => [
          entry['date'],
          entry['title'],
          entry['category'],
          (entry['amountMinor'] / 100).toStringAsFixed(2),
          entry['payment'],
          entry['note'],
        ],
      ),
    ];
    await Clipboard.setData(
      ClipboardData(
        text: rows.map((row) => row.map(cell).join(',')).join('\r\n'),
      ),
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('CSV copied. You can paste it into a .csv file.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final entries = store.data['expenses']!
        .where((entry) => (entry['date'] as String).startsWith(_month))
        .toList();
    final total = entries.fold<num>(
      0,
      (sum, entry) => sum + entry['amountMinor'],
    );
    final budgets = store.data['budgets']!.where(
      (entry) => entry['month'] == _month,
    );
    final budget = budgets.isEmpty ? null : budgets.first;
    final visible =
        entries
            .where(
              (entry) =>
                  (_filter == 'All' || entry['category'] == _filter) &&
                  '${entry['title']} ${entry['note']}'.toLowerCase().contains(
                    _query.toLowerCase(),
                  ),
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
          title: 'Spending tracker',
          description: 'A simple money journal. Less guessing, more clarity.',
          action: 'Add expense',
          onAction: () => openEditor(context, store, 'expenses'),
        ),
        SpaceStats(
          stats: [
            ('Spent this month', money(total)),
            (
              budget != null && total > budget['limitMinor']
                  ? 'Over budget'
                  : 'Budget remaining',
              budget == null
                  ? 'Not set'
                  : money((budget['limitMinor'] - total).abs()),
            ),
            ('Expenses · INR', '${entries.length}'),
          ],
        ),
        NotificationTrackingCard(store: store),
        MoneyHub(store: store),
        SpaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                budget == null
                    ? 'Give your month a little structure'
                    : 'Your monthly budget',
                style: const TextStyle(fontWeight: FontWeight.w600, color: ink),
              ),
              const SizedBox(height: 12),
              if (budget != null) ...[
                LinearProgressIndicator(
                  value: (total / budget['limitMinor']).clamp(0.0, 1.0),
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(8),
                ),
                const SizedBox(height: 10),
                Text(
                  '${money(budget['limitMinor'])} · ${(total / budget['limitMinor'] * 100).round()}% used',
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
              ],
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => openEditor(
                    context,
                    store,
                    'budgets',
                    entry: {...?budget, 'month': _month},
                  ),
                  child: Text(budget == null ? 'Set budget' : 'Edit budget'),
                ),
              ),
            ],
          ),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.parse('$_month-01'),
                  firstDate: DateTime(2000),
                  lastDate: DateTime(2200),
                );
                if (picked != null && mounted) {
                  setState(() => _month = dateKey(picked).substring(0, 7));
                }
              },
              icon: const Icon(Icons.calendar_today_outlined, size: 16),
              label: Text('Month: $_month'),
            ),
            OutlinedButton.icon(
              onPressed: visible.isEmpty ? null : () => _copyCsv(visible),
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copy CSV'),
            ),
          ],
        ),
        const SizedBox(height: 18),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search expenses',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) => setState(() => _query = value),
        ),
        const SizedBox(height: 18),
        SpaceFilter(
          options: const ['All', ...expenseCategories],
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
                        entry['title'],
                        style: const TextStyle(
                          fontSize: 17,
                          color: ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    EntryMenu(
                      title: entry['title'],
                      saving: store.saving,
                      onEdit: () =>
                          openEditor(context, store, 'expenses', entry: entry),
                      onDelete: () =>
                          deleteEntry(context, store, 'expenses', entry),
                    ),
                  ],
                ),
                Text(
                  money(entry['amountMinor']),
                  style: const TextStyle(
                    fontSize: 20,
                    color: ink,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${entry['date']} · ${entry['category']} · ${entry['payment']}',
                  style: const TextStyle(color: muted, fontSize: 11),
                ),
                if (entry['source'] == 'notification')
                  Text(
                    'Auto-added · ${entry['sourceApp']}',
                    style: const TextStyle(color: muted, fontSize: 11),
                  ),
                if (entry['note'] != '') ...[
                  const SizedBox(height: 10),
                  Text(
                    entry['note'],
                    style: const TextStyle(
                      color: muted,
                      height: 1.8,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        if (visible.isEmpty)
          const SpaceEmpty(
            title: 'A clearer picture starts here.',
            detail:
                'Log one expense. Your month and categories will fill themselves in.',
          ),
        const SectionTitle('Where it went'),
        SpaceCard(
          child: Column(
            children: [
              for (final category in expenseCategories)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              category,
                              style: const TextStyle(
                                color: muted,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          Flexible(
                            child: Text(
                              money(
                                entries
                                    .where(
                                      (entry) => entry['category'] == category,
                                    )
                                    .fold<num>(
                                      0,
                                      (sum, entry) =>
                                          sum + entry['amountMinor'],
                                    ),
                              ),
                              style: const TextStyle(color: ink, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 7),
                      LinearProgressIndicator(
                        value: total == 0
                            ? 0
                            : entries
                                      .where(
                                        (entry) =>
                                            entry['category'] == category,
                                      )
                                      .fold<num>(
                                        0,
                                        (sum, entry) =>
                                            sum + entry['amountMinor'],
                                      ) /
                                  total,
                        minHeight: 4,
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
