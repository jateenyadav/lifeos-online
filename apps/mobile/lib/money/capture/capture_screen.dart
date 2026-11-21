import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../ui/money_store.dart' show prettyDate, dayKey;
import '../ui/photos.dart';
import 'capture_bridge.dart';
import 'capture_pipeline.dart';
import 'screenshot_import.dart';

const honestLimits = [
  'If you "Force stop" LifeOS in phone settings, Android blocks SMS and notifications until you open the app again.',
  'UPI Lite payments often send no SMS, so they may be missed. Add them by hand or from a screenshot.',
  'iPhone does not let apps read SMS. On iPhone use manual entry and screenshots.',
];

String ago(DateTime? at, DateTime now) {
  if (at == null) return 'Nothing captured yet';
  final minutes = now.difference(at).inMinutes;
  if (minutes < 1) return 'Last captured just now';
  if (minutes < 60) return 'Last captured $minutes min ago';
  if (minutes < 60 * 24) return 'Last captured ${minutes ~/ 60} h ago';
  return 'Last captured ${prettyDate(dayKey(at))}';
}

/// "Turn on automatic tracking": explicit opt-in, live status with Fix it,
/// past SMS import, screenshot import and honest limits.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({
    super.key,
    required this.bridge,
    required this.pipeline,
    required this.api,
    this.onChanged,
  });
  final CaptureBridge bridge;
  final CapturePipeline pipeline;
  final MoneyApi api;
  final VoidCallback? onChanged;
  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen>
    with WidgetsBindingObserver {
  CaptureStatus _status = const CaptureStatus();
  bool _loading = true;
  bool _busy = false;
  int _days = 90;
  String? _result;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final status = await widget.bridge.status();
    if (mounted) {
      setState(() {
        _status = status;
        _loading = false;
      });
    }
  }

  Future<void> _do(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (failure) {
      if (mounted) snack(context, 'That did not work. Please try again.');
    } finally {
      await _refresh();
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _turnOnSms() => _do(() async {
    final granted = await widget.bridge.enableSms();
    if (!mounted) return;
    if (granted) {
      final run = await widget.pipeline.drain();
      widget.onChanged?.call();
      if (mounted) snack(context, run.error ?? 'Automatic tracking is on.');
    } else {
      snack(
        context,
        'SMS permission was not given. Use Fix it to allow it in phone settings.',
      );
    }
  });

  Future<void> _fix() => _do(() async {
    if (_status.smsEnabled && !_status.smsPermission) {
      final granted = await widget.bridge.enableSms();
      if (!granted) await widget.bridge.openAppSettings();
    } else if (_status.notificationEnabled && !_status.notificationPermission) {
      await widget.bridge.openNotificationSettings();
    } else {
      await widget.pipeline.drain();
    }
  });

  Future<void> _importPast() => _do(() async {
    final run = await widget.pipeline.importInbox(_days);
    widget.onChanged?.call();
    if (!mounted) return;
    setState(() {
      _result = run.error != null
          ? '${run.error} Nothing was lost; try again when online.'
          : 'Checked ${run.seen} bank messages from the last $_days days: ${run.created} added, ${run.merged + run.duplicates} already there, ${run.ignored} were not payments.';
    });
  });

  Future<void> _screenshot() async {
    final paths = await photoSource.pickPaths();
    if (paths.isEmpty || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ScreenshotImportScreen(
          api: widget.api,
          paths: paths,
          onSaved: widget.onChanged,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = context.lc;
    final android = widget.bridge.platformSupported;
    final s = _status;
    return Scaffold(
      appBar: AppBar(title: const Text('Automatic tracking')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              key: const Key('capture_screen'),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              children: [
                if (!android) ...[
                  LCard(
                    hero: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('iPhone: no SMS access', style: t.titleLarge),
                        const SizedBox(height: 6),
                        Text(
                          'Apple does not let any app read your SMS or other apps’ notifications. Add payments by hand, or share a payment screenshot into LifeOS.',
                          style: t.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ] else if (!s.anyOn) ...[
                  LCard(
                    key: const Key('capture_optin'),
                    hero: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        IconTile(
                          Icons.sms_outlined,
                          color: LifeColors.money,
                          size: 48,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Turn on automatic tracking',
                          style: t.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'LifeOS can read your bank SMS on this phone and add each payment for you.',
                          style: t.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        for (final line in const [
                          'What is read: SMS from banks and card companies, and (if you allow it) payment app notifications.',
                          'What is kept: amount, in or out, date and time, merchant or person, account last 4 digits, bank reference, balance if shown.',
                          'Raw SMS text never leaves your phone. Only those fields are sent to your LifeOS account.',
                          'OTPs, offers and personal messages are dropped on the phone and never stored.',
                          'You can turn this off any time here.',
                        ])
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  Icons.check_circle_outline,
                                  size: 18,
                                  color: c.primary,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(line, style: t.bodyMedium),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            key: const Key('capture_turn_on'),
                            onPressed: _busy ? null : _turnOnSms,
                            child: const Text('Allow SMS and turn on'),
                          ),
                        ),
                        const SizedBox(height: 4),
                        SizedBox(
                          width: double.infinity,
                          child: TextButton(
                            onPressed: _busy
                                ? null
                                : () => _do(widget.bridge.enableNotifications),
                            child: const Text(
                              'Use payment app notifications instead',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  _StatusCard(status: s, busy: _busy, onFix: _fix),
                  LCard(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      children: [
                        SwitchListTile(
                          key: const Key('capture_sms_switch'),
                          value: s.smsEnabled,
                          onChanged: _busy
                              ? null
                              : (on) => on
                                    ? _turnOnSms()
                                    : _do(widget.bridge.disableSms),
                          title: const Text('Bank SMS'),
                          subtitle: Text(
                            s.smsEnabled && !s.smsPermission
                                ? 'Permission is off · tap Fix it'
                                : 'Read on this phone only',
                          ),
                        ),
                        SwitchListTile(
                          key: const Key('capture_notif_switch'),
                          value: s.notificationEnabled,
                          onChanged: _busy || !s.notificationSupported
                              ? null
                              : (on) => _do(
                                  on
                                      ? widget.bridge.enableNotifications
                                      : widget.bridge.disableNotifications,
                                ),
                          title: const Text('Payment app notifications'),
                          subtitle: Text(
                            !s.notificationSupported
                                ? 'Not available on this phone'
                                : s.notificationEnabled &&
                                      !s.notificationPermission
                                ? 'Notification access is off · tap Fix it'
                                : 'GPay, PhonePe, Paytm, bank apps',
                          ),
                        ),
                        SwitchListTile(
                          value: s.bannerEnabled,
                          onChanged: _busy
                              ? null
                              : (on) => _do(
                                  on
                                      ? widget.bridge.enableBanner
                                      : widget.bridge.disableBanner,
                                ),
                          title: const Text('Floating "new payment" banner'),
                          subtitle: Text(
                            s.bannerEnabled && !s.bannerPermission
                                ? 'Allow "Display over other apps" to see it'
                                : 'Shows briefly when a payment is caught',
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (s.smsWorking) ...[
                    const SectionHeader('Import past bank SMS'),
                    LCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SegmentedButton<int>(
                            key: const Key('capture_days'),
                            segments: const [
                              ButtonSegment(value: 30, label: Text('30 days')),
                              ButtonSegment(value: 90, label: Text('90 days')),
                              ButtonSegment(
                                value: 180,
                                label: Text('180 days'),
                              ),
                            ],
                            selected: {_days},
                            onSelectionChanged: (v) =>
                                setState(() => _days = v.first),
                          ),
                          const SizedBox(height: 10),
                          FilledButton.tonal(
                            key: const Key('capture_import_past'),
                            onPressed: _busy ? null : _importPast,
                            child: Text(
                              _busy
                                  ? 'Reading…'
                                  : 'Import the last $_days days',
                            ),
                          ),
                          if (_result != null) ...[
                            const SizedBox(height: 10),
                            Text(
                              _result!,
                              key: const Key('capture_import_result'),
                              style: t.bodyMedium,
                            ),
                          ],
                          const SizedBox(height: 6),
                          Text(
                            'Messages already added are skipped, so running it twice is safe.',
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
                const SectionHeader('Payment screenshots'),
                LCard(
                  onTap: _screenshot,
                  child: Row(
                    children: [
                      IconTile(Icons.image_search, color: c.info, size: 40),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Pick a screenshot, or use Share → LifeOS from any app. The text is read on this phone.',
                        ),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
                const SectionHeader('Good to know'),
                for (final line in honestLimits)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, size: 18, color: c.muted),
                        const SizedBox(width: 8),
                        Expanded(child: Text(line, style: t.bodySmall)),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.status,
    required this.busy,
    required this.onFix,
  });
  final CaptureStatus status;
  final bool busy;
  final VoidCallback onFix;
  @override
  Widget build(BuildContext context) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final ok = !status.needsFix && status.error == null;
    return LCard(
      key: const Key('capture_status'),
      hero: ok,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                ok ? Icons.verified_outlined : Icons.error_outline,
                color: ok ? c.primary : c.warn,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  ok ? 'Tracking is working' : 'Tracking needs a fix',
                  style: t.titleMedium,
                ),
              ),
              if (!ok)
                FilledButton(
                  key: const Key('capture_fix'),
                  onPressed: busy ? null : onFix,
                  child: const Text('Fix it'),
                ),
            ],
          ),
          const SizedBox(height: 10),
          _line(
            context,
            'SMS permission',
            status.smsEnabled
                ? (status.smsPermission ? 'Allowed' : 'Not allowed')
                : 'Off',
          ),
          _line(
            context,
            'Notification access',
            status.notificationEnabled
                ? (status.notificationPermission ? 'Allowed' : 'Not allowed')
                : 'Off',
          ),
          _line(context, 'Waiting on this phone', '${status.pending}'),
          const SizedBox(height: 6),
          Text(
            ago(status.lastCapturedAt, DateTime.now()),
            key: const Key('capture_last'),
            style: t.bodySmall,
          ),
          if (status.error != null) ...[
            const SizedBox(height: 6),
            Text(status.error!, style: t.bodySmall?.copyWith(color: c.warn)),
          ],
        ],
      ),
    );
  }

  Widget _line(BuildContext context, String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        Text(value, style: Theme.of(context).textTheme.titleSmall),
      ],
    ),
  );
}
