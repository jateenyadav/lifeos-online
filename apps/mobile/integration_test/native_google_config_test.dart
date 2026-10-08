import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lifeos_mobile/auth/google_identity.dart';
import 'package:lifeos_mobile/config.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'iOS loads saved native Google IDs without build arguments',
    (tester) async {
      final settings = await AppConfig.googleSettingsChannel
          .invokeMapMethod<String, String>('getClientIds');
      final clientIdPattern = RegExp(
        r'^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$',
      );
      expect(settings?['webClientId'], matches(clientIdPattern));
      expect(settings?['iosClientId'], matches(clientIdPattern));
      await AppConfig.loadNativeGoogleSettings();
      expect(NativeGoogleIdentity().configured, isTrue);
      const definedWebId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
      const definedIosId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
      expect(
        AppConfig.googleWebClientId,
        definedWebId.isEmpty ? settings!['webClientId'] : definedWebId,
      );
      expect(
        AppConfig.googleIosClientId,
        definedIosId.isEmpty ? settings!['iosClientId'] : definedIosId,
      );
    },
    skip: !Platform.isIOS,
  );
}
