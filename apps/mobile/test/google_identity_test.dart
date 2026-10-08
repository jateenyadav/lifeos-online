import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'package:lifeos_mobile/auth/google_identity.dart';
import 'package:lifeos_mobile/config.dart';

void main() {
  test(
    'missing build settings explain how to load the configuration file',
    () async {
      final google = NativeGoogleIdentity();
      expect(google.configured, isFalse);
      await expectLater(
        google.signIn(),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            allOf(
              contains('npm run dev:mobile'),
              contains('apps/mobile/config/development.json'),
            ),
          ),
        ),
      );
    },
    skip: AppConfig.googleWebClientId.isNotEmpty,
  );
}
