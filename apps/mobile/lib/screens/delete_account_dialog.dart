import 'package:flutter/material.dart';
import '../auth/auth_api.dart';

class DeleteAccountDialog extends StatefulWidget {
  const DeleteAccountDialog({super.key, required this.account});
  final Account account;

  @override
  State<DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<DeleteAccountDialog> {
  final _confirmation = TextEditingController();
  final _password = TextEditingController();

  bool get _usesGoogle => widget.account.provider == 'google';
  bool get _canDelete =>
      _confirmation.text == 'DELETE' &&
      (_usesGoogle || _password.text.isNotEmpty);

  @override
  void dispose() {
    _confirmation.dispose();
    _password.dispose();
    super.dispose();
  }

  void _confirm() {
    if (_canDelete) Navigator.of(context).pop(_password.text);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: const Text('Delete your LifeOS account?'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.account.email),
        const SizedBox(height: 12),
        const Text(
          'This permanently deletes your LifeOS account, notes, workouts, routines, spending, payment reviews, trips, and saved AI knowledge. You will be signed out on every device. This cannot be undone.',
        ),
        const SizedBox(height: 12),
        const Text(
          'Unsaved payment notifications and your saved session will also be cleared from this phone.',
        ),
        if (_usesGoogle) ...[
          const SizedBox(height: 12),
          const Text(
            'You will confirm with the same Google account. Your Google account will not be deleted.',
          ),
        ] else ...[
          const SizedBox(height: 16),
          TextField(
            controller: _password,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            autofillHints: const [AutofillHints.password],
            decoration: const InputDecoration(labelText: 'Your password'),
            onChanged: (_) => setState(() {}),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: _confirmation,
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'Type DELETE to confirm',
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _confirm(),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      FilledButton(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          backgroundColor: Theme.of(context).colorScheme.error,
          foregroundColor: Theme.of(context).colorScheme.onError,
        ),
        onPressed: _canDelete ? _confirm : null,
        child: Text(_usesGoogle ? 'Confirm with Google' : 'Delete account'),
      ),
    ],
  );
}
