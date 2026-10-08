import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../workspaces/shared.dart';
import '../workspaces/workspace_controller.dart';
import 'notification_bridge.dart';

class NotificationTrackingCard extends StatefulWidget {
  const NotificationTrackingCard({super.key, required this.store});
  final WorkspaceController store;

  @override
  State<NotificationTrackingCard> createState() =>
      _NotificationTrackingCardState();
}

class _NotificationTrackingCardState extends State<NotificationTrackingCard>
    with WidgetsBindingObserver {
  NotificationStatus _status = const NotificationStatus();
  bool _loading = true;
  bool _busy = false;
  String? _error;
  NotificationBridge get _bridge => widget.store.auth.notifications;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  Future<void> _refresh() async {
    final status = await _bridge.status();
    if (mounted) {
      setState(() {
        _status = status;
        _loading = false;
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _action(() async {
        await _bridge.sync();
        if (!widget.store.loading && !widget.store.saving) {
          await widget.store.load();
        }
      });
    }
  }

  Future<void> _enable() async {
    final consent = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: const Text('Allow new notification tracking?'),
        content: const Text(
          'Android will let LifeOS check notifications from all apps. '
          'Only new notifications after you turn this on are checked. '
          'Clear English INR payment confirmations become review cards. Nothing counts as spending until you save it.\n\n'
          'Unrelated messages and full notification text are not saved or sent. '
          'Amounts, merchant names, visible recipient UPI IDs or numbers, and the source app are saved to your LifeOS account.\n\n'
          'This continues while LifeOS is in the background. '
          'You can stop it here or remove notification access in Android Settings. '
          'Signing out deletes unsaved expenses on this phone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Allow and open settings'),
          ),
        ],
      ),
    );
    if (consent != true || !mounted) return;
    await _action(_bridge.enable);
  }

  Future<void> _action(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _refresh();
    } on PlatformException catch (failure) {
      if (mounted) {
        setState(
          () => _error =
              failure.message ?? 'Could not update tracking. Try again.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not update tracking. Try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SpaceCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'New notification tracking',
          style: TextStyle(color: ink, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (_loading)
          const Text('Checking this phone…')
        else if (!_status.supported)
          const Text(
            'Automatic tracking is not available on this device. iPhones cannot read other apps’ notifications. Use Add expense instead.',
          )
        else ...[
          Text(
            !_status.enabled
                ? 'Off. Nothing is being tracked.'
                : !_status.permission
                ? 'Waiting for Android notification access.'
                : !_status.connected
                ? 'Waiting for Android to connect the reader. Open access settings if this continues.'
                : 'On. Checking new notifications from all apps.',
          ),
          const SizedBox(height: 8),
          const Text(
            'English INR payment confirmations only. Review amount, purpose and person before saving. Refunds, requests, failed payments and unclear messages are skipped. Other languages and currencies need manual entry.',
          ),
          const SizedBox(height: 8),
          Text(
            '${_status.pending} waiting to save · ${_status.saved} processed on this phone',
          ),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: _busy
                    ? null
                    : _status.enabled
                    ? () => _action(_bridge.disable)
                    : _enable,
                child: Text(
                  _status.enabled ? 'Stop tracking' : 'Enable tracking',
                ),
              ),
              if (_status.enabled && !_status.permission)
                TextButton(
                  onPressed: _busy ? null : () => _action(_bridge.settings),
                  child: const Text('Open access settings'),
                ),
              if (_status.enabled && _status.permission && !_status.connected)
                TextButton(
                  onPressed: _busy ? null : () => _action(_bridge.settings),
                  child: const Text('Open access settings'),
                ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _action(() async {
                        await _bridge.sync();
                        await widget.store.load();
                      }),
                child: const Text('Check saved expenses'),
              ),
            ],
          ),
          Text(
            _status.bannerEnabled
                ? _status.bannerPermission
                      ? 'Floating review banner is on. It opens the full review in LifeOS.'
                      : 'Allow display over other apps in Android Settings.'
                : 'Floating review banner is off.',
          ),
          TextButton(
            onPressed: _busy
                ? null
                : _status.bannerEnabled && _status.bannerPermission
                ? () => _action(_bridge.disableBanner)
                : _enableBanner,
            child: Text(
              _status.bannerEnabled && _status.bannerPermission
                  ? 'Stop floating banner'
                  : 'Enable floating review banner',
            ),
          ),
        ],
        if (_error != null || _status.error != null)
          Text(
            _error ?? _status.error!,
            style: const TextStyle(color: Color(0xFF99442F)),
          ),
      ],
    ),
  );

  Future<void> _enableBanner() async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: const Text('Allow a floating payment banner?'),
        content: const Text(
          'LifeOS can show a payment amount over another app after the review is saved to your account. It never appears on the locked screen. Tap Review in LifeOS to check details. This needs Android display-over-other-apps permission. You can turn it off here at any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Allow and open settings'),
          ),
        ],
      ),
    );
    if (approved == true && mounted) await _action(_bridge.enableBanner);
  }
}
