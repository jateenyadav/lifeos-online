import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'money_store.dart';
import 'overview_tab.dart' show asString;

const accountTypes = {
  'savings': 'Savings',
  'current': 'Current',
  'salary': 'Salary',
  'credit_card': 'Credit card',
  'cash': 'Cash',
  'wallet': 'Wallet',
  'other': 'Other',
};

class AccountsTab extends StatelessWidget {
  const AccountsTab({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => MoneyLoader<Json>(
    store: store,
    load: store.api.accounts,
    builder: (context, data) {
      final accounts = itemsOf(
        data,
      ).where((a) => a['archived'] != true).toList();
      final fresh = accounts.where((a) => a['needsConfirm'] == true).toList();
      final mine = accounts.where((a) => a['needsConfirm'] != true).toList();
      return ListView(
        key: const Key('accounts_list'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          for (final account in fresh)
            _NewAccountCard(store: store, account: account),
          if (mine.isEmpty && fresh.isEmpty)
            const EmptyState(
              icon: Icons.account_balance_outlined,
              title: 'No accounts yet.',
              detail:
                  'Add your bank, card or cash. Accounts also appear by themselves when bank SMS mention new last digits.',
            ),
          for (final account in mine)
            AccountCard(store: store, account: account),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            key: const Key('account_add'),
            onPressed: () => showAccountForm(context, store),
            icon: const Icon(Icons.add),
            label: const Text('Add account or card'),
          ),
        ],
      );
    },
  );
}

class _NewAccountCard extends StatelessWidget {
  const _NewAccountCard({required this.store, required this.account});
  final MoneyStore store;
  final Json account;
  @override
  Widget build(BuildContext context) {
    final id = asString(account['id']);
    final label = [
      if (asString(account['bank']).isNotEmpty) asString(account['bank']),
      if (asString(account['last4']).isNotEmpty) '••${account['last4']}',
    ].join(' ');
    return LCard(
      key: Key('new_account_$id'),
      color: Color.alphaBlend(
        context.lc.info.withValues(alpha: .10),
        context.lc.surface,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'New account found',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'A bank message mentioned $label. Is it yours?',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                key: Key('confirm_account_$id'),
                onPressed: () => store.run(
                  context,
                  () => store.api.editAccount(id, {'needsConfirm': false}),
                  done: 'Account added.',
                ),
                child: const Text('Yes, mine'),
              ),
              OutlinedButton(
                onPressed: () async {
                  final owner = await _askName(context, "Whose card is it?");
                  if (owner != null && context.mounted) {
                    await store.run(
                      context,
                      () => store.api.editAccount(id, {
                        'needsConfirm': false,
                        'ownerName': owner,
                        'type': 'credit_card',
                      }),
                      done: "Saved as $owner's card.",
                    );
                  }
                },
                child: const Text("Someone else's card"),
              ),
              TextButton(
                onPressed: () => store.run(
                  context,
                  () => store.api.deleteAccount(id),
                  done: 'Removed.',
                ),
                child: const Text('Not mine'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<String?> _askName(BuildContext context, String title) async {
  final controller = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
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
          child: const Text('Save'),
        ),
      ],
    ),
  );
  final value = controller.text.trim();
  controller.dispose();
  return ok == true && value.isNotEmpty ? value : null;
}

class AccountCard extends StatelessWidget {
  const AccountCard({super.key, required this.store, required this.account});
  final MoneyStore store;
  final Json account;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final id = asString(account['id']);
    final type = asString(account['type'], 'savings');
    final card = account['card'] is Map
        ? Map<String, dynamic>.from(account['card'] as Map)
        : null;
    final owner = asString(account['ownerName']);
    final balance = asInt(account['balanceMinor']);
    final bankSaid = account['bankSaidMinor'] == null
        ? null
        : asInt(account['bankSaidMinor']);
    final followBank = account['followBank'] != false;
    return LCard(
      key: Key('account_$id'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconTile(
                type == 'credit_card'
                    ? Icons.credit_card
                    : type == 'cash'
                    ? Icons.payments_outlined
                    : Icons.account_balance_outlined,
                color: LifeColors.money,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      asString(
                        account['name'],
                        accountTypes[type] ?? 'Account',
                      ),
                      style: t.titleSmall,
                    ),
                    Text(
                      [
                        accountTypes[type] ?? type,
                        if (asString(account['bank']).isNotEmpty)
                          asString(account['bank']),
                        if (asString(account['last4']).isNotEmpty)
                          '••${account['last4']}',
                      ].join(' · '),
                      style: t.bodySmall,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    card == null ? 'Balance' : 'Outstanding',
                    style: t.labelSmall,
                  ),
                  Text(
                    Money.format(
                      card == null ? balance : asInt(card['outstanding']),
                    ),
                    style: t.titleMedium?.copyWith(
                      fontFeatures: tabular,
                      color: card == null ? null : c.moneyOut,
                    ),
                  ),
                ],
              ),
              PopupMenuButton<String>(
                onSelected: (value) async {
                  if (value == 'edit') {
                    await showAccountForm(context, store, account: account);
                  } else if (value == 'delete' &&
                      await confirm(
                        context,
                        title: 'Delete this account?',
                        body:
                            'Its payments stay; they just lose the account link.',
                      ) &&
                      context.mounted) {
                    await store.run(
                      context,
                      () => store.api.deleteAccount(id),
                      done: 'Account deleted.',
                    );
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Edit')),
                  PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ],
          ),
          if (owner.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              "$owner's card · every payment on it goes to $owner's khata · left out of your net worth",
              key: Key('owner_note_$id'),
              style: t.bodySmall,
            ),
          ],
          if (card != null) ...[
            const SizedBox(height: 12),
            StatGrid(
              minWidth: 110,
              children: [
                StatTile(
                  label: 'Available',
                  value: Money.format(asInt(card['available'])),
                  color: c.moneyIn,
                ),
                StatTile(
                  label: 'Used',
                  value: '${asInt(card['usagePct'])}%',
                  color: asInt(card['usagePct']) > 80 ? c.warn : null,
                ),
                StatTile(
                  label: 'This cycle',
                  value: Money.format(asInt(card['cycleSpendMinor'])),
                ),
                StatTile(
                  label: card['overdue'] == true ? 'Overdue' : 'Due in',
                  value: card['daysToDue'] == null
                      ? '—'
                      : card['overdue'] == true
                      ? '${asInt(card['daysToDue']).abs()} d late'
                      : '${asInt(card['daysToDue'])} days',
                  color: card['overdue'] == true ? c.danger : null,
                ),
              ],
            ),
            if (asInt(account['creditLimitMinor']) > 0)
              LinearProgressIndicator(
                value: (asInt(card['usagePct']) / 100).clamp(0, 1).toDouble(),
                minHeight: 6,
                borderRadius: BorderRadius.circular(6),
                color: asInt(card['usagePct']) > 80 ? c.warn : c.primary,
              ),
            if (asInt(account['billMinor']) > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Bill ${Money.format(asInt(account['billMinor']))} · min ${Money.format(asInt(account['minDueMinor']))}${asString(account['dueDate']).isEmpty ? '' : ' · due ${prettyDate(asString(account['dueDate']))}'}',
                      style: t.bodySmall?.copyWith(fontFeatures: tabular),
                    ),
                  ),
                  TextButton(
                    onPressed: () => store.run(
                      context,
                      () => store.api.billPaid(id),
                      done: 'Bill marked as paid.',
                    ),
                    child: const Text('Bill paid'),
                  ),
                ],
              ),
            ],
          ],
          if (card == null && type != 'cash') ...[
            const SizedBox(height: 6),
            SwitchListTile(
              key: Key('follow_bank_$id'),
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: followBank,
              onChanged: (value) => store.run(
                context,
                () => store.api.editAccount(id, {'followBank': value}),
              ),
              title: const Text('Follow bank balance'),
              subtitle: const Text(
                'When an SMS says "Avl Bal", LifeOS matches it',
              ),
            ),
            if (!followBank && bankSaid != null && bankSaid != balance)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Bank said ${Money.format(bankSaid)} vs app ${Money.format(balance)}',
                      style: t.bodyMedium?.copyWith(fontFeatures: tabular),
                    ),
                  ),
                  TextButton(
                    key: Key('match_bank_$id'),
                    onPressed: () => store.run(
                      context,
                      () => store.api.matchBank(id),
                      done: 'Balance now matches the bank.',
                    ),
                    child: const Text('Match bank balance'),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }
}

Future<void> showAccountForm(
  BuildContext context,
  MoneyStore store, {
  Json? account,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _AccountForm(store: store, account: account),
);

class _AccountForm extends StatefulWidget {
  const _AccountForm({required this.store, this.account});
  final MoneyStore store;
  final Json? account;
  @override
  State<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends State<_AccountForm> {
  late final _name = TextEditingController(
    text: asString(widget.account?['name']),
  );
  late final _bank = TextEditingController(
    text: asString(widget.account?['bank']),
  );
  late final _last4 = TextEditingController(
    text: asString(widget.account?['last4']),
  );
  late final _opening = TextEditingController(
    text: widget.account == null
        ? ''
        : paiseInput(asInt(widget.account!['openingMinor']).abs()),
  );
  late final _limit = TextEditingController(
    text: asInt(widget.account?['creditLimitMinor']) == 0
        ? ''
        : paiseInput(asInt(widget.account!['creditLimitMinor'])),
  );
  late final _owner = TextEditingController(
    text: asString(widget.account?['ownerName']),
  );
  late String _type = asString(widget.account?['type'], 'savings');
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _bank, _last4, _opening, _limit, _owner]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final card = _type == 'credit_card';
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.account == null ? 'Add account' : 'Edit account',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in accountTypes.entries)
                  ChoiceChip(
                    label: Text(entry.value),
                    selected: _type == entry.key,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _type = entry.key),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('account_name'),
              controller: _name,
              decoration: const InputDecoration(
                labelText: 'Name (e.g. HDFC savings)',
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _bank,
                    decoration: const InputDecoration(labelText: 'Bank'),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  width: 110,
                  child: TextField(
                    controller: _last4,
                    maxLength: 4,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Last 4',
                      counterText: '',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _opening,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: card ? 'Amount owed on it now' : 'Balance now',
                prefixText: '₹ ',
              ),
            ),
            if (card) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _limit,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Credit limit',
                  prefixText: '₹ ',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _owner,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: "Someone else's card? Their name",
                  helperText: 'Add-on card on a family member’s account',
                ),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('account_save'),
              onPressed: _busy
                  ? null
                  : () async {
                      if (_name.text.trim().isEmpty) return;
                      setState(() => _busy = true);
                      final opening = _opening.text.trim().isEmpty
                          ? 0
                          : (parseRupees(_opening.text) ?? 0);
                      final values = {
                        'name': _name.text.trim(),
                        'type': _type,
                        'bank': _bank.text.trim(),
                        'last4': _last4.text.trim(),
                        'openingMinor': card ? -opening : opening,
                        if (card)
                          'creditLimitMinor': parseRupees(_limit.text) ?? 0,
                        if (card)
                          'ownerName': _owner.text.trim().isEmpty
                              ? null
                              : _owner.text.trim(),
                      };
                      final store = widget.store;
                      final done = await store.run(
                        context,
                        () => widget.account == null
                            ? store.api.addAccount(values)
                            : store.api.editAccount(
                                asString(widget.account!['id']),
                                values,
                              ),
                        done: 'Saved.',
                      );
                      if (!context.mounted) return;
                      if (done != null) {
                        Navigator.pop(context);
                      } else {
                        setState(() => _busy = false);
                      }
                    },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
