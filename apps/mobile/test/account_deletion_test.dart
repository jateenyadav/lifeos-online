import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lifeos_mobile/main.dart';
import 'package:lifeos_mobile/screens/delete_account_dialog.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'support/auth_fixture.dart';

class TrackingGoogleIdentity extends FakeGoogleIdentity {
  int signOutCalls = 0;

  @override
  Future<void> signOut() async {
    signOutCalls++;
  }
}

class TrackingNotificationBridge extends FakeNotificationBridge {
  final configurations = <Map<String, String?>>[];
  bool failClear = false;

  @override
  Future<void> configure({
    required String baseUrl,
    String? userId,
    String? token,
  }) async {
    configurations.add({'userId': userId, 'token': token});
    if (userId == null && failClear) throw StateError('Cleanup unavailable');
  }
}

class FailingDeleteTokenStore extends MemoryTokenStore {
  @override
  Future<void> delete() async {
    throw StateError('Secure storage unavailable');
  }
}

Finder deletionField(String label) => find.byWidgetPredicate(
  (widget) => widget is TextField && widget.decoration?.labelText == label,
);

Future<void> openDeletion(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Account options'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Delete account'));
  await tester.pumpAndSettle();
}

void main() {
  test(
    'deletion clears the session, notification queue and Google picker after server success',
    () async {
      final store = MemoryTokenStore()..token = 'saved-session';
      final google = TrackingGoogleIdentity();
      final notifications = TrackingNotificationBridge();
      var deletions = 0;
      final controller = makeController(
        store: store,
        google: google,
        notifications: notifications,
        respond: (request) async {
          if (request.method == 'DELETE') {
            deletions++;
            expect(request.url.path, '/api/auth/account');
            expect(request.headers['Authorization'], 'Bearer saved-session');
            expect(request.headers['X-Client-Type'], 'mobile');
            expect(jsonDecode(request.body), {
              'confirmation': 'DELETE',
              'password': 'account-password',
            });
            expect(store.token, 'saved-session');
            expect(notifications.configurations.last['userId'], 'user-1');
            return jsonResponse({}, 204);
          }
          return jsonResponse({'user': testAccount});
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.deleteAccount(password: 'account-password');
      expect(deletions, 1);
      expect(controller.account, isNull);
      expect(controller.error, isNull);
      expect(store.token, isNull);
      expect(notifications.configurations.last, {
        'userId': null,
        'token': null,
      });
      expect(google.signOutCalls, 1);
      expect(google.signInCalls, 0);
      await expectLater(
        controller.workspaceRequest(''),
        throwsA(isA<ApiException>()),
      );
    },
  );

  test(
    'server failures leave the local account and notifications intact',
    () async {
      final store = MemoryTokenStore()..token = 'saved-session';
      final google = TrackingGoogleIdentity();
      final notifications = TrackingNotificationBridge();
      final controller = makeController(
        store: store,
        google: google,
        notifications: notifications,
        respond: (request) async => request.method == 'DELETE'
            ? jsonResponse({
                'message': 'Incorrect password. Your account was not deleted.',
              }, 401)
            : jsonResponse({'user': testAccount}),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.deleteAccount(password: 'wrong-password');
      expect(controller.account?.id, 'user-1');
      expect(store.token, 'saved-session');
      expect(notifications.configurations.length, 1);
      expect(google.signOutCalls, 0);
      expect(
        controller.error,
        'Incorrect password. Your account was not deleted.',
      );
      expect(controller.busy, isFalse);
    },
  );

  test(
    'Google deletion requests a fresh Google identity instead of a password',
    () async {
      final store = MemoryTokenStore()..token = 'saved-session';
      final google = TrackingGoogleIdentity();
      final controller = makeController(
        store: store,
        google: google,
        respond: (request) async {
          if (request.method == 'DELETE') {
            expect(jsonDecode(request.body), {
              'confirmation': 'DELETE',
              'idToken': 'verified-google-token',
            });
            return jsonResponse({}, 204);
          }
          return jsonResponse({
            'user': {...testAccount, 'provider': 'google'},
          });
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.deleteAccount();
      expect(google.signInCalls, 1);
      expect(google.signOutCalls, 1);
      expect(store.token, isNull);
      expect(controller.account, isNull);
    },
  );

  test(
    'cancelling Google confirmation does not send a deletion request',
    () async {
      final store = MemoryTokenStore()..token = 'saved-session';
      final google = TrackingGoogleIdentity()..idToken = null;
      final requests = <http.Request>[];
      final controller = makeController(
        store: store,
        google: google,
        respond: (request) async {
          requests.add(request);
          return jsonResponse({
            'user': {...testAccount, 'provider': 'google'},
          });
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.deleteAccount();
      expect(requests.where((request) => request.method == 'DELETE'), isEmpty);
      expect(controller.account?.id, 'user-1');
      expect(store.token, 'saved-session');
      expect(controller.error, isNull);
      expect(google.signOutCalls, 0);
    },
  );

  test(
    'local cleanup failures still sign out after the account was deleted',
    () async {
      final store = FailingDeleteTokenStore()..token = 'saved-session';
      final google = TrackingGoogleIdentity();
      final notifications = TrackingNotificationBridge()..failClear = true;
      final controller = makeController(
        store: store,
        google: google,
        notifications: notifications,
        respond: (request) async => request.method == 'DELETE'
            ? jsonResponse({}, 204)
            : jsonResponse({'user': testAccount}),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await controller.deleteAccount(password: 'account-password');
      expect(controller.account, isNull);
      expect(google.signOutCalls, 1);
      expect(controller.error, contains('Your LifeOS account was deleted'));
      expect(controller.busy, isFalse);
    },
  );

  test('duplicate deletion taps send only one server request', () async {
    final response = Completer<http.Response>();
    var deletions = 0;
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (request) async {
        if (request.method == 'DELETE') {
          deletions++;
          return response.future;
        }
        return jsonResponse({'user': testAccount});
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    final firstDeletion = controller.deleteAccount(
      password: 'account-password',
    );
    await controller.deleteAccount(password: 'account-password');
    expect(controller.busy, isTrue);
    await expectLater(
      controller.workspaceRequest(''),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          'Please wait for your account request to finish.',
        ),
      ),
    );
    response.complete(jsonResponse({}, 204));
    await firstDeletion;
    expect(deletions, 1);
    expect(controller.account, isNull);
  });

  testWidgets(
    'the menu requires a password and typed confirmation before deleting',
    (tester) async {
      final store = MemoryTokenStore()..token = 'saved-session';
      var deletions = 0;
      final controller = makeController(
        store: store,
        respond: (request) async {
          if (request.method == 'DELETE') {
            deletions++;
            return jsonResponse({}, 204);
          }
          return jsonResponse({'user': testAccount});
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await tester.pumpAndSettle();
      await openDeletion(tester);
      final button = find.widgetWithText(FilledButton, 'Delete account');
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
      await tester.enterText(deletionField('Type DELETE to confirm'), 'DELETE');
      await tester.pump();
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
      await tester.enterText(
        deletionField('Your password'),
        'account-password',
      );
      await tester.pump();
      expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
      expect(deletions, 0);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(deletions, 1);
      expect(store.token, isNull);
      expect(find.text('Welcome back.'), findsOneWidget);
      expect(find.byType(DeleteAccountDialog), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Cancel closes the deletion dialog without deleting', (
    tester,
  ) async {
    final requests = <http.Request>[];
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (request) async {
        requests.add(request);
        return jsonResponse({'user': testAccount});
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openDeletion(tester);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(requests.where((request) => request.method == 'DELETE'), isEmpty);
    expect(controller.account?.id, 'user-1');
    expect(find.byType(DeleteAccountDialog), findsNothing);
  });

  testWidgets('Google accounts confirm with Google without a password field', (
    tester,
  ) async {
    final google = TrackingGoogleIdentity();
    final controller = makeController(
      google: google,
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (request) async => request.method == 'DELETE'
          ? jsonResponse({}, 204)
          : jsonResponse({
              'user': {...testAccount, 'provider': 'google'},
            }),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openDeletion(tester);
    expect(deletionField('Your password'), findsNothing);
    expect(
      find.textContaining('Your Google account will not be deleted'),
      findsOneWidget,
    );
    await tester.enterText(deletionField('Type DELETE to confirm'), 'DELETE');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm with Google'));
    await tester.pumpAndSettle();
    expect(google.signInCalls, 1);
    expect(controller.account, isNull);
    expect(find.text('Welcome back.'), findsOneWidget);
  });

  testWidgets('the deletion dialog fits a narrow screen with enlarged text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(280, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: (_) async => jsonResponse({'user': testAccount}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.pumpAndSettle();
    await openDeletion(tester);
    expect(find.byType(DeleteAccountDialog), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
