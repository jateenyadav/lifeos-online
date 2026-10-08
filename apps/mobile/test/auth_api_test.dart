import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';

void main() {
  test('emulator connection failures explain the real-phone fix', () async {
    final api = AuthApi(
      baseUrl: 'http://10.0.2.2:4000/api',
      client: MockClient((_) async => throw const SocketException('Offline')),
    );
    addTearDown(api.close);
    await expectLater(
      api.login('demo', 'password'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          allOf(contains('Android emulator'), contains('online HTTPS backend')),
        ),
      ),
    );
  });

  test('online connection failures show the actual server address', () async {
    final api = AuthApi(
      baseUrl: 'https://lifeos.test/api',
      client: MockClient((_) async => throw http.ClientException('Offline')),
    );
    addTearDown(api.close);
    await expectLater(
      api.login('demo', 'password'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          contains('Cannot reach https://lifeos.test/api'),
        ),
      ),
    );
  });

  testWidgets(
    'a sleeping backend has more than 15 seconds to wake without retrying login',
    (tester) async {
      final response = Completer<http.Response>();
      var requests = 0;
      final api = AuthApi(
        baseUrl: 'https://lifeos.test/api',
        client: MockClient((_) {
          requests += 1;
          return response.future;
        }),
      );
      addTearDown(api.close);
      var completed = false;
      final login = api.login('demo', 'password').then((session) {
        completed = true;
        return session;
      });
      await tester.pump();
      await tester.pump(const Duration(seconds: 20));
      expect(requests, 1);
      expect(completed, isFalse);
      expect(AuthApi.loginTimeout, const Duration(seconds: 90));
      response.complete(
        http.Response(
          '{"token":"session","user":{"id":"user-1","name":"Learner","email":"learner@example.com"}}',
          200,
        ),
      );
      await tester.pump();
      expect((await login).token, 'session');
      expect(requests, 1);
    },
  );
}
