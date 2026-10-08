import 'dart:convert';
import 'package:flutter/material.dart';
import '../auth/auth_controller.dart';

const _ink = Color(0xFF263E34);
const _muted = Color(0xFF697562);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});
  final AuthController controller;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _scrollController = ScrollController();
  bool _showPassword = false;
  bool _registering = false;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _name.dispose();
    _confirmPassword.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final invalidFields = _form.currentState!.validateGranularly();
    if (invalidFields.isNotEmpty) {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || !invalidFields.first.mounted) return;
      await Scrollable.ensureVisible(
        invalidFields.first.context,
        duration: const Duration(milliseconds: 250),
        alignment: 0.1,
      );
      return;
    }
    if (_registering) {
      await widget.controller.register(
        _name.text,
        _identifier.text,
        _password.text,
        _confirmPassword.text,
      );
    } else {
      await widget.controller.login(_identifier.text, _password.text);
    }
    if (!mounted) return;
    if (widget.controller.account != null) {
      _password.clear();
      _confirmPassword.clear();
      setState(() => _registering = false);
    }
    await _scrollToStart();
  }

  Future<void> _scrollToStart() async {
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted || !_scrollController.hasClients) return;
    await _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  void _switchMode() {
    FocusScope.of(context).unfocus();
    widget.controller.clearError();
    _form.currentState?.reset();
    _password.clear();
    _confirmPassword.clear();
    setState(() {
      _registering = !_registering;
      _showPassword = false;
    });
    _scrollToStart();
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        color: Color(0xFF53654C),
        fontWeight: FontWeight.w500,
      ),
    ),
  );

  Widget _loginForm(AuthController auth) {
    final disabled = auth.busy || !auth.initialized;
    return Form(
      key: _form,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_registering) ...[
              _label('Your name'),
              TextFormField(
                controller: _name,
                enabled: !disabled,
                autofillHints: const [AutofillHints.name],
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                maxLength: 100,
                decoration: const InputDecoration(
                  hintText: 'Enter your name',
                  counterText: '',
                ),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter your name.'
                    : null,
              ),
              const SizedBox(height: 24),
            ],
            _label(_registering ? 'Email address' : 'Your ID or email'),
            TextFormField(
              controller: _identifier,
              enabled: !disabled,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: [
                _registering ? AutofillHints.email : AutofillHints.username,
              ],
              autocorrect: false,
              maxLength: 254,
              decoration: InputDecoration(
                hintText: _registering
                    ? 'Enter your email'
                    : 'Enter your ID or email',
                counterText: '',
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return _registering
                      ? 'Enter your email.'
                      : 'Enter your ID or email.';
                }
                if (_registering &&
                    !RegExp(
                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                    ).hasMatch(value.trim())) {
                  return 'Enter a valid email address.';
                }
                return null;
              },
            ),
            const SizedBox(height: 24),
            _label('Password'),
            TextFormField(
              controller: _password,
              enabled: !disabled,
              obscureText: !_showPassword,
              autofillHints: [
                _registering
                    ? AutofillHints.newPassword
                    : AutofillHints.password,
              ],
              autocorrect: false,
              enableSuggestions: false,
              textInputAction: _registering
                  ? TextInputAction.next
                  : TextInputAction.done,
              onFieldSubmitted: (_) {
                if (!_registering) _submit();
              },
              decoration: InputDecoration(
                hintText: 'Enter your password',
                suffixIcon: IconButton(
                  tooltip: _showPassword ? 'Hide password' : 'Show password',
                  onPressed: disabled
                      ? null
                      : () => setState(() => _showPassword = !_showPassword),
                  icon: Icon(
                    _showPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    size: 20,
                    color: _muted,
                  ),
                ),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Enter your password.';
                }
                if (utf8.encode(value).length > 72) {
                  return 'Password must be at most 72 bytes.';
                }
                if (_registering && value.length < 8) {
                  return 'Password must be at least 8 characters.';
                }
                return null;
              },
            ),
            if (_registering) ...[
              const SizedBox(height: 24),
              _label('Confirm password'),
              TextFormField(
                controller: _confirmPassword,
                enabled: !disabled,
                obscureText: !_showPassword,
                autofillHints: const [AutofillHints.newPassword],
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                decoration: const InputDecoration(
                  hintText: 'Enter your password again',
                ),
                validator: (value) =>
                    value != _password.text ? 'Passwords do not match.' : null,
              ),
              const SizedBox(height: 10),
              const Text(
                'Use at least 8 characters. Maximum 72 bytes.',
                style: TextStyle(fontSize: 12, color: _muted),
              ),
            ],
            const SizedBox(height: 14),
            const Row(
              children: [
                Icon(Icons.lock_outline_rounded, size: 12, color: _muted),
                SizedBox(width: 5),
                Expanded(
                  child: Text(
                    'Your session stays private on this device.',
                    style: TextStyle(fontSize: 12, color: _muted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 26),
            FilledButton(
              onPressed: disabled ? null : _submit,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: Text(
                      auth.busy
                          ? (_registering
                                ? 'Creating your account…'
                                : 'Signing you in…')
                          : (_registering ? 'Create account' : 'Sign in'),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 14),
                  if (auth.busy)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFFF9FBF5),
                      ),
                    )
                  else
                    const Icon(Icons.arrow_forward_rounded, size: 18),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: disabled ? null : _switchMode,
              child: Text(
                _registering
                    ? 'Already have an account? Sign in'
                    : 'New here? Create account',
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
            const Row(
              children: [
                Expanded(child: Divider(color: Color(0xFFE5E9DF))),
                Flexible(
                  flex: 4,
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'or keep it simple',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: _muted),
                    ),
                  ),
                ),
                Expanded(child: Divider(color: Color(0xFFE5E9DF))),
              ],
            ),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: disabled
                  ? null
                  : () async {
                      FocusScope.of(context).unfocus();
                      await auth.googleLogin();
                      if (!mounted) return;
                      if (auth.account != null) {
                        _password.clear();
                        _confirmPassword.clear();
                        setState(() => _registering = false);
                      }
                      if (auth.account != null || auth.error != null) {
                        await _scrollToStart();
                      }
                    },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(double.infinity, 50),
                side: const BorderSide(color: Color(0xFFDFE4D7)),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'G',
                    style: TextStyle(
                      color: Color(0xFF4285F4),
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(width: 12),
                  Flexible(
                    child: Text(
                      'Continue with Google',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
            if (!auth.google.configured) ...[
              const SizedBox(height: 10),
              const Text(
                'Google setup is incomplete.\nTap Continue with Google for the next step.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: _muted, height: 1.7),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'Google creates your account on your first sign-in.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: _muted, height: 1.7),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    child: LayoutBuilder(
      builder: (context, constraints) => Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFF304F40),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.eco_outlined,
              color: Color(0xFFF0F3E9),
              size: 24,
            ),
          ),
          const SizedBox(width: 10),
          const Flexible(
            child: Text(
              'lifeOS.',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w600,
                color: _ink,
                letterSpacing: -1.3,
              ),
            ),
          ),
          if (constraints.maxWidth >= 340 &&
              MediaQuery.textScalerOf(context).scale(10) <= 14) ...[
            const Spacer(),
            const SizedBox(width: 16),
            const Flexible(
              child: Text(
                'YOUR PERSONAL SPACE',
                textAlign: TextAlign.end,
                style: TextStyle(fontSize: 10, letterSpacing: 1, color: _muted),
              ),
            ),
          ],
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _header(),
            const Divider(height: 1, color: Color(0xFFE5E9DF)),
            Expanded(
              child: AnimatedBuilder(
                animation: widget.controller,
                builder: (context, _) {
                  final auth = widget.controller;
                  return LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      controller: _scrollController,
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: EdgeInsets.symmetric(
                        horizontal: constraints.maxWidth < 400 ? 20 : 32,
                        vertical: 28,
                      ),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF1F4EB),
                                    border: Border.all(
                                      color: const Color(0xFFE5E9DC),
                                    ),
                                    borderRadius: BorderRadius.circular(15),
                                  ),
                                  child: const Icon(
                                    Icons.eco_outlined,
                                    color: Color(0xFF7B8B61),
                                    size: 27,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                _registering
                                    ? 'MAKE A LITTLE SPACE FOR YOURSELF'
                                    : 'LET’S PICK UP WHERE YOU LEFT OFF',
                                style: const TextStyle(
                                  fontSize: 10,
                                  letterSpacing: 1.3,
                                  color: _muted,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                _registering
                                    ? 'A fresh start.'
                                    : 'Welcome back.',
                                style: TextStyle(
                                  fontSize: constraints.maxWidth < 400
                                      ? 32
                                      : 36,
                                  fontWeight: FontWeight.w400,
                                  color: _ink,
                                  letterSpacing: -1.5,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                _registering
                                    ? 'Create one account for web, Android, and iOS.'
                                    : 'Your space is waiting. Come on in.',
                                style: const TextStyle(
                                  fontSize: 14,
                                  height: 1.6,
                                  color: _muted,
                                ),
                              ),
                              const SizedBox(height: 24),
                              if (auth.error != null) ...[
                                Semantics(
                                  liveRegion: true,
                                  child: Container(
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFFF0E9),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      auth.error!,
                                      style: const TextStyle(
                                        color: Color(0xFF99442F),
                                        fontSize: 14,
                                        height: 1.6,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 20),
                              ],
                              if (auth.wakingServer) ...[
                                Semantics(
                                  liveRegion: true,
                                  child: const Text(
                                    'Waking up the server, this can take up to a minute',
                                    style: TextStyle(
                                      color: _muted,
                                      fontSize: 14,
                                      height: 1.6,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                              ] else if (!auth.initialized) ...[
                                const Text(
                                  'Checking your session…',
                                  style: TextStyle(color: _muted, fontSize: 14),
                                ),
                                const SizedBox(height: 16),
                              ],
                              _loginForm(auth),
                              const SizedBox(height: 26),
                              const Divider(color: Color(0xFFE7EADE)),
                              const SizedBox(height: 14),
                              const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.lock_outline_rounded,
                                    size: 13,
                                    color: _muted,
                                  ),
                                  SizedBox(width: 7),
                                  Flexible(
                                    child: Text(
                                      'A secure start to something good.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: _muted,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 28),
                              const Text(
                                'Web · Android · iOS\nOne connected experience.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _muted,
                                  fontSize: 12,
                                  height: 1.9,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
