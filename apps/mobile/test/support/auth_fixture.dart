import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'package:lifeos_mobile/auth/auth_controller.dart';
import 'package:lifeos_mobile/auth/google_identity.dart';
import 'package:lifeos_mobile/auth/token_store.dart';
import 'package:lifeos_mobile/spending/notification_bridge.dart';

const testAccount = {
  'id': 'user-1',
  'name': 'LifeOS Learner',
  'email': 'demo@lifeos.local',
};

class MemoryTokenStore implements TokenStore {
  String? token;
  bool failWrites = false;
  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String value) async {
    if (failWrites) throw StateError('Unavailable');
    token = value;
  }

  @override
  Future<void> delete() async {
    token = null;
  }
}

class FakeGoogleIdentity implements GoogleIdentity {
  @override
  bool configured = true;
  String? idToken = 'verified-google-token';
  int signInCalls = 0;
  String? signInError;
  @override
  Future<String?> signIn() async {
    signInCalls++;
    if (signInError != null) throw ApiException(signInError!);
    return idToken;
  }

  @override
  Future<void> signOut() async {}
}

class FakeNotificationBridge extends NotificationBridge {
  @override
  Future<bool> takeReviewRequest() async => false;
  @override
  void listen({
    void Function()? onReview,
    void Function()? onPaymentsChanged,
  }) {}
  @override
  Future<void> configure({
    required String baseUrl,
    String? userId,
    String? token,
  }) async {}

  @override
  Future<NotificationStatus> status() async => const NotificationStatus();
}

http.Response jsonResponse(Map<String, dynamic> body, [int status = 200]) =>
    http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

AuthController makeController({
  required Future<http.Response> Function(http.Request) respond,
  Future<http.Response> Function(http.Request)? workspaceRespond,
  MemoryTokenStore? store,
  FakeGoogleIdentity? google,
  NotificationBridge? notifications,
}) => AuthController(
  api: AuthApi(
    baseUrl: 'http://localhost:4000/api',
    client: MockClient((request) {
      if (request.url.path.startsWith('/api/workspaces')) {
        return workspaceRespond != null
            ? workspaceRespond(request)
            : Future.value(
                jsonResponse({
                  'notes': [],
                  'workouts': [],
                  'routines': [],
                  'expenses': [],
                  'budgets': [],
                }),
              );
      }
      return respond(request);
    }),
  ),
  tokenStore: store ?? MemoryTokenStore(),
  google: google ?? FakeGoogleIdentity(),
  notifications: notifications ?? FakeNotificationBridge(),
);
