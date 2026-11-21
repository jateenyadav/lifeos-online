import 'package:flutter/material.dart';
import '../auth/auth_controller.dart';
import '../money/api/money_api.dart';
import '../money/capture/capture_pipeline.dart';
import '../money/capture/capture_screen.dart';
import '../money/capture/screenshot_import.dart';
import '../money/ui/lists_screens.dart';
import '../money/ui/money_space.dart';
import '../money/ui/money_store.dart';
import '../money/ui/txn_sheets.dart';
import '../theme/theme_controller.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import '../workspaces/habits_space.dart';
import '../workspaces/notes_space.dart';
import '../workspaces/personal_ai_space.dart';
import '../workspaces/shared.dart';
import '../workspaces/today_space.dart';
import '../workspaces/workspace_controller.dart';
import 'delete_account_dialog.dart';
import 'more_space.dart';

const navLabels = ['Today', 'Money', 'Notes', 'Habits', 'More'];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.controller, this.theme});
  final AuthController controller;
  final ThemeController? theme;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  late final WorkspaceController _store;
  late final MoneyStore _money;
  late final CapturePipeline _pipeline;
  late final ThemeController _theme =
      widget.theme ?? ThemeController(MemoryPreferenceStore());
  int _selected = 0;
  int _habitsTab = 0;
  bool _aiAvailable = false;

  AuthController get auth => widget.controller;

  @override
  void initState() {
    super.initState();
    _store = WorkspaceController(auth);
    _store.load();
    final api = MoneyApi.of(auth);
    _money = MoneyStore(api);
    _pipeline = CapturePipeline(bridge: auth.capture, api: api);
    WidgetsBinding.instance.addObserver(this);
    _loadAiStatus();
    auth.capture.listen(
      onEvents: _drainCapture,
      onSharedImages: _openSharedImages,
      onReview: _openReview,
    );
    _drainCapture();
    _openSharedImages();
    auth.capture.takeReviewRequest().then((requested) {
      if (requested && mounted) _openReview();
    });
  }

  Future<void> _loadAiStatus() async {
    try {
      final status = await auth.aiRequest('/status');
      final lifeos = status['lifeos'];
      if (mounted) {
        setState(
          () => _aiAvailable = lifeos is Map && lifeos['available'] == true,
        );
      }
    } catch (_) {
      if (mounted) setState(() => _aiAvailable = false);
    }
  }

  Future<void> _drainCapture() async {
    if (!mounted || auth.account == null || auth.busy) return;
    try {
      final run = await _pipeline.drain();
      if (mounted && run.sent > 0) _money.changed();
    } catch (_) {
      // Everything stays queued on the phone; the next start retries.
    }
  }

  Future<void> _openSharedImages() async {
    final paths = await auth.capture.takeSharedImages();
    if (paths.isEmpty || !mounted) return;
    setState(() => _selected = 1);
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ScreenshotImportScreen(
          api: _money.api,
          paths: paths,
          onSaved: _money.changed,
        ),
      ),
    );
  }

  void _openReview() {
    if (!mounted) return;
    setState(() => _selected = 1);
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => ReviewScreen(store: _money)));
  }

  void _openCapture() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CaptureScreen(
        bridge: auth.capture,
        pipeline: _pipeline,
        api: _money.api,
        onChanged: _money.changed,
      ),
    ),
  );

  void _openAi() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            child: PersonalAiSpace(auth: auth),
          ),
        ),
      ),
    ),
  );

  void _refresh() {
    if (mounted && !auth.busy && !_store.loading && !_store.saving) {
      _store.load();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
      _drainCapture();
      _openSharedImages();
    }
  }

  @override
  void dispose() {
    _store.dispose();
    _money.dispose();
    WidgetsBinding.instance.removeObserver(this);
    auth.capture.listen();
    super.dispose();
  }

  void _today(TodayAction action) {
    switch (action) {
      case TodayAction.note:
        openEditor(context, _store, 'notes');
      case TodayAction.routine:
        openEditor(context, _store, 'routines');
      case TodayAction.workout:
        openEditor(context, _store, 'workouts');
      case TodayAction.payment:
        showTxnForm(context, _money);
      case TodayAction.ai:
        _openAi();
      case TodayAction.money:
        setState(() => _selected = 1);
      case TodayAction.notes:
        setState(() => _selected = 2);
      case TodayAction.habits:
        setState(() => _selected = 3);
    }
  }

  Future<void> _deleteAccount() async {
    if (auth.busy) return;
    if (_store.saving) {
      snack(context, 'Wait for your current save to finish.');
      return;
    }
    final account = auth.account;
    if (account == null) return;
    final password = await showDialog<String>(
      context: context,
      builder: (_) => DeleteAccountDialog(account: account),
    );
    if (!mounted || password == null || auth.account?.id != account.id) return;
    await auth.deleteAccount(
      password: account.provider == 'google' ? null : password,
    );
  }

  Widget? _fab() => switch (_selected) {
    2 => FloatingActionButton.extended(
      key: const Key('fab_note'),
      onPressed: () => openEditor(context, _store, 'notes'),
      icon: const Icon(Icons.add),
      label: const Text('Note'),
    ),
    3 => FloatingActionButton.extended(
      key: const Key('fab_habit'),
      onPressed: () => openEditor(
        context,
        _store,
        _habitsTab == 0 ? 'routines' : 'workouts',
      ),
      icon: const Icon(Icons.add),
      label: Text(_habitsTab == 0 ? 'Routine' : 'Workout'),
    ),
    _ => null,
  };

  Widget _page() {
    final account = auth.account!;
    if (_selected == 1) {
      return MoneySpace(
        key: const ValueKey('money'),
        store: _money,
        workspace: _store,
        onOpenCapture: _openCapture,
      );
    }
    final content = _selected == 4
        ? MoreSpace(
            account: account,
            theme: _theme,
            aiAvailable: _aiAvailable,
            busy: auth.busy,
            onOpenAi: _openAi,
            onOpenCapture: _openCapture,
            onSignOut: auth.logout,
            onDeleteAccount: _deleteAccount,
          )
        : _store.loading
        ? const Padding(
            padding: EdgeInsets.symmetric(vertical: 90),
            child: Center(child: CircularProgressIndicator()),
          )
        : !_store.loaded
        ? const SpaceEmpty(
            title: 'Your saved spaces could not load.',
            detail:
                'Use Retry loading. Your saved entries have not been changed.',
          )
        : switch (_selected) {
            0 => AnimatedBuilder(
              animation: _theme,
              builder: (context, _) => TodaySpace(
                store: _store,
                money: _money,
                name: account.name,
                onAction: _today,
                aiAvailable: _aiAvailable,
                lumiEnabled: _theme.lumiEnabled,
                avatarPair: _theme.avatarPair,
              ),
            ),
            2 => NotesSpace(store: _store),
            _ => HabitsSpace(
              store: _store,
              tab: _habitsTab,
              onTab: (tab) => setState(() => _habitsTab = tab),
            ),
          };
    return SingleChildScrollView(
      key: ValueKey('page-$_selected'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 850),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (auth.error != null || _store.error != null)
                Banner2(
                  text: auth.error ?? _store.error!,
                  tone: context.lc.danger,
                  icon: Icons.error_outline,
                  action: _store.loading ? null : 'Retry loading',
                  onAction: _store.saving ? null : _store.load,
                ),
              if (_store.notice != null)
                Banner2(
                  text: _store.notice!,
                  tone: context.lc.primary,
                  icon: Icons.check_circle_outline,
                ),
              content,
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    return Scaffold(
      floatingActionButton: _fab(),
      bottomNavigationBar: NavigationBar(
        key: const Key('main_nav'),
        selectedIndex: _selected,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: auth.busy
            ? null
            : (index) => setState(() => _selected = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.wb_sunny_outlined),
            selectedIcon: Icon(Icons.wb_sunny),
            label: 'Today',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Money',
          ),
          NavigationDestination(
            icon: Icon(Icons.edit_note_outlined),
            selectedIcon: Icon(Icons.edit_note),
            label: 'Notes',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border),
            selectedIcon: Icon(Icons.favorite),
            label: 'Habits',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu),
            selectedIcon: Icon(Icons.menu_open),
            label: 'More',
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: BoxDecoration(
          color: c.bg,
          gradient: RadialGradient(
            center: const Alignment(-1, -1),
            radius: 1.2,
            colors: [
              c.primary.withValues(alpha: .06),
              c.bg.withValues(alpha: 0),
            ],
          ),
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(1, 1),
              radius: 1.2,
              colors: [
                c.info.withValues(alpha: .05),
                c.bg.withValues(alpha: 0),
              ],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Column(
              children: [
                if (auth.busy) const LinearProgressIndicator(minHeight: 3),
                Expanded(
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_store, auth]),
                    builder: (context, _) => AnimatedSwitcher(
                      duration: context.reduceMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 200),
                      child: _page(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
