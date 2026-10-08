import 'package:flutter/material.dart';
import 'auth/auth_api.dart';
import 'auth/auth_controller.dart';
import 'auth/google_identity.dart';
import 'auth/token_store.dart';
import 'config.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.loadNativeGoogleSettings();
  final controller = AuthController(
    api: AuthApi(baseUrl: AppConfig.apiBaseUrl),
    tokenStore: SecureTokenStore(),
    google: NativeGoogleIdentity(),
  );
  controller.restoreSession();
  runApp(LifeOsApp(controller: controller));
}

class LifeOsApp extends StatelessWidget {
  const LifeOsApp({super.key, required this.controller});
  final AuthController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LifeOS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFFAFBF7),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF304F40),
          primary: const Color(0xFF304F40),
          surface: const Color(0xFFFAFBF7),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFFDFEFA),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          hintStyle: const TextStyle(color: Color(0xFF697562), fontSize: 16),
          errorMaxLines: 3,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDFE5D8)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDFE5D8)),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(double.infinity, 52),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) => controller.account == null
            ? LoginScreen(controller: controller)
            : HomeScreen(
                key: ValueKey(controller.account!.id),
                controller: controller,
              ),
      ),
    );
  }
}
