import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import '../peer/peer.dart';
import '../reimburse/reimburse.dart';
import 'money_store.dart';
import 'overview_tab.dart' show asString;
import 'photos.dart';

Future<T?> _sheet<T>(BuildContext context, WidgetBuilder builder) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: builder,
    );

// ---------------------------------------------------------------- add / edit

Future<void> showTxnForm(BuildContext context, MoneyStore store, {Json? txn}) =>
    _sheet(context, (_) => TxnForm(store: store, txn: txn));

class TxnForm extends StatefulWidget {
  const TxnForm({super.key, required this.store, this.txn});
  final MoneyStore store;
  final Json? txn;
  @override
  State<TxnForm> createState() => _TxnFormState();
}

class _TxnFormState extends State<TxnForm> {
  final _form = GlobalKey<FormState>();
  late final _title = TextEditingController(
    text: asString(widget.txn?['title']),
  );
  late final _amount = TextEditingController(
    text: widget.txn == null
        ? ''
        : paiseInput(asInt(widget.txn!['amountMinor'])),
  );
  late final _note = TextEditingController(text: asString(widget.txn?['note']));
  late String _direction = asString(widget.txn?['direction'], 'debit');
  late String _category = asString(widget.txn?['category'], 'Food');
  late String _channel = asString(widget.txn?['channel'], 'UPI');
  late String _date = asString(widget.txn?['date'], dayKey(DateTime.now()));
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  List<String> get _categories =>
      _direction == 'credit' ? incomeCategories : expenseCategories;

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final values = {
      'title': _title.text.trim(),
      'amountMinor': parseRupees(_amount.text)!,
      'date': _date,
      'category': _categories.contains(_category)
          ? _category
          : _categories.last,
      'note': _note.text.trim(),
      if (widget.txn == null) ...{'direction': _direction, 'channel': _channel},
    };
    final store = widget.store;
    final result = await store.run(
      context,
      () => widget.txn == null
          ? store.api.addTxn(values)
          : store.api.editTxn(asString(widget.txn!['id']), values),
      done: widget.txn == null ? 'Payment added.' : 'Saved.',
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
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
              widget.txn == null ? 'Add a payment' : 'Edit payment',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            if (widget.txn == null)
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'debit', label: Text('Money out')),
                  ButtonSegment(value: 'credit', label: Text('Money in')),
                ],
                selected: {_direction},
                onSelectionChanged: (value) => setState(() {
                  _direction = value.first;
                  _category = _categories.first;
                }),
              ),
            const SizedBox(height: 14),
            TextFormField(
              key: const Key('txn_amount'),
              controller: _amount,
              autofocus: widget.txn == null,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Amount',
                prefixText: '₹ ',
              ),
              validator: (value) => parseRupees(value ?? '') == null
                  ? 'Enter an amount like 450 or 99.50.'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('txn_title'),
              controller: _title,
              textCapitalization: TextCapitalization.sentences,
              maxLength: 80,
              decoration: const InputDecoration(
                labelText: 'What or who',
                counterText: '',
              ),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter a short title.' : null,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final category in _categories)
                  ChoiceChip(
                    label: Text(category),
                    avatar: Icon(categoryIcon(category), size: 16),
                    selected: _category == category,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _category = category),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.event, size: 18),
                    label: Text(prettyDate(_date)),
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
                        firstDate: DateTime(2015),
                        lastDate: DateTime.now(),
                      );
                      if (picked != null) {
                        setState(() => _date = dayKey(picked));
                      }
                    },
                  ),
                ),
                if (widget.txn == null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _channel,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Paid by',
                        isDense: true,
                      ),
                      items: [
                        for (final channel in channels)
                          DropdownMenuItem(
                            value: channel,
                            child: Text(channel),
                          ),
                      ],
                      onChanged: (value) =>
                          setState(() => _channel = value ?? _channel),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _note,
              maxLength: 300,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                counterText: '',
              ),
            ),
            const SizedBox(height: 18),
            FilledButton(
              key: const Key('txn_save'),
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- detail

Future<void> showTxnDetail(BuildContext context, MoneyStore store, Json txn) =>
    _sheet(context, (_) => TxnDetail(store: store, txn: txn));

class TxnDetail extends StatefulWidget {
  const TxnDetail({super.key, required this.store, required this.txn});
  final MoneyStore store;
  final Json txn;
  @override
  State<TxnDetail> createState() => _TxnDetailState();
}

class _TxnDetailState extends State<TxnDetail> {
  late Json _txn = Map.of(widget.txn);
  final List<String> _photos = [];

  MoneyStore get store => widget.store;
  String get id => asString(_txn['id']);
  bool get credit => _txn['direction'] == 'credit';
  int get amount => asInt(_txn['amountMinor']);

  @override
  void initState() {
    super.initState();
    for (final photo in _txn['photos'] as List? ?? const []) {
      _photos.add(photo is Map ? asString(photo['id']) : asString(photo));
    }
  }

  Future<void> _patch(Json values, {String? done}) async {
    final result = await store.run(
      context,
      () => store.api.editTxn(id, values),
      done: done,
    );
    if (result != null && mounted) {
      setState(
        () => _txn = {
          ..._txn,
          ...values,
          ...?result['txn'] as Map<String, dynamic>?,
        },
      );
    }
  }

  void _apply(Json? result) {
    if (result == null || !mounted) return;
    final updated = result['txn'];
    if (updated is Map) {
      setState(() => _txn = Map<String, dynamic>.from(updated));
    }
  }

  Future<void> _addPhoto() async {
    final camera = await askCamera(context);
    if (camera == null || !mounted) return;
    final jpeg = await photoSource.pick(camera: camera);
    if (jpeg == null || !mounted) return;
    final photoId = await store.run(
      context,
      () => store.api.uploadPhoto(ownerType: 'txn', ownerId: id, jpeg: jpeg),
      done: 'Receipt photo saved.',
    );
    if (photoId != null && mounted) setState(() => _photos.add(photoId));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final own = _txn.containsKey('ownMinor') ? asInt(_txn['ownMinor']) : amount;
    final counterparty = asString(_txn['counterparty']);
    final name = asString(_txn['title']);
    final person =
        _txn['isPerson'] == true ||
        _txn['peerTag'] != null ||
        PeerRules.looksLikePerson(
          counterparty.contains('@')
              ? name
              : (counterparty.isEmpty ? name : counterparty),
          upiId: counterparty.contains('@') ? counterparty : null,
        );
    final categories = credit ? incomeCategories : expenseCategories;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .85,
      maxChildSize: .95,
      builder: (context, controller) => ListView(
        key: const Key('txn_detail'),
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Text(
            '${credit ? '+' : '−'}${Money.format(amount)}',
            style: t.displaySmall?.copyWith(
              fontFeatures: tabular,
              color: credit ? c.moneyIn : c.text,
            ),
          ),
          if (own != amount)
            Text('Your part: ${Money.format(own)}', style: t.bodyMedium),
          const SizedBox(height: 6),
          Text(name, style: t.headlineSmall),
          const SizedBox(height: 4),
          Text(
            [
              prettyDate(asString(_txn['date'])),
              if (asString(_txn['time']).isNotEmpty) asString(_txn['time']),
              asString(_txn['channel']),
              if (asString(_txn['bank']).isNotEmpty) asString(_txn['bank']),
              if (asString(_txn['last4']).isNotEmpty) '••${_txn['last4']}',
              'from ${asString(_txn['source'], 'manual')}',
            ].where((part) => part.isNotEmpty).join(' · '),
            style: t.bodySmall,
          ),
          if (_txn['needsReview'] == true) ...[
            const SizedBox(height: 12),
            Banner2(
              text: 'Please check this one. The phone was not fully sure.',
              tone: c.warn,
              action: 'Looks right',
              onAction: () =>
                  _patch({'needsReview': false}, done: 'Marked as checked.'),
            ),
          ],
          const SizedBox(height: 16),
          Text('Category', style: t.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final category in categories)
                ChoiceChip(
                  key: Key('cat_$category'),
                  label: Text(category),
                  avatar: Icon(categoryIcon(category), size: 16),
                  showCheckmark: false,
                  selected: _txn['category'] == category,
                  onSelected: (_) => _patch({'category': category}),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text('What was it for?', style: t.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final idea in purposeIdeas)
                ChoiceChip(
                  key: Key('purpose_$idea'),
                  label: Text(idea),
                  showCheckmark: false,
                  selected: _txn['purpose'] == idea,
                  onSelected: (selected) =>
                      _patch({'purpose': selected ? idea : ''}),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (person || counterparty.isNotEmpty) _peerTile(context),
          _reimburseTile(context),
          if (credit)
            ListTile(
              key: const Key('detail_refund'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.undo),
              title: Text(
                _txn['refundOfId'] == null
                    ? 'Is this a refund?'
                    : 'Refund of an earlier payment',
              ),
              subtitle: Text(
                _txn['refundOfId'] == null
                    ? 'Link it to the payment it gives back: it lowers spending instead of adding income'
                    : 'Lowers your spending · tap to unlink',
              ),
              onTap: () async {
                if (_txn['refundOfId'] != null) {
                  _apply(
                    await store.run(
                      context,
                      () => store.api.refundOf(id, null),
                      done: 'Refund link removed.',
                    ),
                  );
                  return;
                }
                final original = await pickTxn(
                  context,
                  store,
                  title: 'Which payment was refunded?',
                  direction: 'debit',
                );
                if (original != null && context.mounted) {
                  _apply(
                    await store.run(
                      context,
                      () => store.api.refundOf(id, original),
                      done: 'Linked as a refund.',
                    ),
                  );
                }
              },
            ),
          ListTile(
            key: const Key('detail_transfer'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.swap_horiz),
            title: Text(
              _txn['transferId'] != null || _txn['isTransfer'] == true
                  ? 'Transfer between my accounts'
                  : 'Moved to my own account?',
            ),
            subtitle: Text(
              _txn['transferId'] != null || _txn['isTransfer'] == true
                  ? 'Not spending or income · tap to undo'
                  : 'Self-transfers count nowhere',
            ),
            onTap: () => _transfer(context),
          ),
          const SizedBox(height: 8),
          Text('Receipt', style: t.titleSmall),
          const SizedBox(height: 8),
          SizedBox(
            height: 84,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (var i = 0; i < _photos.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: PhotoThumb(
                      store: store,
                      id: _photos[i],
                      onTap: () => PhotoViewer.open(context, store, _photos, i),
                    ),
                  ),
                OutlinedButton.icon(
                  key: const Key('detail_add_photo'),
                  onPressed: _addPhoto,
                  icon: const Icon(Icons.add_a_photo_outlined),
                  label: const Text('Add photo'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    Navigator.pop(context);
                    await showTxnForm(context, store, txn: _txn);
                  },
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('detail_delete'),
                  style: OutlinedButton.styleFrom(foregroundColor: c.danger),
                  onPressed: () async {
                    final yes = await confirm(
                      context,
                      title: 'Delete this payment?',
                      body: 'It is removed with any khata entry made from it.',
                    );
                    if (!yes || !context.mounted) return;
                    final done = await store.run(
                      context,
                      () => store.api.deleteTxn(id),
                      done: 'Payment deleted.',
                    );
                    if (done != null && context.mounted) Navigator.pop(context);
                  },
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Delete'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _peerTile(BuildContext context) {
    final tag = _txn['peerTag'] as String?;
    final who = asString(_txn['contactName'], asString(_txn['title']));
    final label = switch (tag) {
      'lent' => '$who owes me',
      'split' => 'Split with ${_txn['splitPeople'] ?? 2}',
      'repaid' => 'I was paying $who back',
      'borrowed' => 'I owe $who',
      'got_back' => '$who paid me back',
      'owe_owner' => "Paid with $who's card or money",
      'personal' => 'Just mine',
      'left' => 'Left for later',
      _ => credit ? 'Got from $who' : 'Sent to $who',
    };
    return ListTile(
      key: const Key('detail_peer'),
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.people_outline),
      title: Text(label),
      subtitle: Text(
        tag == null
            ? (credit ? 'Paying you back?' : 'Does $who owe you?')
            : 'Money with friends · tap to change',
      ),
      onTap: () async {
        final result = await showPeerSheet(context, store, _txn);
        _apply(result);
      },
    );
  }

  Widget _reimburseTile(BuildContext context) {
    final c = context.lc;
    final tag = _txn['reimburseTag'];
    if (!credit) {
      if (tag == 'claim') {
        final paid = _txn['reimbursedById'] != null;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              key: const Key('detail_reimburse'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                paid ? Icons.task_alt : Icons.hourglass_top,
                color: paid ? c.moneyIn : c.warn,
              ),
              title: Text(
                paid
                    ? 'Got back ${Money.format(asInt(_txn['reimburseMinor']))}'
                    : 'Getting back ${Money.format(asInt(_txn['reimburseMinor']))}',
              ),
              subtitle: Text(
                paid
                    ? 'Reimbursed'
                    : 'Office / insurance will pay it back · not counted as your spending · tap to change',
              ),
              onTap: paid
                  ? null
                  : () async =>
                        _apply(await showClaimSheet(context, store, _txn)),
            ),
            if (_txn['peerTag'] == 'owe_owner')
              Text(
                "Paid with ${asString(_txn['contactName'], 'their')}'s card: pay ${asString(_txn['contactName'], 'them')} back in Khata when the money comes.",
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        );
      }
      return ListTile(
        key: const Key('detail_reimburse'),
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.currency_exchange),
        title: const Text('Will you get this back?'),
        subtitle: const Text(
          'Office, client or insurance pays it back: not your spending',
        ),
        onTap: () async => _apply(await showClaimSheet(context, store, _txn)),
      );
    }
    if (tag == 'received') {
      final extra = amount - asInt(_txn['reimburseMinor']);
      return ListTile(
        key: const Key('detail_reimburse'),
        contentPadding: EdgeInsets.zero,
        leading: Icon(Icons.task_alt, color: c.moneyIn),
        title: Text(
          'Reimbursement: paid back ${Money.format(asInt(_txn['reimburseMinor']))}',
        ),
        subtitle: Text(
          extra > 0
              ? 'Extra ${Money.format(extra)} counts as your income · tap to undo'
              : 'Not counted as income · tap to undo',
        ),
        onTap: () async {
          final yes = await confirm(
            context,
            title: 'Not a reimbursement?',
            body: 'Those payments go back to waiting.',
            yes: 'Undo',
          );
          if (yes && context.mounted) {
            _apply(
              await store.run(
                context,
                () => store.api.undoReceived(id),
                done: 'Undone · those payments are waiting again',
              ),
            );
            if (mounted) {
              setState(
                () =>
                    _txn = {..._txn, 'reimburseTag': null, 'reimburseMinor': 0},
              );
            }
          }
        },
      );
    }
    return ListTile(
      key: const Key('detail_reimburse'),
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.currency_exchange),
      title: const Text('Is this a reimbursement?'),
      subtitle: const Text(
        'Money paying back something you spent (office, insurance…)',
      ),
      onTap: () async => _apply(await showReceivedSheet(context, store, _txn)),
    );
  }

  Future<void> _transfer(BuildContext context) async {
    if (_txn['transferId'] != null || _txn['isTransfer'] == true) {
      final result = await store.run(
        context,
        () => store.api.unlinkTransfer(id),
        done: 'Transfer undone.',
      );
      _apply(result);
      if (result != null && mounted) {
        setState(
          () => _txn = {..._txn, 'transferId': null, 'isTransfer': false},
        );
      }
      return;
    }
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.link),
              title: const Text('Link to the other side'),
              subtitle: const Text(
                'Pick the matching payment on my other account',
              ),
              onTap: () => Navigator.pop(context, 'link'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_outlined),
              title: const Text('Transfer to my untracked account'),
              subtitle: const Text('An account LifeOS does not follow'),
              onTap: () => Navigator.pop(context, 'untracked'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted || choice == null) return;
    if (choice == 'untracked') {
      _apply(
        await store.run(
          context,
          () => store.api.untrackedTransfer(id),
          done: 'Marked as a transfer.',
        ),
      );
      if (mounted) setState(() => _txn = {..._txn, 'isTransfer': true});
      return;
    }
    final other = await pickTxn(
      context,
      store,
      title: 'Which payment is the other side?',
      direction: credit ? 'debit' : 'credit',
      amountMinor: amount,
    );
    if (other != null && context.mounted) {
      _apply(
        await store.run(
          context,
          () => store.api.linkTransfer(id, other),
          done: 'Linked as a transfer.',
        ),
      );
      if (mounted) setState(() => _txn = {..._txn, 'isTransfer': true});
    }
  }
}

/// Lets the user pick a recent transaction (refund original, transfer side).
Future<String?> pickTxn(
  BuildContext context,
  MoneyStore store, {
  required String title,
  required String direction,
  int? amountMinor,
}) => _sheet<String>(context, (context) {
  final today = DateTime.now();
  return FutureBuilder<Json>(
    future: store.api.txns(
      direction: direction,
      from: dayKey(today.subtract(const Duration(days: 120))),
      limit: 100,
    ),
    builder: (context, snapshot) {
      final rows = snapshot.hasData ? itemsOf(snapshot.data!) : <Json>[];
      if (amountMinor != null) {
        rows.sort(
          (a, b) => (asInt(a['amountMinor']) - amountMinor).abs().compareTo(
            (asInt(b['amountMinor']) - amountMinor).abs(),
          ),
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          if (!snapshot.hasData)
            const Padding(
              padding: EdgeInsets.all(30),
              child: Center(child: CircularProgressIndicator()),
            ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final row in rows)
                  ListTile(
                    title: Text(asString(row['title'])),
                    subtitle: Text(prettyDate(asString(row['date']))),
                    trailing: MoneyText(asInt(row['amountMinor'])),
                    onTap: () => Navigator.pop(context, asString(row['id'])),
                  ),
              ],
            ),
          ),
        ],
      );
    },
  );
});

// ---------------------------------------------------------------- peer

Future<Json?> showPeerSheet(BuildContext context, MoneyStore store, Json txn) =>
    _sheet<Json>(context, (_) => PeerSheet(store: store, txn: txn));

class PeerSheet extends StatefulWidget {
  const PeerSheet({super.key, required this.store, required this.txn});
  final MoneyStore store;
  final Json txn;
  @override
  State<PeerSheet> createState() => _PeerSheetState();
}

class _PeerSheetState extends State<PeerSheet> {
  late final _name = TextEditingController(
    text: PeerRules.contactName(
      asString(widget.txn['contactName'], asString(widget.txn['title'])),
    ),
  )..addListener(() => setState(() {}));
  int _people = 2;
  bool _busy = false;

  bool get outgoing => widget.txn['direction'] != 'credit';
  int get amount => asInt(widget.txn['amountMinor']);
  String get _who {
    final name = _name.text.trim();
    return name.isEmpty ? 'them' : PeerRules.contactName(name);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _answer(PeerAnswer? answer) async {
    setState(() => _busy = true);
    final store = widget.store;
    final who = _who;
    final outcome = answer == null
        ? null
        : PeerRules.outcome(answer, amount, people: _people, credit: !outgoing);
    final message = switch (answer) {
      PeerAnswer.lent || PeerAnswer.split =>
        '$who owes you ${Money.format(outcome!.khataPaise)}. Added to Khata.',
      PeerAnswer.repaid => 'Marked as paid back to $who.',
      PeerAnswer.borrowed || PeerAnswer.owedToOwner =>
        'You owe $who ${Money.format(outcome!.khataPaise)}. Added to Khata.',
      PeerAnswer.gotBack => '$who paid you back. Khata updated.',
      PeerAnswer.personal => 'Saved as a normal payment.',
      PeerAnswer.left => 'Left for later. Find it in Khata → Left for later.',
      null => 'Answer cleared.',
    };
    final result = await store.run(
      context,
      () => store.api.setPeer(
        asString(widget.txn['id']),
        peerTag: answer?.tag,
        contactName:
            answer == null ||
                answer == PeerAnswer.personal ||
                answer == PeerAnswer.left
            ? null
            : _name.text.trim(),
        splitPeople: answer == PeerAnswer.split ? _people : null,
      ),
      done: message,
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context, result);
    } else {
      setState(() => _busy = false);
    }
  }

  Widget _option(
    Key key,
    IconData icon,
    String title,
    String subtitle,
    PeerAnswer answer, {
    Color? color,
  }) => LCard(
    key: key,
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
    onTap: _busy ? null : () => _answer(answer),
    child: Row(
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 2),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final money = Money.format(amount);
    final share = PeerRules.outcome(
      PeerAnswer.split,
      amount,
      people: _people,
    ).khataPaise;
    final original = asString(widget.txn['title']);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          key: const Key('peer_sheet'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              outgoing
                  ? 'You sent $money to $original'
                  : 'You got $money from $original',
              style: t.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Pick one. Type the person in "Name in Khata" if it is not them.',
              style: t.bodySmall,
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('peer_name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Name in Khata',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 14),
            Text('Who owes whom?', style: t.labelLarge),
            const SizedBox(height: 8),
            if (outgoing) ...[
              _option(
                const Key('peer_lent'),
                Icons.call_made,
                '$_who owes me $money',
                'I lent it or paid for them',
                PeerAnswer.lent,
                color: c.moneyIn,
              ),
              LCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.call_split),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Split bill: $_who owes ${Money.format(share)}',
                            key: const Key('peer_split_label'),
                            style: t.titleSmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final n in [2, 3, 4, 5, 6])
                          ChoiceChip(
                            key: Key('peer_people_$n'),
                            label: Text(n == 2 ? '2 people' : '$n'),
                            selected: _people == n,
                            onSelected: (_) => setState(() => _people = n),
                          ),
                      ],
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonal(
                        key: const Key('peer_split'),
                        onPressed: _busy
                            ? null
                            : () => _answer(PeerAnswer.split),
                        child: Text('Split with $_people'),
                      ),
                    ),
                  ],
                ),
              ),
              _option(
                const Key('peer_owe_owner'),
                Icons.credit_card,
                'I owe $_who $money',
                "Paid with $_who's card or money (e.g. add-on card on your brother's card)",
                PeerAnswer.owedToOwner,
                color: c.moneyOut,
              ),
              _option(
                const Key('peer_repaid'),
                Icons.replay,
                'I was paying $_who back',
                'Reduces what I owe them',
                PeerAnswer.repaid,
              ),
            ] else ...[
              _option(
                const Key('peer_borrowed'),
                Icons.call_received,
                'I owe $_who $money',
                'I borrowed it or am keeping it for them',
                PeerAnswer.borrowed,
                color: c.moneyOut,
              ),
              _option(
                const Key('peer_got_back'),
                Icons.call_made,
                '$_who paid me back',
                'Reduces what $_who owes me',
                PeerAnswer.gotBack,
                color: c.moneyIn,
              ),
            ],
            const SizedBox(height: 6),
            Text('Nobody owes anything', style: t.labelLarge),
            const SizedBox(height: 8),
            _option(
              const Key('peer_personal'),
              Icons.check_circle_outline,
              outgoing
                  ? 'Just mine: normal payment / gift'
                  : 'Just mine: gift / income',
              outgoing ? 'Counts as my spending' : 'Counts as my income',
              PeerAnswer.personal,
            ),
            _option(
              const Key('peer_left'),
              Icons.inventory_2_outlined,
              'Just leave it',
              'Kept in a separate "Left for later" list in Khata · decide any time later',
              PeerAnswer.left,
            ),
            if (widget.txn['peerTag'] != null)
              TextButton(
                key: const Key('peer_clear'),
                onPressed: _busy ? null : () => _answer(null),
                child: const Text('Clear my answer'),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- reimburse

Future<Json?> showClaimSheet(
  BuildContext context,
  MoneyStore store,
  Json txn,
) => _sheet<Json>(context, (_) => ClaimSheet(store: store, txn: txn));

class ClaimSheet extends StatefulWidget {
  const ClaimSheet({super.key, required this.store, required this.txn});
  final MoneyStore store;
  final Json txn;
  @override
  State<ClaimSheet> createState() => _ClaimSheetState();
}

class _ClaimSheetState extends State<ClaimSheet> {
  late final int ownPart =
      (asInt(widget.txn['amountMinor']) - asInt(widget.txn['peerShareMinor']))
          .clamp(0, asInt(widget.txn['amountMinor']));
  late final bool claimed = widget.txn['reimburseTag'] == 'claim';
  late final _amount = TextEditingController(
    text: paiseInput(claimed ? asInt(widget.txn['reimburseMinor']) : ownPart),
  )..addListener(() => setState(() {}));
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final value = parseRupees(_amount.text);
    final invalid = value == null || value > ownPart;
    final store = widget.store;
    final id = asString(widget.txn['id']);
    final owner = widget.txn['peerTag'] == 'owe_owner'
        ? asString(widget.txn['contactName'])
        : '';
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        key: const Key('claim_sheet'),
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Will you get this back?', style: t.titleLarge),
          const SizedBox(height: 6),
          Text(
            'While you wait it is not counted as your spending. If less comes back, the missing part counts again.',
            style: t.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('claim_amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Amount you will get back',
              prefixText: '₹ ',
              helperText: 'Up to ${Money.format(ownPart)} (your part)',
              errorText: value != null && value > ownPart
                  ? 'That is more than your part.'
                  : null,
            ),
          ),
          if (owner.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              "Paid with $owner's card: pay $owner back in Khata when the money comes.",
              key: const Key('claim_owner_note'),
              style: t.bodyMedium,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('claim_save'),
            onPressed: invalid || _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    final result = await store.run(
                      context,
                      () => store.api.claim(id, amountMinor: value),
                      done: 'Waiting for ${Money.format(value)} back.',
                    );
                    if (!context.mounted) return;
                    if (result != null) {
                      Navigator.pop(
                        context,
                        result['txn'] is Map
                            ? result
                            : {
                                'txn': {
                                  ...widget.txn,
                                  'reimburseTag': 'claim',
                                  'reimburseMinor': value,
                                },
                              },
                      );
                    } else {
                      setState(() => _busy = false);
                    }
                  },
            child: const Text("Yes, I'll get it back"),
          ),
          if (claimed)
            TextButton(
              key: const Key('claim_remove'),
              onPressed: () async {
                final result = await store.run(
                  context,
                  () => store.api.unclaim(id),
                  done: 'Counts as your spending again.',
                );
                if (result != null && context.mounted) {
                  Navigator.pop(context, {
                    'txn': {
                      ...widget.txn,
                      'reimburseTag': null,
                      'reimburseMinor': 0,
                    },
                  });
                }
              },
              child: const Text('Not getting it back'),
            ),
        ],
      ),
    );
  }
}

Future<Json?> showReceivedSheet(
  BuildContext context,
  MoneyStore store,
  Json credit,
) => _sheet<Json>(context, (_) => ReceivedSheet(store: store, credit: credit));

class ReceivedSheet extends StatefulWidget {
  const ReceivedSheet({super.key, required this.store, required this.credit});
  final MoneyStore store;
  final Json credit;
  @override
  State<ReceivedSheet> createState() => _ReceivedSheetState();
}

class _ReceivedSheetState extends State<ReceivedSheet> {
  List<Json>? _claims;
  final Set<String> _picked = {};
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.store.api.reimbursements().then(
      (value) {
        if (!mounted) return;
        final waiting =
            itemsOf(value)
                .where((row) => row['waiting'] != false)
                .map(
                  (row) => Map<String, dynamic>.from(row['txn'] as Map? ?? row),
                )
                .toList()
              ..sort(
                (a, b) => asString(a['date']).compareTo(asString(b['date'])),
              );
        setState(() => _claims = waiting);
      },
      onError: (_) {
        if (mounted) {
          setState(
            () => _error = 'Could not load the payments waiting to come back.',
          );
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final amount = asInt(widget.credit['amountMinor']);
    final chosen = (_claims ?? const <Json>[])
        .where((row) => _picked.contains(asString(row['id'])))
        .toList();
    final split = Reimburse.allocate(amount, [
      for (var i = 0; i < chosen.length; i++)
        ReimburseClaim(i, asInt(chosen[i]['reimburseMinor'])),
    ]);
    final store = widget.store;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        key: const Key('received_sheet'),
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Which payments did ${Money.format(amount)} pay back?',
            style: t.titleLarge,
          ),
          const SizedBox(height: 8),
          if (_error != null) Text(_error!),
          if (_claims == null && _error == null)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_claims != null && _claims!.isEmpty)
            const Padding(
              key: Key('reimb_none'),
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nothing is waiting to be paid back. First open the payment you made and tap "Will you get this back?".',
              ),
            ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final row in _claims ?? const <Json>[])
                  CheckboxListTile(
                    key: Key('reimb_pick_${row['id']}'),
                    contentPadding: EdgeInsets.zero,
                    value: _picked.contains(asString(row['id'])),
                    onChanged: (value) => setState(
                      () => value == true
                          ? _picked.add(asString(row['id']))
                          : _picked.remove(asString(row['id'])),
                    ),
                    title: Text(
                      asString(row['title']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      '${prettyDate(asString(row['date']))} · ${Money.format(asInt(row['reimburseMinor']))}',
                    ),
                  ),
              ],
            ),
          ),
          if (chosen.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              [
                'Pays back ${Money.format(split.matchedPaise)}: not income.',
                if (split.extraPaise > 0)
                  'Extra ${Money.format(split.extraPaise)} is yours: counts as income.',
                if (split.shortPaise > 0)
                  '${Money.format(split.shortPaise)} short: counts as your spending.',
              ].join('\n'),
              key: const Key('reimb_preview'),
              style: t.bodyMedium,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('reimb_received_save'),
            onPressed: chosen.isEmpty || _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    final ids = [for (final row in chosen) asString(row['id'])];
                    final result = await store.run(
                      context,
                      () => store.api.received(
                        asString(widget.credit['id']),
                        ids,
                      ),
                    );
                    if (!context.mounted) return;
                    if (result == null) {
                      setState(() => _busy = false);
                      return;
                    }
                    final extra = asInt(result['extraMinor']);
                    snack(
                      context,
                      extra > 0
                          ? 'Reimbursed · extra ${Money.format(extra)} counted as income'
                          : 'Reimbursed',
                    );
                    Navigator.pop(context, {
                      'txn': {
                        ...widget.credit,
                        'reimburseTag': 'received',
                        'reimburseMinor': asInt(result['matchedMinor']),
                      },
                    });
                  },
            child: const Text('Yes, it paid these back'),
          ),
        ],
      ),
    );
  }
}
