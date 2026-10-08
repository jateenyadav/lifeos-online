import 'package:flutter/foundation.dart';
import '../auth/auth_api.dart';
import '../auth/auth_controller.dart';

class WorkspaceController extends ChangeNotifier {
  WorkspaceController(this.auth);
  final AuthController auth;
  Map<String, List<Map<String, dynamic>>> data = {
    for (final collection in [
      'notes',
      'workouts',
      'routines',
      'expenses',
      'budgets',
      'payments',
      'payees',
      'trips',
      'tripItems',
    ])
      collection: [],
  };
  bool loading = true;
  bool loaded = false;
  bool saving = false;
  bool _disposed = false;
  String? error;
  String? notice;

  void _publish() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    loading = true;
    error = null;
    _publish();
    try {
      final result = await auth.workspaceRequest('');
      if (_disposed) return;
      data = {
        for (final collection in data.keys)
          collection: (result[collection] as List? ?? [])
              .map((entry) => Map<String, dynamic>.from(entry as Map))
              .toList(),
      };
      loaded = true;
    } on ApiException catch (failure) {
      error = failure.message;
    } catch (_) {
      error = 'Your saved spaces could not load. Please try again.';
    } finally {
      loading = false;
      _publish();
    }
  }

  Future<bool> _mutate(
    String collection,
    String path,
    String method,
    Map<String, dynamic>? body,
    String message,
  ) async {
    if (saving || loading || !loaded || _disposed) return false;
    saving = true;
    error = null;
    notice = null;
    _publish();
    try {
      final result = await auth.workspaceRequest(
        '/$collection$path',
        method: method,
        body: body,
      );
      if (_disposed) return false;
      if (method == 'DELETE') {
        data[collection]!.removeWhere(
          (entry) => entry['id'] == path.substring(1),
        );
      } else {
        final entry = Map<String, dynamic>.from(result['entry'] as Map);
        data[collection]!.removeWhere(
          (previous) => previous['id'] == entry['id'],
        );
        data[collection]!.insert(0, entry);
      }
      notice = message;
      return true;
    } on ApiException catch (failure) {
      error = failure.message;
      return false;
    } catch (_) {
      error = 'Could not save this change. Please try again.';
      return false;
    } finally {
      saving = false;
      _publish();
    }
  }

  Future<bool> save(
    String collection,
    Map<String, dynamic> values, {
    String? id,
  }) => _mutate(
    collection,
    id == null ? '' : '/$id',
    id == null ? 'POST' : 'PATCH',
    values,
    'Saved. Your space is up to date.',
  );
  Future<bool> moneyCommand(String path, Map<String, dynamic> values) async {
    if (saving || loading || !loaded || _disposed) return false;
    saving = true;
    error = null;
    notice = null;
    _publish();
    try {
      await auth.workspaceRequest('/money/$path', method: 'POST', body: values);
      final snapshot = await auth.workspaceRequest('');
      if (_disposed) return false;
      data = {
        for (final collection in data.keys)
          collection: (snapshot[collection] as List? ?? [])
              .map((entry) => Map<String, dynamic>.from(entry as Map))
              .toList(),
      };
      notice = 'Saved. Your money view is up to date.';
      return true;
    } on ApiException catch (failure) {
      error = failure.message;
      return false;
    } catch (_) {
      error = 'Could not save. Your draft is still open. Please try again.';
      return false;
    } finally {
      saving = false;
      _publish();
    }
  }

  Future<bool> remove(String collection, String id) =>
      _mutate(collection, '/$id', 'DELETE', null, 'Entry deleted.');
  Future<bool> check(String id, String date, bool completed) => _mutate(
    'routines',
    '/$id/check',
    'POST',
    {'date': date, 'completed': completed},
    completed
        ? 'One small win. Routine complete.'
        : 'Routine marked as not done.',
  );
  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
