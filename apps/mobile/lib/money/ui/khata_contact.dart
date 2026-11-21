import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'khata_import.dart';
import 'khata_tab.dart' show balanceLine;
import 'money_store.dart';
import 'overview_tab.dart' show asString;
import 'photos.dart';

const openingHeading = 'Old khata · opening balance (before the app)';

const adjustmentTypes = <(String, String, bool)>[
  ('on_me', 'On me', true),
  ('waived', 'Waived', true),
  ('disputed', 'Disputed', true),
  ('pending_confirmation', 'Pending confirmation', true),
  ('shared_expense', 'Shared expense', false),
  ('discount', 'Discount', true),
  ('custom', 'Custom adjustment', false),
];

/// App entries first (newest first, as the server sends them), opening
/// entries from old notes always last.
(List<Json>, List<Json>) splitEntries(List<Json> entries) => (
  [
    for (final e in entries)
      if (e['isOpening'] != true) e,
  ],
  [
    for (final e in entries)
      if (e['isOpening'] == true) e,
  ],
);

class KhataContactScreen extends StatelessWidget {
  const KhataContactScreen({
    super.key,
    required this.store,
    required this.contactId,
    required this.name,
  });
  final MoneyStore store;
  final String contactId;
  final String name;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(name),
      actions: [
        PopupMenuButton<String>(
          key: const Key('contact_menu'),
          onSelected: (value) => _menu(context, value),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'paste', child: Text('Paste old notes')),
            PopupMenuItem(value: 'adjust', child: Text('Add adjustment')),
            PopupMenuItem(
              key: Key('contact_swap'),
              value: 'swap',
              child: Text('Swap who owes whom'),
            ),
            PopupMenuItem(value: 'rename', child: Text('Rename')),
            PopupMenuItem(value: 'delete', child: Text('Delete person')),
          ],
        ),
      ],
    ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                key: const Key('khata_gave'),
                style: FilledButton.styleFrom(
                  backgroundColor: context.lc.moneyOut,
                  foregroundColor: Colors.white,
                ),
                onPressed: () =>
                    showEntrySheet(context, store, contactId, name, 'gave'),
                icon: const Icon(Icons.call_made),
                label: const Text('You gave'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                key: const Key('khata_got'),
                onPressed: () =>
                    showEntrySheet(context, store, contactId, name, 'got'),
                icon: const Icon(Icons.call_received),
                label: const Text('You got'),
              ),
            ),
          ],
        ),
      ),
    ),
    body: MoneyLoader<Json>(
      store: store,
      load: () => store.api.contact(contactId),
      builder: (context, data) => _ContactBody(
        store: store,
        data: data,
        name: name,
        contactId: contactId,
      ),
    ),
  );

  Future<void> _menu(BuildContext context, String value) async {
    switch (value) {
      case 'paste':
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => KhataPersonImportScreen(store: store, name: name),
          ),
        );
      case 'adjust':
        await showAdjustmentSheet(context, store, contactId);
      case 'swap':
        if (await confirm(
              context,
              title: 'Swap who owes whom?',
              body:
                  'Every "You gave" becomes "You got" and the other way round. Use this when the old notes were written the other way.',
              yes: 'Swap',
              danger: false,
            ) &&
            context.mounted) {
          await store.run(
            context,
            () => store.api.swap(contactId),
            done: 'Swapped.',
          );
        }
      case 'rename':
        final controller = TextEditingController(text: name);
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Rename'),
            content: TextField(controller: controller, autofocus: true),
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
        if (ok == true &&
            controller.text.trim().isNotEmpty &&
            context.mounted) {
          await store.run(
            context,
            () => store.api.editContact(contactId, {
              'name': controller.text.trim(),
            }),
            done: 'Renamed.',
          );
        }
        controller.dispose();
      case 'delete':
        if (await confirm(
              context,
              title: 'Delete $name?',
              body:
                  'All entries, adjustments and photos with this person will be deleted.',
            ) &&
            context.mounted) {
          final done = await store.run(
            context,
            () => store.api.deleteContact(contactId),
            done: '$name deleted.',
          );
          if (done != null && context.mounted) Navigator.pop(context);
        }
    }
  }
}

class _ContactBody extends StatelessWidget {
  const _ContactBody({
    required this.store,
    required this.data,
    required this.name,
    required this.contactId,
  });
  final MoneyStore store;
  final Json data;
  final String name;
  final String contactId;

  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final balance = Map<String, dynamic>.from(data['balance'] as Map? ?? {});
    final actual = asInt(balance['actualMinor']);
    final adjusted = asInt(balance['adjustedMinor']);
    final (appEntries, openings) = splitEntries(itemsOf(data, 'entries'));
    final adjustments = itemsOf(data, 'adjustments');
    final photos = [for (final p in itemsOf(data, 'photos')) asString(p['id'])];
    final first = name.split(' ').first;
    return ListView(
      key: const Key('contact_ledger'),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        LCard(
          hero: true,
          child: Row(
            children: [
              GeneratedAvatar(name: name, size: 56),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      balanceLine(first, adjusted),
                      key: const Key('contact_balance_line'),
                      style: t.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    CountUpMoney(
                      adjusted.abs(),
                      size: 32,
                      color: adjusted > 0
                          ? c.moneyIn
                          : adjusted < 0
                          ? c.moneyOut
                          : c.text,
                    ),
                    if (actual != adjusted)
                      Text(
                        'Actual ${Money.format(actual.abs())} · adjusted shown',
                        style: t.bodySmall,
                      ),
                    Text(
                      'Gave ${Money.format(asInt(balance['givenMinor']))} · Got ${Money.format(asInt(balance['receivedMinor']))}',
                      style: t.bodySmall?.copyWith(fontFeatures: tabular),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(child: Text('Old khata photos', style: t.titleSmall)),
            TextButton.icon(
              key: const Key('contact_add_photo'),
              onPressed: () async {
                final camera = await askCamera(context);
                if (camera == null || !context.mounted) return;
                final jpeg = await photoSource.pick(camera: camera);
                if (jpeg == null || !context.mounted) return;
                await store.run(
                  context,
                  () => store.api.uploadPhoto(
                    ownerType: 'khata_contact',
                    ownerId: contactId,
                    jpeg: jpeg,
                  ),
                  done: 'Photo kept with $first.',
                );
              },
              icon: const Icon(Icons.add_a_photo_outlined, size: 18),
              label: const Text('Add'),
            ),
          ],
        ),
        if (photos.isNotEmpty)
          SizedBox(
            height: 84,
            child: ListView(
              key: const Key('contact_photos'),
              scrollDirection: Axis.horizontal,
              children: [
                for (var i = 0; i < photos.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: PhotoThumb(
                      store: store,
                      id: photos[i],
                      onTap: () => PhotoViewer.open(context, store, photos, i),
                    ),
                  ),
              ],
            ),
          )
        else
          Text(
            'Keep a photo of the old notebook page here.',
            style: t.bodySmall,
          ),
        if (adjustments.isNotEmpty) ...[
          const SectionHeader('Adjustments'),
          for (final a in adjustments)
            LCard(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          adjustmentTypes
                              .firstWhere(
                                (x) => x.$1 == a['type'],
                                orElse: () => adjustmentTypes.last,
                              )
                              .$2,
                          style: t.titleSmall?.copyWith(
                            decoration: a['active'] == false
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        if (asString(a['note']).isNotEmpty)
                          Text(asString(a['note']), style: t.bodySmall),
                      ],
                    ),
                  ),
                  Text(
                    Money.format(asInt(a['deltaMinor']), signed: true),
                    style: t.titleSmall?.copyWith(fontFeatures: tabular),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) => value == 'toggle'
                        ? store.run(
                            context,
                            () => store.api.setAdjustmentActive(
                              asString(a['id']),
                              a['active'] == false,
                            ),
                          )
                        : store.run(
                            context,
                            () => store.api.deleteAdjustment(asString(a['id'])),
                            done: 'Adjustment removed.',
                          ),
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'toggle',
                        child: Text(
                          a['active'] == false ? 'Restore' : 'Reverse',
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Text('Delete'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
        const SectionHeader('Entries'),
        if (appEntries.isEmpty && openings.isEmpty)
          const EmptyState(
            icon: Icons.menu_book_outlined,
            title: 'No entries yet.',
            detail: 'Use You gave / You got below.',
          ),
        for (final e in appEntries)
          _EntryRow(store: store, entry: e, name: first, contactId: contactId),
        if (openings.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
            child: Row(
              children: [
                Icon(Icons.history_edu_outlined, size: 18, color: c.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    openingHeading,
                    key: const Key('opening_heading'),
                    style: t.labelMedium,
                  ),
                ),
              ],
            ),
          ),
          for (final e in openings)
            _EntryRow(
              store: store,
              entry: e,
              name: first,
              contactId: contactId,
            ),
        ],
      ],
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({
    required this.store,
    required this.entry,
    required this.name,
    required this.contactId,
  });
  final MoneyStore store;
  final Json entry;
  final String name;
  final String contactId;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final gave = entry['direction'] == 'gave';
    final running = asInt(entry['runningMinor']);
    return LCard(
      key: Key('entry_${entry['id']}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      onTap: () => _actions(context),
      child: Row(
        children: [
          Icon(
            gave ? Icons.call_made : Icons.call_received,
            color: gave ? c.moneyOut : c.moneyIn,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  asString(entry['note']).isEmpty
                      ? (gave ? 'You gave' : 'You got')
                      : asString(entry['note']),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: t.titleSmall,
                ),
                Text(
                  [
                    if (asString(entry['date']).isNotEmpty)
                      prettyDate(asString(entry['date'])),
                    if (entry['paidForMe'] == true) 'paid for me',
                    if (asString(entry['dueDate']).isNotEmpty)
                      'due ${prettyDate(asString(entry['dueDate']))}',
                    'Balance ${running < 0 ? '−' : ''}${Money.format(running.abs())}',
                  ].join(' · '),
                  style: t.bodySmall?.copyWith(fontFeatures: tabular),
                ),
              ],
            ),
          ),
          Text(
            '${gave ? '+' : '−'}${Money.format(asInt(entry['amountMinor']))}',
            style: t.titleSmall?.copyWith(
              fontFeatures: tabular,
              color: gave ? c.moneyOut : c.moneyIn,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _actions(BuildContext context) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit entry'),
              onTap: () => Navigator.pop(context, 'edit'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Delete entry'),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    if (choice == 'edit') {
      await showEntrySheet(
        context,
        store,
        contactId,
        name,
        asString(entry['direction'], 'gave'),
        editing: entry,
      );
    } else if (choice == 'delete' &&
        await confirm(
          context,
          title: 'Delete this entry?',
          body: entry['paidForMe'] == true
              ? 'The spending it added is deleted too.'
              : 'It is removed from the balance.',
        ) &&
        context.mounted) {
      await store.run(
        context,
        () => store.api.deleteEntry(asString(entry['id'])),
        done: 'Entry deleted.',
      );
    }
  }
}

String paidForMeSubtitle(String name, bool on) => on
    ? 'With their card / UPI / cash. You owe $name, and it counts as your spending (charts too).'
    : 'Off: $name gave or sent you money. Not your spending.';

Future<void> showEntrySheet(
  BuildContext context,
  MoneyStore store,
  String contactId,
  String name,
  String direction, {
  Json? editing,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => EntrySheet(
    store: store,
    contactId: contactId,
    name: name,
    direction: direction,
    editing: editing,
  ),
);

class EntrySheet extends StatefulWidget {
  const EntrySheet({
    super.key,
    required this.store,
    required this.contactId,
    required this.name,
    required this.direction,
    this.editing,
  });
  final MoneyStore store;
  final String contactId;
  final String name;
  final String direction;
  final Json? editing;
  @override
  State<EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<EntrySheet> {
  final _form = GlobalKey<FormState>();
  late final _amount = TextEditingController(
    text: widget.editing == null
        ? ''
        : paiseInput(asInt(widget.editing!['amountMinor'])),
  );
  late final _note = TextEditingController(
    text: asString(widget.editing?['note']),
  );
  late String _date = asString(widget.editing?['date'], dayKey(DateTime.now()));
  late String? _due = widget.editing?['dueDate'] as String?;
  bool _forMe = false;
  String _category = 'Other';
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final store = widget.store;
    final body = <String, dynamic>{
      'amountMinor': parseRupees(_amount.text)!,
      'date': _date,
      'note': _note.text.trim(),
      'dueDate': _due,
    };
    final result = await store.run(
      context,
      () => widget.editing == null
          ? store.api.addEntry(widget.contactId, {
              'direction': widget.direction,
              ...body,
              if (widget.direction == 'got') 'paidForMe': _forMe,
              if (widget.direction == 'got' && _forMe) 'category': _category,
            })
          : store.api.editEntry(asString(widget.editing!['id']), body),
      done: _forMe ? 'Saved · also added to your spending.' : 'Saved.',
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final name = widget.name;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.direction == 'gave' ? 'You gave money' : 'You got money',
                style: t.headlineSmall,
              ),
              const SizedBox(height: 14),
              TextFormField(
                key: const Key('entry_amount'),
                controller: _amount,
                autofocus: widget.editing == null,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  prefixText: '₹ ',
                ),
                validator: (value) => parseRupees(value ?? '') == null
                    ? 'Enter a valid amount'
                    : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                key: const Key('entry_note'),
                controller: _note,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.event, size: 18),
                      label: Text(prettyDate(_date)),
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate:
                              DateTime.tryParse(_date) ?? DateTime.now(),
                          firstDate: DateTime(2000),
                          lastDate: DateTime.now(),
                        );
                        if (picked != null) {
                          setState(() => _date = dayKey(picked));
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.alarm, size: 18),
                      label: Text(
                        _due == null ? 'Due date' : 'Due ${prettyDate(_due)}',
                      ),
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now().add(
                            const Duration(days: 7),
                          ),
                          firstDate: DateTime(2015),
                          lastDate: DateTime(2100),
                        );
                        setState(
                          () => _due = picked == null ? null : dayKey(picked),
                        );
                      },
                    ),
                  ),
                ],
              ),
              if (widget.direction == 'got' && widget.editing == null) ...[
                const SizedBox(height: 8),
                SwitchListTile(
                  key: const Key('entry_paid_for_me'),
                  contentPadding: EdgeInsets.zero,
                  value: _forMe,
                  onChanged: (value) => setState(() => _forMe = value),
                  title: Text('$name paid for something of mine'),
                  subtitle: Text(
                    paidForMeSubtitle(name, _forMe),
                    key: const Key('entry_paid_for_me_subtitle'),
                  ),
                ),
                if (_forMe)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final category in expenseCategories)
                        ChoiceChip(
                          label: Text(category),
                          selected: _category == category,
                          showCheckmark: false,
                          onSelected: (_) =>
                              setState(() => _category = category),
                        ),
                    ],
                  ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                key: const Key('save_entry'),
                onPressed: _busy ? null : _save,
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showAdjustmentSheet(
  BuildContext context,
  MoneyStore store,
  String contactId,
) async {
  var type = 'waived';
  var reduce = true;
  final amount = TextEditingController();
  final note = TextEditingController();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
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
                'Add adjustment',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                'Actual entries stay unchanged. Both actual and adjusted balances are shown.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final option in adjustmentTypes)
                    ChoiceChip(
                      label: Text(option.$2),
                      selected: type == option.$1,
                      showCheckmark: false,
                      onSelected: (_) => setState(() {
                        type = option.$1;
                        reduce = option.$3;
                      }),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  prefixText: '₹ ',
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: reduce,
                onChanged: (value) => setState(() => reduce = value),
                title: const Text('Reduce the balance toward zero'),
              ),
              TextField(
                controller: note,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                  final value = parseRupees(amount.text);
                  if (value == null) return;
                  final done = await store.run(
                    context,
                    () => store.api.addAdjustment(contactId, {
                      'type': type,
                      'amountMinor': value,
                      'reduce': reduce,
                      'note': note.text.trim(),
                    }),
                    done: 'Adjustment added.',
                  );
                  if (done != null && context.mounted) Navigator.pop(context);
                },
                child: const Text('Save adjustment'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  amount.dispose();
  note.dispose();
}
