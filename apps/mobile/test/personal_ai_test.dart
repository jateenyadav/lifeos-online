import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:lifeos_mobile/workspaces/personal_ai_space.dart';
import 'support/auth_fixture.dart';

void main() {
  Finder field(String label) => find.widgetWithText(TextFormField, label);

  testWidgets('uses free LifeOS AI without keys and saves personal knowledge', (
    tester,
  ) async {
    final calls = <http.Request>[];
    final documents = <Map<String, dynamic>>[];
    Future<http.Response> handle(http.Request request) async {
      calls.add(request);
      if (request.url.path == '/api/auth/me') {
        return jsonResponse({'user': testAccount});
      }
      if (request.url.path == '/api/ai/status') {
        return jsonResponse({
          'lifeos': {
            'available': true,
            'message': 'LifeOS AI is ready. Free, no key needed.',
          },
        });
      }
      if (request.url.path == '/api/ai/chat') {
        return jsonResponse({
          'provider': 'lifeos',
          'model': 'groq',
          'answer': 'Your saved routine is morning care. [S1]',
          'sources': [
            {'label': 'S1', 'title': 'Morning care', 'kind': 'routines'},
          ],
        });
      }
      if (request.url.path == '/api/ai/knowledge') {
        if (request.method == 'POST') {
          final entry = <String, dynamic>{
            'id': 'doc-1',
            ...jsonDecode(request.body) as Map<String, dynamic>,
          };
          documents.add(entry);
          return jsonResponse({'document': entry}, 201);
        }
        return jsonResponse({'documents': documents});
      }
      return jsonResponse({'message': 'Not found'}, 404);
    }

    final controller = makeController(
      store: MemoryTokenStore()..token = 'saved-session',
      respond: handle,
      aiRespond: handle,
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: PersonalAiSpace(auth: controller)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('LifeOS AI is ready. Free, no key needed.'),
      findsOneWidget,
    );
    expect(find.textContaining('Ollama'), findsNothing);
    expect(find.textContaining('API key'), findsNothing);
    await tester.enterText(field('Your question'), 'What routines do I have?');
    await tester.ensureVisible(find.text('Ask AI'));
    await tester.tap(find.text('Ask AI'));
    await tester.pumpAndSettle();
    expect(
      find.text('Your saved routine is morning care. [S1]'),
      findsOneWidget,
    );
    final chat = calls.firstWhere((entry) => entry.url.path == '/api/ai/chat');
    final body = jsonDecode(chat.body) as Map<String, dynamic>;
    expect(body['provider'], 'lifeos');
    expect(body['cloudConsent'], true);
    expect(body.containsKey('credentials'), false);
    expect(body['history'], isEmpty);
    expect(chat.headers['Authorization'], 'Bearer saved-session');
    await tester.ensureVisible(field('Knowledge title'));
    await tester.enterText(field('Knowledge title'), 'My gym plan');
    await tester.ensureVisible(field('Knowledge text'));
    await tester.enterText(field('Knowledge text'), 'Monday is leg day.');
    await tester.ensureVisible(find.text('Save knowledge'));
    await tester.tap(find.text('Save knowledge'));
    await tester.pumpAndSettle();
    expect(documents.single['content'], 'Monday is leg day.');
    expect(find.text('My gym plan'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('AI requests expire the same authenticated session', (
    tester,
  ) async {
    final store = MemoryTokenStore()..token = 'saved-session';
    final controller = makeController(
      store: store,
      respond: (request) async => jsonResponse({'user': testAccount}),
      aiRespond: (request) async =>
          jsonResponse({'message': 'Please sign in again.'}, 401),
    );
    addTearDown(controller.dispose);
    await controller.restoreSession();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: PersonalAiSpace(auth: controller)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(controller.account, isNull);
    expect(store.token, isNull);
    expect(find.text('Please sign in again.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
