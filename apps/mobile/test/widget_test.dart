import 'dart:async';
import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lifeos_mobile/main.dart';
import 'support/auth_fixture.dart';

void main() {
  Future<void> openRegistration(WidgetTester tester) async {
    await tester.ensureVisible(find.text('New here? Create account'));
    await tester.tap(find.text('New here? Create account'));
    await tester.pumpAndSettle();
  }

  for (final action in ['password', 'registration', 'google', 'restore']) {
    testWidgets('$action shows a wake-up message while the server starts', (
      tester,
    ) async {
      final response = Completer<http.Response>();
      var requests = 0;
      final store = MemoryTokenStore();
      if (action == 'restore') store.token = 'saved-session';
      final controller = makeController(
        store: store,
        respond: (_) {
          requests += 1;
          return response.future;
        },
      );
      addTearDown(controller.dispose);
      late Future<void> pending;
      if (action == 'restore') {
        pending = controller.restoreSession();
      } else {
        await controller.restoreSession();
        pending = switch (action) {
          'password' => controller.login('demo', 'password'),
          'registration' => controller.register(
            'Learner',
            'learner@example.com',
            'new-password',
            'new-password',
          ),
          _ => controller.googleLogin(),
        };
      }
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await tester.pump(const Duration(seconds: 5));
      expect(
        find.text('Waking up the server, this can take up to a minute'),
        findsOneWidget,
      );
      await tester.pump(const Duration(seconds: 75));
      expect(controller.error, isNull);
      expect(requests, 1);
      response.complete(
        jsonResponse({'token': 'new-session', 'user': testAccount}),
      );
      await tester.pump();
      await pending;
      await tester.pumpAndSettle();
      expect(controller.account?.id, 'user-1');
      expect(controller.wakingServer, isFalse);
      expect(
        find.text('Waking up the server, this can take up to a minute'),
        findsNothing,
      );
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(requests, 1);
    });
  }

  testWidgets('wake-up message clears when the 90-second wait expires', (
    tester,
  ) async {
    final response = Completer<http.Response>();
    final controller = makeController(respond: (_) => response.future);
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    final pending = controller.login('demo', 'password');
    await tester.pump();
    await tester.pump(const Duration(seconds: 89));
    expect(controller.error, isNull);
    expect(controller.wakingServer, isTrue);
    await tester.pump(const Duration(seconds: 1));
    await pending;
    await tester.pump();
    expect(controller.wakingServer, isFalse);
    expect(controller.busy, isFalse);
    expect(
      find.text('The server took too long to respond. Please try again.'),
      findsOneWidget,
    );
    response.complete(jsonResponse({}));
    await tester.pump();
  });

  testWidgets('email registration sends all fields and signs in', (
    tester,
  ) async {
    final controller = makeController(
      respond: (request) async {
        expect(request.url.path, '/api/auth/register');
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
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await openRegistration(tester);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'New Learner');
    await tester.enterText(fields.at(1), 'learner@example.com');
    await tester.enterText(fields.at(2), 'new-password');
    await tester.enterText(fields.at(3), 'new-password');
    await tester.ensureVisible(find.text('Create account'));
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets(
    'registration validates name, email, short password and confirmation locally',
    (tester) async {
      final controller = makeController(
        respond: (_) async {
          fail('Invalid registration must not call the backend.');
        },
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await openRegistration(tester);
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), ' ');
      await tester.enterText(fields.at(1), 'invalid');
      await tester.enterText(fields.at(2), 'short');
      await tester.enterText(fields.at(3), 'different');
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(find.text('Enter your name.'), findsOneWidget);
      expect(find.text('Enter a valid email address.'), findsOneWidget);
      expect(
        find.text('Password must be at least 8 characters.'),
        findsOneWidget,
      );
      expect(find.text('Passwords do not match.'), findsOneWidget);
    },
  );

  testWidgets(
    'switching from registration clears private fields and returns to login',
    (tester) async {
      final controller = makeController(respond: (_) async => jsonResponse({}));
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      await openRegistration(tester);
      await tester.enterText(find.byType(TextFormField).at(2), 'new-password');
      await tester.enterText(find.byType(TextFormField).at(3), 'new-password');
      await tester.ensureVisible(find.text('Already have an account? Sign in'));
      await tester.tap(find.text('Already have an account? Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back.'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).at(1))
            .controller
            ?.text,
        '',
      );
    },
  );

  testWidgets('login screen renders and validates empty fields', (
    tester,
  ) async {
    final controller = makeController(
      respond: (_) async => jsonResponse({'message': 'Please sign in.'}, 401),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    expect(find.text('Welcome back.'), findsOneWidget);
    expect(find.text('Your ID or email'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    await tester.ensureVisible(find.text('Sign in'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your ID or email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
  });

  testWidgets('login succeeds through the shared backend contract', (
    tester,
  ) async {
    final controller = makeController(
      respond: (_) async =>
          jsonResponse({'user': testAccount, 'token': 'test-session'}),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.enterText(find.byType(TextFormField).at(0), 'demo');
    await tester.enterText(find.byType(TextFormField).at(1), 'a-password');
    await tester.ensureVisible(find.text('Sign in'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Hello, LifeOS.'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('layout works on a narrow phone with enlarged text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final controller = makeController(respond: (_) async => jsonResponse({}));
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    expect(tester.takeException(), isNull);
  });

  for (final size in [
    const Size(280, 640),
    const Size(320, 740),
    const Size(390, 844),
    const Size(844, 390),
    const Size(1024, 768),
  ]) {
    testWidgets('login and registration fit $size with large text', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final controller = makeController(respond: (_) async => jsonResponse({}));
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      expect(tester.takeException(), isNull);
      final identifierRect = tester.getRect(find.byType(TextFormField).first);
      expect(identifierRect.left, greaterThanOrEqualTo(20));
      expect(identifierRect.right, lessThanOrEqualTo(size.width - 20));
      expect(identifierRect.width, lessThanOrEqualTo(420));
      await openRegistration(tester);
      await tester.ensureVisible(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(TextFormField), findsNWidgets(4));
    });
  }

  testWidgets('registration stays usable above the phone keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    final controller = makeController(respond: (_) async => jsonResponse({}));
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await openRegistration(tester);
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    await tester.pumpAndSettle();
    final confirmation = find.byType(TextFormField).last;
    await tester.ensureVisible(confirmation);
    await tester.enterText(confirmation, 'new-password');
    await tester.pumpAndSettle();
    final fieldRect = tester.getRect(confirmation);
    expect(fieldRect.bottom, lessThanOrEqualTo(360));
    await tester.ensureVisible(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Create account').hitTestable(), findsOneWidget);
    expect(find.text('lifeOS.').hitTestable(), findsOneWidget);
  });

  testWidgets('mode changes and validation reveal the top of the form', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = makeController(
      respond: (_) async {
        fail('Empty fields must not call the backend.');
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await openRegistration(tester);
    expect(find.text('A fresh start.').hitTestable(), findsOneWidget);
    await tester.ensureVisible(find.text('Create account'));
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name.').hitTestable(), findsOneWidget);
    await tester.ensureVisible(find.text('Already have an account? Sign in'));
    await tester.tap(find.text('Already have an account? Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back.').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Google button signs in when configured', (tester) async {
    final google = FakeGoogleIdentity();
    final controller = makeController(
      google: google,
      respond: (request) async {
        expect(request.url.path, '/api/auth/google');
        return jsonResponse({'user': testAccount, 'token': 'google-session'});
      },
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(LifeOsApp(controller: controller));
    await tester.ensureVisible(find.text('Continue with Google'));
    await tester.tap(find.text('Continue with Google'));
    await tester.pumpAndSettle();
    expect(google.signInCalls, 1);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets(
    'Google button explains missing setup instead of being disabled',
    (tester) async {
      const setupMessage = 'Stop the app, then run npm run dev:mobile.';
      final google = FakeGoogleIdentity()
        ..configured = false
        ..signInError = setupMessage;
      final controller = makeController(
        google: google,
        respond: (_) async =>
            throw StateError('Google setup must stop the request.'),
      );
      addTearDown(controller.dispose);
      await controller.restoreSession();
      await tester.pumpWidget(LifeOsApp(controller: controller));
      final button = find.widgetWithText(
        OutlinedButton,
        'Continue with Google',
      );
      expect(tester.widget<OutlinedButton>(button).onPressed, isNotNull);
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(google.signInCalls, 1);
      expect(find.text(setupMessage), findsOneWidget);
      expect(controller.account, isNull);
      expect(controller.busy, isFalse);
    },
  );

  testWidgets('Google button waits until session restoration finishes', (
    tester,
  ) async {
    final google = FakeGoogleIdentity();
    final controller = makeController(
      google: google,
      respond: (_) async => jsonResponse({}),
    );
    addTearDown(controller.dispose);
    await tester.pumpWidget(LifeOsApp(controller: controller));
    final button = find.widgetWithText(OutlinedButton, 'Continue with Google');
    expect(tester.widget<OutlinedButton>(button).onPressed, isNull);
    await controller.restoreSession();
    await tester.pump();
    expect(tester.widget<OutlinedButton>(button).onPressed, isNotNull);
    expect(google.signInCalls, 0);
  });
}
