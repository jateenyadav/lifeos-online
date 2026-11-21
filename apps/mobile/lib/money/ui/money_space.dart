import 'package:flutter/material.dart';
import '../../workspaces/workspace_controller.dart';
import 'accounts_tab.dart';
import 'khata_tab.dart';
import 'money_store.dart';
import 'overview_tab.dart';
import 'transactions_tab.dart';
import 'trips_tab.dart';
import 'txn_sheets.dart';

const moneyTabs = ['Overview', 'Transactions', 'Khata', 'Accounts', 'Trips'];

class MoneySpace extends StatefulWidget {
  const MoneySpace({
    super.key,
    required this.store,
    required this.workspace,
    this.onOpenCapture,
    this.initialTab = 0,
  });
  final MoneyStore store;
  final WorkspaceController workspace;
  final VoidCallback? onOpenCapture;
  final int initialTab;
  @override
  State<MoneySpace> createState() => MoneySpaceState();
}

class MoneySpaceState extends State<MoneySpace>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(
    length: moneyTabs.length,
    vsync: this,
    initialIndex: widget.initialTab,
  )..addListener(() => setState(() {}));

  void openTab(int index) => _tabs.animateTo(index);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final fab = switch (_tabs.index) {
      0 || 1 => FloatingActionButton.extended(
        key: const Key('money_add'),
        heroTag: 'money_fab',
        onPressed: () => showTxnForm(context, store),
        icon: const Icon(Icons.add),
        label: const Text('Payment'),
      ),
      2 => FloatingActionButton.extended(
        key: const Key('khata_add'),
        heroTag: 'money_fab',
        onPressed: () => addPerson(context, store),
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Person'),
      ),
      _ => null,
    };
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: fab,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
            child: Semantics(
              header: true,
              child: Text(
                'Money',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
            ),
          ),
          TabBar(
            controller: _tabs,
            isScrollable: true,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            tabs: [
              for (final tab in moneyTabs)
                Tab(key: Key('money_tab_$tab'), text: tab),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                OverviewTab(
                  store: store,
                  onOpenTab: openTab,
                  onOpenCapture: widget.onOpenCapture,
                ),
                TransactionsTab(store: store),
                KhataTab(store: store),
                AccountsTab(store: store),
                TripsTab(store: widget.workspace),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
