import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class NotificationStatus {
  const NotificationStatus({
    this.supported = false,
    this.permission = false,
    this.enabled = false,
    this.connected = false,
    this.pending = 0,
    this.saved = 0,
    this.bannerEnabled = false,
    this.bannerPermission = false,
    this.error,
  });
  final bool supported;
  final bool permission;
  final bool enabled;
  final bool connected;
  final int pending;
  final int saved;
  final bool bannerEnabled;
  final bool bannerPermission;
  final String? error;

  factory NotificationStatus.fromMap(Map<dynamic, dynamic> values) =>
      NotificationStatus(
        supported: values['supported'] == true,
        permission: values['permission'] == true,
        enabled: values['enabled'] == true,
        connected: values['connected'] == true,
        pending: values['pending'] as int? ?? 0,
        saved: values['saved'] as int? ?? 0,
        bannerEnabled: values['bannerEnabled'] == true,
        bannerPermission: values['bannerPermission'] == true,
        error: values['error'] as String?,
      );
}

class NotificationBridge {
  static const channel = MethodChannel('lifeos/notification_tracking');
  String? _error;

  Future<dynamic> _invoke(
    String method, [
    Map<String, dynamic>? arguments,
  ]) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final result = await channel.invokeMethod<dynamic>(method, arguments);
      _error = null;
      return result;
    } on MissingPluginException {
      return null;
    } on PlatformException catch (failure) {
      _error = failure.message ?? 'Could not access notification tracking.';
      if (method != 'configure' && method != 'status') rethrow;
      return null;
    }
  }

  Future<void> configure({
    required String baseUrl,
    String? userId,
    String? token,
  }) async {
    await _invoke('configure', {
      'baseUrl': baseUrl,
      'userId': userId,
      'token': token,
    });
  }

  Future<void> clearAccount({required String baseUrl}) async {
    await configure(baseUrl: baseUrl);
    if (_error != null) {
      throw PlatformException(code: 'account_cleanup_failed', message: _error);
    }
  }

  Future<NotificationStatus> status() async {
    final values = await _invoke('status');
    if (values is Map) return NotificationStatus.fromMap(values);
    return NotificationStatus(supported: _error != null, error: _error);
  }

  Future<void> enable() async => await _invoke('enable');
  Future<void> disable() async => await _invoke('disable');
  Future<void> settings() async => await _invoke('settings');
  Future<void> sync() async => await _invoke('sync');
  Future<void> enableBanner() async => await _invoke('enableBanner');
  Future<void> disableBanner() async => await _invoke('disableBanner');
  Future<bool> takeReviewRequest() async =>
      await _invoke('takeReviewRequest') == true;
  void listen({VoidCallback? onReview, VoidCallback? onPaymentsChanged}) {
    channel.setMethodCallHandler(
      onReview == null && onPaymentsChanged == null
          ? null
          : (call) async {
              if (call.method == 'reviewRequested') onReview?.call();
              if (call.method == 'paymentsChanged') onPaymentsChanged?.call();
            },
    );
  }
}
