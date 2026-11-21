import 'dart:async';
import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'money_store.dart';
import 'overview_tab.dart' show MonthSwitcher, asString;
import 'txn_sheets.dart';

const txnFilters = ['All', 'Spent', 'Income', 'To review', 'Left'];

class TransactionsTab extends StatefulWidget {
  const TransactionsTab({super.key, required this.store});
  final MoneyStore store;
  @override
  State<TransactionsTab> createState() => _TransactionsTabState();
}

class _TransactionsTabState extends State<TransactionsTab> {
  String _filter = 'All';
  String _query = '';
  String? _category;
  Timer? _debounce;
  int _version = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<Json> _load() {
    final store = widget.store;
    final (from, to) = monthRange(store.month);
    final review = _filter == 'To review';
    final left = _filter == 'Left';
    return store.api.txns(
      from: review || left ? null : from,
      to: review || left ? null : to,
      q: _query.trim().isEmpty ? null : _query.trim(),
      category: _category,
      direction: switch (_filter) {
        'Spent' => 'debit',
        'Income' => 'credit',
        _ => null,
      },
      review: review,
      left: left,
      limit: 200,
    );
  }

  void _set(VoidCallback change) => setState(() {
    change();
    _version++;
  });

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
        child: Column(
          children: [
            MonthSwitcher(store: widget.store),
            TextField(
              key: const Key('txn_search'),
              decoration: const InputDecoration(
                hintText: 'Search title, person, note',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (value) {
                _debounce?.cancel();
                _debounce = Timer(
                  const Duration(milliseconds: 300),
                  () => _set(() => _query = value),
                );
              },
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final option in txnFilters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        key: Key('txn_filter_$option'),
                        label: Text(option),
                        selected: _filter == option,
                        showCheckmark: false,
                        onSelected: (_) => _set(() => _filter = option),
                      ),
                    ),
                  PopupMenuButton<String>(
                    tooltip: 'Filter by category',
                    onSelected: (value) =>
                        _set(() => _category = value == 'all' ? null : value),
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: 'all',
                        child: Text('Every category'),
                      ),
                      for (final category in [
                        ...expenseCategories,
                        ...incomeCategories,
                      ])
                        PopupMenuItem(value: category, child: Text(category)),
                    ],
                    child: Chip(
                      avatar: const Icon(Icons.tune, size: 16),
                      label: Text(_category ?? 'Category'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      Expanded(
        child: MoneyLoader<Json>(
          key: ValueKey('txns-$_version'),
          store: widget.store,
          watchMonth: true,
          load: _load,
          builder: (context, data) =>
              TxnList(store: widget.store, txns: itemsOf(data)),
        ),
      ),
    ],
  );
}

class TxnList extends StatefulWidget {
  const TxnList({super.key, required this.store, required this.txns});
  final MoneyStore store;
  final List<Json> txns;
  @override
  State<TxnList> createState() => _TxnListState();
}

class _TxnListState extends State<TxnList> {
  final Set<String> _removed = {};
  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final txns = widget.txns
        .where((txn) => !_removed.contains(asString(txn['id'])))
        .toList();
    if (txns.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'Nothing here yet.',
            detail:
                'Add a payment with +, or turn on automatic tracking from Overview.',
          ),
        ],
      );
    }
    final rows = <Widget>[];
    String? lastDate;
    for (final txn in txns) {
      final date = asString(txn['date']);
      if (date != lastDate) {
        rows.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
            child: Text(
              prettyDate(date),
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ),
        );
        lastDate = date;
      }
      rows.add(
        TxnRow(
          store: store,
          txn: txn,
          onRemoved: () => setState(() => _removed.add(asString(txn['id']))),
        ),
      );
    }
    return ListView(
      key: const Key('txn_list'),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
      children: rows,
    );
  }
}

class TxnRow extends StatelessWidget {
  const TxnRow({
    super.key,
    required this.store,
    required this.txn,
    this.onRemoved,
  });
  final MoneyStore store;
  final Json txn;
  final VoidCallback? onRemoved;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final id = asString(txn['id']);
    final credit = txn['direction'] == 'credit';
    final amount = asInt(txn['amountMinor']);
    final own = txn.containsKey('ownMinor') ? asInt(txn['ownMinor']) : amount;
    final pending = txn['status'] == 'pending';
    final failed = txn['status'] == 'failed';
    final tags = [
      if (txn['needsReview'] == true) 'Review',
      if (txn['isTransfer'] == true) 'Transfer',
      if (txn['peerTag'] == 'left') 'Left',
      if (txn['reimburseTag'] == 'claim') 'Getting back',
      if (pending) 'Pending',
      if (failed) 'Failed',
    ];
    return Dismissible(
      key: Key('txn_$id'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: c.danger.withValues(alpha: .18),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Icon(Icons.delete_outline, color: c.danger),
      ),
      confirmDismiss: (_) async {
        final yes = await confirm(
          context,
          title: 'Delete this payment?',
          body:
              '“${asString(txn['title'])}” (${Money.format(amount)}) will be removed, with any khata entry made from it.',
        );
        if (!yes || !context.mounted) return false;
        final ok = await store.run(
          context,
          () => store.api.deleteTxn(id),
          done: 'Payment deleted.',
        );
        return ok != null;
      },
      onDismissed: (_) => onRemoved?.call(),
      child: LCard(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        onTap: () => showTxnDetail(context, store, txn),
        child: Row(
          children: [
            IconTile(
              categoryIcon(asString(txn['category'])),
              color: credit
                  ? c.moneyIn
                  : LifeColors.chart[nameIndex(asString(txn['category']))],
              size: 40,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asString(txn['title'], 'Payment'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      asString(txn['category'], 'Other'),
                      if (asString(txn['channel']).isNotEmpty)
                        asString(txn['channel']),
                      ...tags,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${credit ? '+' : '−'}${Money.format(amount)}',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontFeatures: tabular,
                    color: failed
                        ? c.muted
                        : credit
                        ? c.moneyIn
                        : c.text,
                    decoration: failed ? TextDecoration.lineThrough : null,
                  ),
                ),
                if (own != amount && !credit)
                  Text(
                    'mine ${Money.format(own)}',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(fontFeatures: tabular),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

int nameIndex(String category) {
  final index = expenseCategories.indexOf(category);
  return (index < 0 ? 8 : index) % LifeColors.chart.length;
}
