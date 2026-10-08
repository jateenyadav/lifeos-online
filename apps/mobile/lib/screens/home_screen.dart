import 'package:flutter/material.dart';
import '../auth/auth_controller.dart';
import '../workspaces/workspace_controller.dart';
import '../workspaces/shared.dart';
import '../workspaces/today_space.dart';
import '../workspaces/notes_space.dart';
import '../workspaces/workouts_space.dart';
import '../workspaces/routines_space.dart';
import '../workspaces/spending_space.dart';
import '../workspaces/personal_ai_space.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.controller});
  final AuthController controller;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  late final WorkspaceController _store;
  int _selected = 0;
  @override
  void initState() {
    super.initState();
    _store = WorkspaceController(widget.controller);
    _store.load();
    WidgetsBinding.instance.addObserver(this);
    widget.controller.notifications.listen(
      onReview: () {
        if (mounted) {
          _open(4, false);
          _refreshPayments();
        }
      },
      onPaymentsChanged: _refreshPayments,
    );
    widget.controller.notifications.takeReviewRequest().then((requested) {
      if (requested && mounted) _open(4, false);
    });
  }

  void _refreshPayments() {
    if (mounted && !_store.loading && !_store.saving) _store.load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshPayments();
  }

  @override
  void dispose() {
    _store.dispose();
    WidgetsBinding.instance.removeObserver(this);
    widget.controller.notifications.listen();
    super.dispose();
  }

  void _open(int index, bool create) {
    setState(() => _selected = index);
    if (create) {
      openEditor(
        context,
        _store,
        ['today', 'notes', 'workouts', 'routines', 'expenses'][index],
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      backgroundColor: const Color(0xFFFAFBF7),
      title: const Row(
        children: [
          Icon(Icons.eco_outlined, color: Color(0xFF304F40)),
          SizedBox(width: 8),
          Flexible(
            child: Text(
              'lifeOS.',
              style: TextStyle(fontWeight: FontWeight.w700, color: ink),
            ),
          ),
        ],
      ),
      actions: [
        AnimatedBuilder(
          animation: _store,
          builder: (context, _) => IconButton(
            tooltip: 'Refresh saved spaces',
            onPressed: _store.loading || _store.saving ? null : _store.load,
            icon: const Icon(Icons.refresh, color: muted),
          ),
        ),
        IconButton(
          tooltip: widget.controller.busy ? 'Signing out…' : 'Sign out',
          onPressed: widget.controller.busy ? null : widget.controller.logout,
          icon: const Icon(Icons.logout, color: muted),
        ),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: _selected,
      labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
      onDestinationSelected: (index) => _open(index, false),
      backgroundColor: const Color(0xFFFFFEFA),
      indicatorColor: const Color(0xFFE4ECDA),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.today_outlined), label: 'Today'),
        NavigationDestination(
          icon: Icon(Icons.edit_note_outlined),
          label: 'Notes',
        ),
        NavigationDestination(
          icon: Icon(Icons.fitness_center_outlined),
          label: 'Workout',
        ),
        NavigationDestination(
          icon: Icon(Icons.favorite_border),
          label: 'Routines',
        ),
        NavigationDestination(
          icon: Icon(Icons.account_balance_wallet_outlined),
          label: 'Spend',
        ),
        NavigationDestination(
          icon: Icon(Icons.psychology_outlined),
          label: 'AI',
        ),
      ],
    ),
    body: SafeArea(
      child: AnimatedBuilder(
        animation: _store,
        builder: (context, _) => SingleChildScrollView(
          key: ValueKey(_selected),
          padding: const EdgeInsets.all(22),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 850),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if ((_store.data['payments'] ?? []).any(
                        (entry) => entry['status'] == 'pending',
                      ) &&
                      _selected != 4)
                    TextButton(
                      onPressed: () => _open(4, false),
                      child: const Text(
                        'A new payment is ready. Check payment details.',
                      ),
                    ),
                  if (widget.controller.error != null || _store.error != null)
                    Container(
                      padding: const EdgeInsets.all(14),
                      margin: const EdgeInsets.only(bottom: 18),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF0E9),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              widget.controller.error ?? _store.error!,
                              style: const TextStyle(
                                color: Color(0xFF99442F),
                                height: 1.6,
                              ),
                            ),
                          ),
                          if (!_store.loading)
                            TextButton(
                              onPressed: _store.saving ? null : _store.load,
                              child: const Text('Retry loading'),
                            ),
                        ],
                      ),
                    ),
                  if (_store.notice != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 15),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _store.notice!,
                          style: const TextStyle(
                            color: Color(0xFF64834B),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  if (_store.loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 90),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (!_store.loaded)
                    const SpaceEmpty(
                      title: 'Your saved spaces could not load.',
                      detail:
                          'Use Retry loading. Your saved entries have not been changed.',
                    )
                  else
                    switch (_selected) {
                      0 => TodaySpace(
                        store: _store,
                        name: widget.controller.account!.name,
                        onOpen: _open,
                      ),
                      1 => NotesSpace(store: _store),
                      2 => WorkoutsSpace(store: _store),
                      3 => RoutinesSpace(store: _store),
                      5 => PersonalAiSpace(auth: widget.controller),
                      _ => SpendingSpace(store: _store),
                    },
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
