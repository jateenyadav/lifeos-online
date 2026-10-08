import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_fixture.dart';

class WorkspaceFixture {
  final Map<String, List<Map<String, dynamic>>> data = {
    for (final name in ['notes', 'workouts', 'routines', 'expenses', 'budgets'])
      name: [],
  };
  final List<http.Request> requests = [];
  int _counter = 0;
  bool failSave = false;
  Future<http.Response> respond(http.Request request) async {
    requests.add(request);
    final parts = request.url.path
        .replaceFirst('/api/workspaces', '')
        .split('/')
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return jsonResponse(data);
    if (failSave) {
      return jsonResponse({'message': 'Cannot save right now.'}, 503);
    }
    final collection = parts[0];
    final id = parts.length > 1 ? parts[1] : null;
    final values = request.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(request.body) as Map<String, dynamic>;
    if (request.method == 'DELETE') {
      data[collection]!.removeWhere((entry) => entry['id'] == id);
      return jsonResponse({}, 204);
    }
    final previous = data[collection]!.where(
      (entry) =>
          entry['id'] == id ||
          collection == 'budgets' && entry['month'] == values['month'],
    );
    final old = previous.isEmpty ? null : previous.first;
    if (parts.length > 2) {
      final dates = List<String>.from(old!['completedDates'] as List);
      if (values['completed'] == true) {
        if (!dates.contains(values['date'])) dates.add(values['date']);
      } else {
        dates.remove(values['date']);
      }
      old['completedDates'] = dates;
      return jsonResponse({'entry': old});
    }
    final defaults = collection == 'notes'
        ? {
            'body': '',
            'tag': 'Personal',
            'kind': 'note',
            'pinned': false,
            'completed': false,
            'archived': false,
            'dueDate': null,
          }
        : collection == 'routines'
        ? {'completedDates': <String>[]}
        : <String, dynamic>{};
    final entry = {
      ...defaults,
      ...?old,
      ...values,
      'id': old?['id'] ?? (++_counter).toRadixString(16).padLeft(24, '0'),
      'updatedAt': DateTime.now().toIso8601String(),
    };
    data[collection]!.removeWhere((row) => row['id'] == entry['id']);
    data[collection]!.insert(0, entry);
    return jsonResponse({'entry': entry});
  }
}
