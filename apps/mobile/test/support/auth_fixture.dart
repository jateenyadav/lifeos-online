import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'package:lifeos_mobile/auth/auth_controller.dart';
import 'package:lifeos_mobile/auth/google_identity.dart';
import 'package:lifeos_mobile/auth/token_store.dart';
import 'package:lifeos_mobile/money/capture/capture_bridge.dart';

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

/// In-memory stand-in for the native capture layer (queue, inbox, status).
class FakeCaptureBridge extends CaptureBridge {
  final List<CapturedEvent> queue = [];
  final List<CapturedEvent> inbox = [];
  final List<String> acked = [];
  final List<String> sharedImages = [];
  CaptureStatus current = const CaptureStatus(supported: true);
  bool smsGrant = true;
  int enableSmsCalls = 0;
  String? configuredUser;

  @override
  bool get platformSupported => true;
  @override
  Future<bool> takeReviewRequest() async => false;
  @override
  void listen({
    void Function()? onEvents,
    void Function()? onSharedImages,
    void Function()? onReview,
  }) {}
  @override
  Future<void> configure({
    required String baseUrl,
    String? userId,
    String? token,
  }) async => configuredUser = userId;
  @override
  Future<CaptureStatus> status() async => current;
  @override
  Future<bool> enableSms() async {
    enableSmsCalls++;
    if (smsGrant) {
      current = CaptureStatus(
        supported: true,
        smsEnabled: true,
        smsPermission: true,
        pending: queue.length,
      );
    }
    return smsGrant;
  }

  @override
  Future<List<CapturedEvent>> peekEvents({int limit = 200}) async =>
      queue.take(limit).toList();
  @override
  Future<void> ack(List<String> ids) async {
    acked.addAll(ids);
    queue.removeWhere((event) => ids.contains(event.id));
  }

  @override
  Future<List<CapturedEvent>> readSmsInbox({required DateTime since}) async =>
      inbox.where((event) => event.timestamp.isAfter(since)).toList();
  @override
  Future<List<String>> takeSharedImages() async {
    final out = List<String>.from(sharedImages);
    sharedImages.clear();
    return out;
  }
}

http.Response jsonResponse(Map<String, dynamic> body, [int status = 200]) =>
    http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

/// Default money API: an empty month and empty lists.
Future<http.Response> emptyMoney(http.Request request) async => jsonResponse({
  'items': [],
  'contacts': [],
  'left': [],
  'month': '2026-11',
  'spentMinor': 0,
  'incomeMinor': 0,
  'netMinor': 0,
  'owedToMeMinor': 0,
  'iOweMinor': 0,
});

/// Default AI: LifeOS AI not set up, so AI stays hidden.
Future<http.Response> aiNotSetUp(http.Request request) async =>
    request.url.path == '/api/ai/status'
    ? jsonResponse({
        'lifeos': {'available': false, 'message': 'Not set up'},
      })
    : jsonResponse({'message': 'Not found'}, 404);

AuthController makeController({
  required Future<http.Response> Function(http.Request) respond,
  Future<http.Response> Function(http.Request)? workspaceRespond,
  Future<http.Response> Function(http.Request)? moneyRespond,
  Future<http.Response> Function(http.Request)? aiRespond,
  MemoryTokenStore? store,
  FakeGoogleIdentity? google,
  CaptureBridge? capture,
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
      if (request.url.path.startsWith('/api/money')) {
        return (moneyRespond ?? emptyMoney)(request);
      }
      if (request.url.path.startsWith('/api/ai')) {
        return (aiRespond ?? aiNotSetUp)(request);
      }
      return respond(request);
    }),
  ),
  tokenStore: store ?? MemoryTokenStore(),
  google: google ?? FakeGoogleIdentity(),
  capture: capture ?? FakeCaptureBridge(),
);
