import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Phone capture state reported by the native layer (Android only).
class CaptureStatus {
  const CaptureStatus({
    this.supported = false,
    this.smsPermission = false,
    this.smsEnabled = false,
    this.notificationSupported = false,
    this.notificationPermission = false,
    this.notificationEnabled = false,
    this.connected = false,
    this.pending = 0,
    this.lastCapturedAt,
    this.bannerEnabled = false,
    this.bannerPermission = false,
    this.error,
  });
  final bool supported;
  final bool smsPermission;
  final bool smsEnabled;
  final bool notificationSupported;
  final bool notificationPermission;
  final bool notificationEnabled;
  final bool connected;
  final int pending;
  final DateTime? lastCapturedAt;
  final bool bannerEnabled;
  final bool bannerPermission;
  final String? error;

  bool get smsWorking => smsEnabled && smsPermission;
  bool get notificationsWorking =>
      notificationEnabled && notificationPermission;
  bool get anyOn => smsEnabled || notificationEnabled;

  /// Something the user turned on is not working (permission revoked etc.).
  bool get needsFix =>
      (smsEnabled && !smsPermission) ||
      (notificationEnabled && !notificationPermission);

  factory CaptureStatus.fromMap(Map<dynamic, dynamic> values) => CaptureStatus(
    supported: values['supported'] == true,
    smsPermission: values['smsPermission'] == true,
    smsEnabled: values['smsEnabled'] == true,
    notificationSupported: values['notificationSupported'] == true,
    notificationPermission: values['notificationPermission'] == true,
    notificationEnabled: values['notificationEnabled'] == true,
    connected: values['connected'] == true,
    pending: (values['pending'] as num?)?.toInt() ?? 0,
    lastCapturedAt:
        (values['lastCapturedAt'] as num?) == null ||
            (values['lastCapturedAt'] as num) <= 0
        ? null
        : DateTime.fromMillisecondsSinceEpoch(
            (values['lastCapturedAt'] as num).toInt(),
          ),
    bannerEnabled: values['bannerEnabled'] == true,
    bannerPermission: values['bannerPermission'] == true,
    error: values['error'] as String?,
  );
}

/// One raw event waiting in the on-device queue. The text stays on this
/// phone: only the parsed, structured fields are ever sent.
class CapturedEvent {
  const CapturedEvent({
    required this.id,
    required this.type,
    required this.sender,
    required this.timestamp,
    this.title = '',
    this.text = '',
  });
  final String id;

  /// 'sms' or 'notification'.
  final String type;

  /// SMS sender id, or the notifying app's package name.
  final String sender;
  final String title;
  final String text;
  final DateTime timestamp;

  factory CapturedEvent.fromMap(Map<dynamic, dynamic> map) => CapturedEvent(
    id: '${map['id']}',
    type: map['type'] as String? ?? 'sms',
    sender: (map['sender'] ?? map['package'] ?? '') as String,
    title: map['title'] as String? ?? '',
    text: (map['text'] ?? map['body'] ?? '') as String,
    timestamp: DateTime.fromMillisecondsSinceEpoch(
      (map['timestamp'] as num?)?.toInt() ?? 0,
    ),
  );
}

/// Single platform channel to the native capture layer (SMS receiver,
/// notification listener, durable queue, share-a-screenshot).
class CaptureBridge {
  static const channel = MethodChannel('lifeos/capture');
  String? _error;

  bool get platformSupported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<dynamic> _invoke(
    String method, [
    Map<String, dynamic>? arguments,
  ]) async {
    if (!platformSupported) return null;
    try {
      final result = await channel.invokeMethod<dynamic>(method, arguments);
      _error = null;
      return result;
    } on MissingPluginException {
      return null;
    } on PlatformException catch (failure) {
      _error = failure.message ?? 'Could not reach phone capture.';
      if (method != 'configure' && method != 'status') rethrow;
      return null;
    }
  }

  Future<void> configure({
    required String baseUrl,
    String? userId,
    String? token,
  }) async {
    // The token is not passed on: Flutter does all uploads itself.
    await _invoke('configure', {'userId': userId});
  }

  Future<void> clearAccount({required String baseUrl}) async {
    await configure(baseUrl: baseUrl);
    if (_error != null) {
      throw PlatformException(code: 'account_cleanup_failed', message: _error);
    }
  }

  Future<CaptureStatus> status() async {
    final values = await _invoke('status');
    if (values is Map) return CaptureStatus.fromMap(values);
    return CaptureStatus(error: _error);
  }

  /// Asks for RECEIVE_SMS + READ_SMS. True when both were granted.
  Future<bool> enableSms() async => await _invoke('enableSms') == true;
  Future<void> disableSms() async => await _invoke('disableSms');
  Future<void> enableNotifications() async =>
      await _invoke('enableNotifications');
  Future<void> disableNotifications() async =>
      await _invoke('disableNotifications');
  Future<void> openNotificationSettings() async =>
      await _invoke('openNotificationSettings');
  Future<void> openAppSettings() async => await _invoke('openAppSettings');
  Future<void> enableBanner() async => await _invoke('enableBanner');
  Future<void> disableBanner() async => await _invoke('disableBanner');

  /// Oldest-first events still waiting. They stay queued until [ack].
  Future<List<CapturedEvent>> peekEvents({int limit = 200}) async {
    final values = await _invoke('peekEvents', {'limit': limit});
    if (values is! List) return const [];
    return [
      for (final value in values)
        if (value is Map) CapturedEvent.fromMap(value),
    ];
  }

  Future<void> ack(List<String> ids) async {
    if (ids.isEmpty) return;
    await _invoke('ackEvents', {'ids': ids});
  }

  /// Past bank SMS from the inbox (already filtered natively). Kept in memory.
  Future<List<CapturedEvent>> readSmsInbox({required DateTime since}) async {
    final values = await _invoke('readSmsInbox', {
      'sinceMillis': since.millisecondsSinceEpoch,
    });
    if (values is! List) return const [];
    var index = 0;
    return [
      for (final value in values)
        if (value is Map)
          CapturedEvent.fromMap({...value, 'id': 'inbox-${index++}'}),
    ];
  }

  Future<List<String>> takeSharedImages() async {
    final values = await _invoke('takeSharedImages');
    return values is List ? values.whereType<String>().toList() : const [];
  }

  Future<bool> takeReviewRequest() async =>
      await _invoke('takeReviewRequest') == true;

  /// Native → Flutter signals. Pass nothing to stop listening.
  void listen({
    VoidCallback? onEvents,
    VoidCallback? onSharedImages,
    VoidCallback? onReview,
  }) {
    if (!platformSupported) return;
    channel.setMethodCallHandler(
      onEvents == null && onSharedImages == null && onReview == null
          ? null
          : (call) async {
              switch (call.method) {
                case 'eventsAvailable':
                  onEvents?.call();
                case 'sharedImagesAvailable':
                  onSharedImages?.call();
                case 'reviewRequested':
                  onReview?.call();
              }
            },
    );
  }
}
