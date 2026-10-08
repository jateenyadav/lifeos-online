import 'dart:io';
import 'package:google_sign_in/google_sign_in.dart';
import '../config.dart';
import 'auth_api.dart';

abstract interface class GoogleIdentity {
  bool get configured;
  Future<String?> signIn();
  Future<void> signOut();
}

class NativeGoogleIdentity implements GoogleIdentity {
  Future<void>? _initialization;
  @override
  bool get configured =>
      AppConfig.googleWebClientId.isNotEmpty &&
      (!Platform.isIOS || AppConfig.googleIosClientId.isNotEmpty);

  @override
  Future<String?> signIn() async {
    if (AppConfig.googleWebClientId.isEmpty) {
      throw const ApiException(
        'This build is missing the Google Web client ID. '
        'Stop the app, then run npm run dev:mobile from the LifeOS folder. '
        'This loads apps/mobile/config/development.json. '
        'If its GOOGLE_WEB_CLIENT_ID is empty, run npm run setup:google first.',
      );
    }
    if (Platform.isIOS && AppConfig.googleIosClientId.isEmpty) {
      throw const ApiException(
        'iOS needs its own Google client ID. '
        'Create an iOS client with bundle ID com.lifeos.lifeosMobile. '
        'Run npm run setup:google from the LifeOS folder and enter both '
        'your Web and iOS client IDs. Then fully restart the app. '
        'See docs/GOOGLE_AUTH.md, step 6.',
      );
    }
    try {
      _initialization ??= GoogleSignIn.instance.initialize(
        clientId: Platform.isIOS ? AppConfig.googleIosClientId : null,
        serverClientId: AppConfig.googleWebClientId,
      );
      await _initialization;
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) {
        throw const ApiException(
          'Google did not return an identity token. Check your OAuth setup.',
        );
      }
      return idToken;
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) return null;
      throw const ApiException(
        'Google sign-in failed. Check your OAuth IDs, Android SHA-1 and iOS URL scheme.',
      );
    }
  }

  @override
  Future<void> signOut() async {
    if (_initialization != null) await GoogleSignIn.instance.signOut();
  }
}
