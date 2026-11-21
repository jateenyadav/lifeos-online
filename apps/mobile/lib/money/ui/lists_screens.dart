import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import 'money_store.dart';
import 'overview_tab.dart' show asString;
import 'transactions_tab.dart' show TxnList, TxnRow;

class ReviewScreen extends StatelessWidget {
  const ReviewScreen({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('To review')),
    body: MoneyLoader<Json>(
      store: store,
      load: () => store.api.txns(review: true, limit: 200),
      builder: (context, data) => itemsOf(data).isEmpty
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                EmptyState(
                  icon: Icons.task_alt,
                  title: 'All checked.',
                  detail: 'Payments the phone was not sure about appear here.',
                ),
              ],
            )
          : TxnList(store: store, txns: itemsOf(data)),
    ),
  );
}

class ReimbursementsScreen extends StatelessWidget {
  const ReimbursementsScreen({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Getting money back')),
    body: MoneyLoader<Json>(
      store: store,
      load: store.api.reimbursements,
      builder: (context, data) {
        final rows = itemsOf(data);
        final waiting = rows.where((r) => r['waiting'] != false).toList();
        final done = rows.where((r) => r['waiting'] == false).toList();
        Widget row(Json r) {
          final txn = Map<String, dynamic>.from(r['txn'] as Map? ?? {});
          final payBack = asString(r['payBackTo']);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TxnRow(store: store, txn: txn),
              if (payBack.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
                  child: Text(
                    "Paid with $payBack's card: pay $payBack back in Khata when the money comes.",
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
            ],
          );
        }

        return ListView(
          key: const Key('reimbursements_list'),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            LCard(
              hero: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Waiting to come back',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  const SizedBox(height: 4),
                  CountUpMoney(
                    asInt(data['waitingMinor']),
                    size: 32,
                    color: LifeColors.money,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Not counted as your spending while you wait.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            if (rows.isEmpty)
              const EmptyState(
                icon: Icons.currency_exchange,
                title: 'Nothing to get back',
                detail:
                    'Open a payment and tap "Will you get this back?" when the office, a client or insurance will pay you.',
              ),
            if (waiting.isNotEmpty)
              SectionHeader('Waiting (${waiting.length})'),
            for (final r in waiting) row(r),
            if (done.isNotEmpty) SectionHeader('Got back (${done.length})'),
            for (final r in done) row(r),
          ],
        );
      },
    ),
  );
}

class SubscriptionsScreen extends StatelessWidget {
  const SubscriptionsScreen({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Subscriptions')),
    body: MoneyLoader<Json>(
      store: store,
      load: store.api.subscriptions,
      builder: (context, data) {
        final rows = itemsOf(data);
        final monthly = rows.fold<int>(
          0,
          (sum, r) => sum + asInt(r['monthlyMinor']),
        );
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            LCard(
              hero: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Every month',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  CountUpMoney(monthly, size: 32),
                  Text(
                    '${Money.format(monthly * 12)} a year',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            if (rows.isEmpty)
              const EmptyState(
                icon: Icons.autorenew,
                title: 'No repeating payments found yet.',
                detail:
                    'After three similar payments to the same place, they show up here.',
              ),
            for (final r in rows)
              LCard(
                margin: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    IconTile(
                      Icons.autorenew,
                      color: LifeColors.chart[1],
                      size: 38,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            asString(r['title']),
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(
                            '${asString(r['period'])} · next ${prettyDate(asString(r['nextDate']))} · ${asInt(r['count'])} seen',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    MoneyText(asInt(r['amountMinor'])),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

class BudgetsScreen extends StatelessWidget {
  const BudgetsScreen({super.key, required this.store});
  final MoneyStore store;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('Budgets · ${monthLabel(store.month)}')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () async {
        final category = await showModalBottomSheet<String>(
          context: context,
          builder: (context) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                ListTile(
                  title: const Text('Whole month'),
                  onTap: () => Navigator.pop(context, '*'),
                ),
                for (final c in expenseCategories)
                  ListTile(
                    leading: Icon(categoryIcon(c)),
                    title: Text(c),
                    onTap: () => Navigator.pop(context, c),
                  ),
              ],
            ),
          ),
        );
        if (category != null && context.mounted) {
          await editBudget(context, store, category);
        }
      },
      icon: const Icon(Icons.add),
      label: const Text('Budget'),
    ),
    body: MoneyLoader<Json>(
      store: store,
      load: () => store.api.budgets(store.month),
      builder: (context, data) {
        final rows = itemsOf(data);
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            if (rows.isEmpty)
              const EmptyState(
                icon: Icons.savings_outlined,
                title: 'No budgets this month.',
                detail: 'Set one for the whole month or for a category.',
              ),
            for (final r in rows)
              LCard(
                margin: const EdgeInsets.only(bottom: 8),
                onTap: () => editBudget(
                  context,
                  store,
                  asString(r['category']),
                  current: asInt(r['limitMinor']),
                ),
                child: Row(
                  children: [
                    Icon(
                      r['category'] == '*'
                          ? Icons.calendar_month
                          : categoryIcon(asString(r['category'])),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        r['category'] == '*'
                            ? 'Whole month'
                            : asString(r['category']),
                      ),
                    ),
                    MoneyText(asInt(r['limitMinor'])),
                    IconButton(
                      tooltip: 'Delete budget',
                      onPressed: () => store.run(
                        context,
                        () => store.api.deleteBudget(asString(r['id'])),
                        done: 'Budget removed.',
                      ),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

Future<void> editBudget(
  BuildContext context,
  MoneyStore store,
  String category, {
  int? current,
}) async {
  final controller = TextEditingController(
    text: current == null ? '' : paiseInput(current),
  );
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(
        category == '*'
            ? 'Budget for ${monthLabel(store.month)}'
            : '$category budget',
      ),
      content: TextField(
        key: const Key('budget_amount'),
        controller: controller,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(prefixText: '₹ ', labelText: 'Limit'),
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
  final value = parseRupees(controller.text);
  controller.dispose();
  if (ok == true && value != null && context.mounted) {
    await store.run(
      context,
      () => store.api.putBudget(store.month, category, value),
      done: 'Budget saved.',
    );
  }
}
