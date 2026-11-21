import 'package:flutter/material.dart';
import 'package:lifeos_mobile/money/api/money_api.dart';
import 'package:lifeos_mobile/money/ui/money_store.dart';
import 'package:lifeos_mobile/theme/app_theme.dart';

class Call {
  Call(this.method, this.path, this.body);
  final String method;
  final String path;
  final Json? body;
}

/// Fake /api/money: route by "METHOD /path" prefix.
class FakeMoney {
  FakeMoney(this.routes);
  final Map<String, Json Function(Call call)> routes;
  final calls = <Call>[];

  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    final call = Call(method, path, body);
    calls.add(call);
    final key = '$method ${path.split('?').first}';
    for (final entry in routes.entries) {
      if (key == entry.key ||
          (entry.key.endsWith('*') &&
              key.startsWith(entry.key.substring(0, entry.key.length - 1)))) {
        return entry.value(call);
      }
    }
    return {'items': []};
  }

  MoneyStore store() =>
      MoneyStore(MoneyApi(request), now: () => DateTime(2026, 11, 21));
  Iterable<Call> where(String method, String path) =>
      calls.where((c) => c.method == method && c.path.split('?').first == path);
}

Widget host(Widget child, {ThemeMode mode = ThemeMode.light}) => MaterialApp(
  theme: buildTheme(Brightness.light),
  darkTheme: buildTheme(Brightness.dark),
  themeMode: mode,
  home: child,
);
