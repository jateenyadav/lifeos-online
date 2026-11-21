import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'khata_contact.dart';
import 'khata_import.dart';
import 'lists_screens.dart';
import 'money_store.dart';
import 'overview_tab.dart' show asString;
import 'transactions_tab.dart' show TxnRow;

String balanceLine(String name, int balance) => balance == 0
    ? 'All settled'
    : balance > 0
    ? '$name owes you ${Money.format(balance)}'
    : 'You owe $name ${Money.format(-balance)}';

class KhataTab extends StatelessWidget {
  const KhataTab({super.key, required this.store});
  final MoneyStore store;

  @override
  Widget build(BuildContext context) => MoneyLoader<Json>(
    store: store,
    load: store.api.khata,
    builder: (context, data) {
      final c = context.lc;
      final contacts = itemsOf(data, 'contacts')
        ..sort((a, b) {
          final x = asInt((a['balance'] as Map?)?['adjustedMinor']).abs();
          final y = asInt((b['balance'] as Map?)?['adjustedMinor']).abs();
          return y.compareTo(x);
        });
      final left = itemsOf(data, 'left');
      return ListView(
        key: const Key('khata_list'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          LCard(
            hero: true,
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'People owe you',
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                      const SizedBox(height: 4),
                      CountUpMoney(
                        asInt(data['owedToMeMinor']),
                        key: const Key('khata_owed_to_me'),
                        size: 28,
                        color: c.moneyIn,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'You owe',
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                      const SizedBox(height: 4),
                      CountUpMoney(
                        asInt(data['iOweMinor']),
                        key: const Key('khata_i_owe'),
                        size: 28,
                        color: c.moneyOut,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          LCard(
            key: const Key('khata_getting_back'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ReimbursementsScreen(store: store),
              ),
            ),
            child: Row(
              children: [
                IconTile(
                  Icons.currency_exchange,
                  color: LifeColors.money,
                  size: 38,
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Getting money back'),
                      Text(
                        'Office, client or insurance payments you are waiting for',
                        style: TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('khata_import_everyone'),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => KhataBulkImportScreen(store: store),
                  ),
                ),
                icon: const Icon(Icons.playlist_add),
                label: const Text('Import everyone'),
              ),
              OutlinedButton.icon(
                onPressed: () => addPerson(context, store),
                icon: const Icon(Icons.person_add_alt),
                label: const Text('Add person'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (contacts.isEmpty)
            const EmptyState(
              icon: Icons.people_outline,
              title: 'No one in your khata yet.',
              detail:
                  'Add a person, answer "Does Rahul owe you?" on a payment, or import your old notes.',
            ),
          for (final row in contacts) _ContactRow(store: store, row: row),
          if (left.isNotEmpty) ...[
            const SectionHeader('Left for later'),
            Text(
              'Payments you chose to decide later. Tap one to answer.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            for (final txn in left)
              TxnRow(key: Key('left_${txn['id']}'), store: store, txn: txn),
          ],
        ],
      );
    },
  );
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({required this.store, required this.row});
  final MoneyStore store;
  final Json row;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final contact = Map<String, dynamic>.from(row['contact'] as Map? ?? {});
    final balance = Map<String, dynamic>.from(row['balance'] as Map? ?? {});
    final name = asString(contact['name'], 'Someone');
    final adjusted = asInt(balance['adjustedMinor']);
    return LCard(
      key: Key('khata_contact_${contact['id']}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => KhataContactScreen(
            store: store,
            contactId: asString(contact['id']),
            name: name,
          ),
        ),
      ),
      child: Row(
        children: [
          GeneratedAvatar(name: name, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 2),
                Text(
                  [
                    balanceLine(name.split(' ').first, adjusted),
                    if (row['overdue'] == true) 'overdue',
                    if (asString(row['lastDate']).isNotEmpty)
                      prettyDate(asString(row['lastDate'])),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Text(
            Money.format(adjusted.abs()),
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontFeatures: tabular,
              color: adjusted > 0
                  ? c.moneyIn
                  : adjusted < 0
                  ? c.moneyOut
                  : c.muted,
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> addPerson(BuildContext context, MoneyStore store) async {
  final name = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Add a person'),
      content: TextField(
        key: const Key('add_person_name'),
        controller: name,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(labelText: 'Name'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Add'),
        ),
      ],
    ),
  );
  if (ok == true && name.text.trim().isNotEmpty && context.mounted) {
    await store.run(
      context,
      () => store.api.addContact({'name': name.text.trim()}),
      done: '${name.text.trim()} added to Khata.',
    );
  }
  name.dispose();
}
