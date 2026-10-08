import 'dart:async';
import 'package:flutter/foundation.dart';
import 'auth_api.dart';
import 'google_identity.dart';
import 'token_store.dart';
import '../spending/notification_bridge.dart';

class AuthController extends ChangeNotifier {
  AuthController({
    required this.api,
    required this.tokenStore,
    required this.google,
    NotificationBridge? notifications,
  }) : notifications = notifications ?? NotificationBridge();
  final AuthApi api;
  final TokenStore tokenStore;
  final GoogleIdentity google;
  final NotificationBridge notifications;
  Account? account;
  String? error;
  bool busy = false;
  bool initialized = false;
  bool wakingServer = false;
  bool _disposed = false;
  String? _token;
  Timer? _wakeTimer;

  void _publish() {
    if (!_disposed) notifyListeners();
  }

  Future<Result> _withServerWait<Result>(
    Future<Result> Function() request,
  ) async {
    _wakeTimer = Timer(const Duration(seconds: 5), () {
      wakingServer = true;
      _publish();
    });
    try {
      return await request();
    } finally {
      _wakeTimer?.cancel();
      wakingServer = false;
      _publish();
    }
  }

  Future<void> restoreSession() async {
    try {
      _token = await tokenStore.read();
      if (_token != null) {
        account = await _withServerWait(() => api.me(_token!));
      }
    } on ApiException catch (failure) {
      if (failure.status == 401) {
        _token = null;
        try {
          await tokenStore.delete();
        } catch (_) {
          error =
              'Your session expired, but secure storage could not be cleared. Please sign in again.';
        }
      } else {
        error = failure.message;
      }
    } catch (_) {
      error = 'Unable to restore your secure session. Please sign in again.';
    } finally {
      if (account != null || _token == null) {
        await notifications.configure(
          baseUrl: api.baseUrl,
          userId: account?.id,
          token: account == null ? null : _token,
        );
      }
      initialized = true;
      _publish();
    }
  }

  Future<void> _save(AuthSession session) async {
    try {
      await tokenStore.write(session.token);
    } catch (_) {
      try {
        await api.logout(session.token);
      } catch (_) {}
      throw const ApiException(
        'This device could not securely save your session. Please try again.',
      );
    }
    _token = session.token;
    account = session.account;
    await notifications.configure(
      baseUrl: api.baseUrl,
      userId: account!.id,
      token: _token,
    );
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (busy || !initialized) return;
    busy = true;
    error = null;
    _publish();
    try {
      await action();
    } on ApiException catch (failure) {
      error = failure.message;
    } catch (_) {
      error = 'Something went wrong. Please try again.';
    } finally {
      busy = false;
      _publish();
    }
  }

  Future<void> login(String identifier, String password) => _perform(() async {
    await _save(
      await _withServerWait(
        () => api.login(identifier, password, token: _token),
      ),
    );
  });
  Future<void> register(
    String name,
    String email,
    String password,
    String confirmPassword,
  ) => _perform(() async {
    await _save(
      await _withServerWait(
        () =>
            api.register(name, email, password, confirmPassword, token: _token),
      ),
    );
  });
  void clearError() {
    error = null;
    _publish();
  }

  Future<void> googleLogin() => _perform(() async {
    final idToken = await google.signIn();
    if (idToken != null) {
      await _save(
        await _withServerWait(() => api.googleLogin(idToken, token: _token)),
      );
    }
  });
  Future<void> logout() => _perform(() async {
    await notifications.configure(baseUrl: api.baseUrl);
    if (_token != null) await api.logout(_token!);
    await tokenStore.delete();
    _token = null;
    account = null;
    try {
      await google.signOut();
    } catch (_) {
      error =
          'Signed out of LifeOS. Google could not clear its account picker.';
    }
  });

  Future<Map<String, dynamic>> workspaceRequest(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => _authenticatedRequest(
    (token) => api.workspace(path, token, method: method, body: body),
  );

  Future<Map<String, dynamic>> aiRequest(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => _authenticatedRequest(
    (token) => api.ai(path, token, method: method, body: body),
  );

  Future<Map<String, dynamic>> _authenticatedRequest(
    Future<Map<String, dynamic>> Function(String token) send,
  ) async {
    if (_token == null) {
      throw const ApiException('Please sign in again.', status: 401);
    }
    final token = _token!;
    try {
      return await send(token);
    } on ApiException catch (failure) {
      if (failure.status == 401 && token == _token) {
        _token = null;
        account = null;
        await notifications.configure(baseUrl: api.baseUrl);
        error = failure.message;
        try {
          await tokenStore.delete();
        } catch (_) {}
        _publish();
      }
      rethrow;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _wakeTimer?.cancel();
    api.close();
    super.dispose();
  }
}
