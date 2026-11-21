import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Small on-device preferences (theme, mascot, avatar colours).
abstract class PreferenceStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecurePreferenceStore implements PreferenceStore {
  SecurePreferenceStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: 'pref.$key');
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _storage.write(key: 'pref.$key', value: value);
    } catch (_) {}
  }
}

class MemoryPreferenceStore implements PreferenceStore {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

class ThemeController extends ChangeNotifier {
  ThemeController(this.store);
  final PreferenceStore store;
  ThemeMode mode = ThemeMode.system;
  bool lumiEnabled = true;

  /// Index into the 8 avatar colour pairs, or null for the name-based pick.
  int? avatarPair;

  Future<void> load() async {
    mode = switch (await store.read('theme')) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    lumiEnabled = await store.read('lumi') != 'off';
    avatarPair = int.tryParse(await store.read('avatar') ?? '');
    notifyListeners();
  }

  Future<void> setMode(ThemeMode value) async {
    mode = value;
    notifyListeners();
    await store.write('theme', value.name);
  }

  Future<void> setLumi(bool value) async {
    lumiEnabled = value;
    notifyListeners();
    await store.write('lumi', value ? 'on' : 'off');
  }

  Future<void> setAvatarPair(int? value) async {
    avatarPair = value;
    notifyListeners();
    await store.write('avatar', value?.toString() ?? '');
  }
}
