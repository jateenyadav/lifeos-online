import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/auth/google_identity.dart';
import 'package:lifeos_mobile/config.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const webId = '123456789-native-web.apps.googleusercontent.com';
  const iosId = '123456789-native-ios.apps.googleusercontent.com';

  test('debug defaults are only for simulators', () {
    expect(
      AppConfig.resolveApiBaseUrl(
        configured: '',
        platform: TargetPlatform.android,
        release: false,
      ),
      'http://10.0.2.2:4000/api',
    );
    expect(
      AppConfig.resolveApiBaseUrl(
        configured: '',
        platform: TargetPlatform.iOS,
        release: false,
      ),
      'http://127.0.0.1:4000/api',
    );
  });

  test('online URL normalization keeps login under /api', () {
    for (final value in [
      ' https://lifeos.test/ ',
      'https://lifeos.test/api///',
    ]) {
      expect(
        AppConfig.resolveApiBaseUrl(
          configured: value,
          platform: TargetPlatform.android,
          release: true,
        ),
        'https://lifeos.test/api',
      );
    }
  });

  test('release does not silently use an emulator or private address', () {
    for (final value in [
      '',
      'http://lifeos.test/api',
      'https://10.0.2.2/api',
      'https://localhost/api',
      'https://computer.local/api',
    ]) {
      expect(
        () => AppConfig.resolveApiBaseUrl(
          configured: value,
          platform: TargetPlatform.android,
          release: true,
        ),
        throwsStateError,
      );
    }
  });

  test('invalid API addresses fail with a configuration error', () {
    for (final value in [
      '/api',
      'https:///api',
      'https://user:password@lifeos.test/api',
      'https://lifeos.test/api?token=secret',
      'https://lifeos.test/api#fragment',
    ]) {
      expect(
        () => AppConfig.resolveApiBaseUrl(
          configured: value,
          platform: TargetPlatform.android,
          release: false,
        ),
        throwsStateError,
      );
    }
  });

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  });
  tearDown(() async {
    messenger.setMockMethodCallHandler(
      AppConfig.googleSettingsChannel,
      (_) async => <String, String>{},
    );
    await AppConfig.loadNativeGoogleSettings();
    messenger.setMockMethodCallHandler(AppConfig.googleSettingsChannel, null);
    debugDefaultTargetPlatformOverride = null;
  });

  test(
    'iOS reads its saved native IDs without Flutter build arguments',
    () async {
      messenger.setMockMethodCallHandler(AppConfig.googleSettingsChannel, (
        call,
      ) async {
        expect(call.method, 'getClientIds');
        return {'webClientId': webId, 'iosClientId': iosId};
      });
      await AppConfig.loadNativeGoogleSettings();
      const definedWebId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
      const definedIosId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
      expect(
        AppConfig.googleWebClientId,
        definedWebId.isEmpty ? webId : definedWebId,
      );
      expect(
        AppConfig.googleIosClientId,
        definedIosId.isEmpty ? iosId : definedIosId,
      );
      expect(NativeGoogleIdentity().configured, isTrue);
    },
  );

  test('unresolved Xcode settings are not treated as client IDs', () async {
    messenger.setMockMethodCallHandler(
      AppConfig.googleSettingsChannel,
      (_) async => {
        'webClientId': r'$(GOOGLE_WEB_CLIENT_ID)',
        'iosClientId': '',
      },
    );
    await AppConfig.loadNativeGoogleSettings();
    expect(
      AppConfig.googleWebClientId,
      const String.fromEnvironment('GOOGLE_WEB_CLIENT_ID'),
    );
    expect(
      AppConfig.googleIosClientId,
      const String.fromEnvironment('GOOGLE_IOS_CLIENT_ID'),
    );
  });

  test('missing native settings do not block email login startup', () async {
    messenger.setMockMethodCallHandler(
      AppConfig.googleSettingsChannel,
      (_) async => throw MissingPluginException(),
    );
    await expectLater(AppConfig.loadNativeGoogleSettings(), completes);
  });

  test('native setting errors do not block email login startup', () async {
    messenger.setMockMethodCallHandler(
      AppConfig.googleSettingsChannel,
      (_) async => throw PlatformException(code: 'unavailable'),
    );
    await expectLater(AppConfig.loadNativeGoogleSettings(), completes);
  });

  test(
    'Android keeps using Flutter build settings without calling iOS',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      messenger.setMockMethodCallHandler(AppConfig.googleSettingsChannel, (
        _,
      ) async {
        fail('Android must not request iOS settings.');
      });
      await AppConfig.loadNativeGoogleSettings();
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    },
  );
}
