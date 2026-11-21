import 'package:flutter/material.dart';
import 'auth/auth_api.dart';
import 'auth/auth_controller.dart';
import 'auth/google_identity.dart';
import 'auth/token_store.dart';
import 'config.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';
import 'theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.loadNativeGoogleSettings();
  final theme = ThemeController(SecurePreferenceStore());
  await theme.load();
  final controller = AuthController(
    api: AuthApi(baseUrl: AppConfig.apiBaseUrl),
    tokenStore: SecureTokenStore(),
    google: NativeGoogleIdentity(),
  );
  controller.restoreSession();
  runApp(LifeOsApp(controller: controller, theme: theme));
}

class LifeOsApp extends StatefulWidget {
  const LifeOsApp({super.key, required this.controller, this.theme});
  final AuthController controller;
  final ThemeController? theme;
  @override
  State<LifeOsApp> createState() => _LifeOsAppState();
}

class _LifeOsAppState extends State<LifeOsApp> {
  late final ThemeController _theme =
      widget.theme ?? ThemeController(MemoryPreferenceStore());
  static final _light = buildTheme(Brightness.light);
  static final _dark = buildTheme(Brightness.dark);

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _theme,
    builder: (context, _) => MaterialApp(
      title: 'LifeOS',
      debugShowCheckedModeBanner: false,
      theme: _light,
      darkTheme: _dark,
      themeMode: _theme.mode,
      home: AnimatedBuilder(
        animation: widget.controller,
        builder: (context, _) => widget.controller.account == null
            ? LoginScreen(controller: widget.controller)
            : HomeScreen(
                key: ValueKey(widget.controller.account!.id),
                controller: widget.controller,
                theme: _theme,
              ),
      ),
    ),
  );
}
