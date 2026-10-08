import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'support/auth_fixture.dart';

void main() {
  test(
    'email registration saves a session and sends confirmation to the backend',
    () async {
      final store = MemoryTokenStore();
      final controller = makeController(
        store: store,
        respond: (request) async {
          expect(request.url.path, '/api/auth/register');
          expect(request.headers['X-Client-Type'], 'mobile');
          expect(jsonDecode(request.body), {
            'name': 'New Learner',
            'email': 'learner@example.com',
            'password': 'new-password',
            'confirmPassword': 'new-password',
          });
          return jsonResponse({
            'user': testAccount,
            'token': 'registration-session',
          }, 201);
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.register(
        ' New Learner ',
        ' learner@example.com ',
        'new-password',
        'new-password',
      );
      expect(controller.account?.name, 'LifeOS Learner');
      expect(store.token, 'registration-session');
    },
  );

  test(
    'duplicate email registration shows the error without saving a session',
    () async {
      final store = MemoryTokenStore();
      final controller = makeController(
        store: store,
        respond: (_) async => jsonResponse({
          'message': 'This email already has an account.',
        }, 409),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.register(
        'Learner',
        'demo@lifeos.local',
        'new-password',
        'new-password',
      );
      expect(controller.error, 'This email already has an account.');
      expect(controller.account, isNull);
      expect(store.token, isNull);
      expect(controller.busy, isFalse);
      controller.clearError();
      expect(controller.error, isNull);
    },
  );

  test(
    'registration revokes its server session when secure storage fails',
    () async {
      final store = MemoryTokenStore()..failWrites = true;
      final paths = <String>[];
      final controller = makeController(
        store: store,
        respond: (request) async {
          paths.add(request.url.path);
          if (request.url.path.endsWith('/logout')) {
            return http.Response('', 204);
          }
          return jsonResponse({
            'user': testAccount,
            'token': 'registration-session',
          }, 201);
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.register(
        'Learner',
        'learner@example.com',
        'new-password',
        'new-password',
      );
      expect(paths, ['/api/auth/register', '/api/auth/logout']);
      expect(controller.account, isNull);
      expect(store.token, isNull);
      expect(controller.error, contains('securely save'));
    },
  );

  test(
    'password login stores the token securely and logout revokes it',
    () async {
      final store = MemoryTokenStore();
      final requests = <http.Request>[];
      final controller = makeController(
        store: store,
        respond: (request) async {
          requests.add(request);
          if (request.url.path.endsWith('/logout')) {
            return http.Response('', 204);
          }
          return jsonResponse({
            'user': testAccount,
            'token': 'shared-session-token',
          });
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.login(' demo ', 'a-password');
      expect(controller.account?.name, 'LifeOS Learner');
      expect(store.token, 'shared-session-token');
      expect(jsonDecode(requests.first.body)['identifier'], 'demo');
      expect(requests.first.headers['X-Client-Type'], 'mobile');
      await controller.logout();
      expect(
        requests.last.headers['Authorization'],
        'Bearer shared-session-token',
      );
      expect(store.token, isNull);
      expect(controller.account, isNull);
    },
  );

  test('expired sessions are cleared on app restart', () async {
    final store = MemoryTokenStore()..token = 'expired-token';
    final controller = makeController(
      store: store,
      respond: (_) async => jsonResponse({'message': 'Session expired.'}, 401),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    expect(controller.initialized, isTrue);
    expect(controller.account, isNull);
    expect(store.token, isNull);
  });

  test('password errors do not create a local session', () async {
    final store = MemoryTokenStore();
    final controller = makeController(
      store: store,
      respond: (_) async =>
          jsonResponse({'message': 'Incorrect ID/email or password.'}, 401),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await controller.login('demo', 'wrong');
    expect(controller.error, 'Incorrect ID/email or password.');
    expect(controller.busy, isFalse);
    expect(store.token, isNull);
  });

  test('Google login sends its ID token to the same API', () async {
    final controller = makeController(
      respond: (request) async {
        expect(request.url.path, '/api/auth/google');
        expect(jsonDecode(request.body)['idToken'], 'verified-google-token');
        return jsonResponse({'user': testAccount, 'token': 'google-session'});
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await controller.googleLogin();
    expect(controller.account?.email, 'demo@lifeos.local');
  });

  test('canceling Google sign-in is not a login error', () async {
    final google = FakeGoogleIdentity()..idToken = null;
    final controller = makeController(
      google: google,
      respond: (_) async {
        fail('API must not be called after cancellation');
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await controller.googleLogin();
    expect(controller.account, isNull);
    expect(controller.error, isNull);
  });

  test(
    'secure-storage failure revokes the just-created server session',
    () async {
      final store = MemoryTokenStore()..failWrites = true;
      final paths = <String>[];
      final controller = makeController(
        store: store,
        respond: (request) async {
          paths.add(request.url.path);
          if (request.url.path.endsWith('/logout')) {
            return http.Response('', 204);
          }
          return jsonResponse({'user': testAccount, 'token': 'new-session'});
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.login('demo', 'password');
      expect(paths, ['/api/auth/login', '/api/auth/logout']);
      expect(controller.account, isNull);
      expect(controller.error, contains('securely save'));
    },
  );
}
