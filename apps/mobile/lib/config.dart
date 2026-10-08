import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AppConfig {
  static const _googleWebClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
  );
  static const _googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );
  static const googleSettingsChannel = MethodChannel('lifeos/google_settings');
  static Map<String, String> _nativeGoogleSettings = {};

  static String get googleWebClientId => _googleWebClientId.isNotEmpty
      ? _googleWebClientId
      : _nativeGoogleSettings['webClientId'] ?? '';
  static String get googleIosClientId => _googleIosClientId.isNotEmpty
      ? _googleIosClientId
      : _nativeGoogleSettings['iosClientId'] ?? '';

  static Future<void> loadNativeGoogleSettings() async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return;
    _nativeGoogleSettings = {};
    try {
      final settings = await googleSettingsChannel
          .invokeMapMethod<String, String>('getClientIds');
      final clientIdPattern = RegExp(
        r'^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$',
      );
      _nativeGoogleSettings = {
        for (final entry in (settings ?? <String, String>{}).entries)
          if (clientIdPattern.hasMatch(entry.value)) entry.key: entry.value,
      };
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    }
  }

  static String get apiBaseUrl {
    const configured = String.fromEnvironment('API_BASE_URL');
    return resolveApiBaseUrl(
      configured: configured,
      platform: defaultTargetPlatform,
      release: kReleaseMode,
    );
  }

  static String resolveApiBaseUrl({
    required String configured,
    required TargetPlatform platform,
    required bool release,
  }) {
    if (release && configured.trim().isEmpty) {
      throw StateError(
        'No online backend is configured. Run npm run setup:api -- YOUR_HTTPS_BACKEND_URL, then npm run build:android.',
      );
    }
    final value = configured.trim().isNotEmpty
        ? configured.trim()
        : platform == TargetPlatform.android
        ? 'http://10.0.2.2:4000/api'
        : 'http://127.0.0.1:4000/api';
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.host.isEmpty ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw StateError('API_BASE_URL must be a complete HTTP or HTTPS URL.');
    }
    if (release && uri.scheme != 'https') {
      throw StateError('Release builds require an HTTPS API_BASE_URL.');
    }
    if (release &&
        (!uri.host.contains('.') ||
            RegExp(r'^[\d.]+$').hasMatch(uri.host) ||
            uri.host.contains(':') ||
            uri.host.endsWith('.localhost') ||
            uri.host.endsWith('.local'))) {
      throw StateError('Release builds require a public HTTPS backend domain.');
    }
    final path = uri.path.replaceFirst(RegExp(r'/+$'), '');
    return uri.replace(path: path.isEmpty ? '/api' : path).toString();
  }
}
