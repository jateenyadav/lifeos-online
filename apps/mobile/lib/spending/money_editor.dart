import 'package:flutter/material.dart';
import '../workspaces/utils.dart';
import '../workspaces/workspace_controller.dart';
import 'money_utils.dart';

class MoneyEditor extends StatefulWidget {
  const MoneyEditor({
    super.key,
    required this.store,
    required this.mode,
    this.entry,
    this.trip,
  });
  final WorkspaceController store;
  final String mode;
  final Map<String, dynamic>? entry;
  final Map<String, dynamic>? trip;
  @override
  State<MoneyEditor> createState() => _MoneyEditorState();
}

class _MoneyEditorState extends State<MoneyEditor> {
  final _form = GlobalKey<FormState>();
  final _text = <String, TextEditingController>{};
  late Map<String, dynamic> _values;
  bool _saving = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    widget.store.auth.addListener(_authChanged);
    _values = {
      'clientKey': moneyClientKey(),
      'title': '',
      'date': dateKey(),
      'kind': 'expense',
      'person': '',
      'recipientKey': '',
      'category': 'Other',
      'payment': 'UPI',
      'note': '',
      'remember': false,
      'payer': widget.mode == 'settlement'
          ? (widget.trip?['members'] as List)[1]
          : 'Me',
      'participants': widget.mode == 'settlement'
          ? ['Me']
          : [...?widget.trip?['members'] as List?],
      ...?widget.entry,
    };
    for (final key in ['title', 'date', 'person', 'recipientKey', 'note']) {
      _text[key] = TextEditingController(text: '${_values[key]}');
    }
    _text['amount'] = TextEditingController(
      text: _values['amountMinor'] == null
          ? ''
          : (_values['amountMinor'] / 100).toStringAsFixed(2),
    );
    for (final key in ['members', 'budget', 'startDate', 'endDate']) {
      _text[key] = TextEditingController();
    }
    if (widget.mode == 'settlement') _text['title']!.text = 'Trip repayment';
  }

  void _authChanged() {
    if (widget.store.auth.account != null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    });
  }

  @override
  void dispose() {
    widget.store.auth.removeListener(_authChanged);
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _prefill(String value) {
    var key = value.trim().toLowerCase();
    if (!key.contains('@')) key = key.replaceAll(RegExp(r'[\s()-]'), '');
    if (RegExp(r'^\d{10,15}$').hasMatch(key)) key = '+$key';
    final direction = widget.entry?['direction'];
    final profiles = (widget.store.data['payees'] ?? []).where(
      (profile) =>
          profile['recipientKey'] == key &&
          (direction == null ||
              profile['kind'] == 'self_transfer' ||
              (incomingKinds.contains(profile['kind'])
                      ? 'incoming'
                      : 'outgoing') ==
                  direction),
    );
    if (profiles.isEmpty) return;
    final profile = profiles.first;
    setState(() {
      for (final field in ['title', 'person']) {
        _text[field]!.text = profile[field] as String? ?? '';
      }
      _values['category'] = profile['category'];
      _values['kind'] = profile['kind'];
      _values['remember'] = true;
    });
  }

  Widget _field(
    String key,
    String label, {
    bool required = false,
    bool decimal = false,
    int? maxLength,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: _text[key],
      maxLength: maxLength,
      decoration: InputDecoration(labelText: label, counterText: ''),
      keyboardType: decimal
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      enabled: !_saving,
      onChanged: key == 'recipientKey' ? _prefill : null,
      validator: (value) => required && (value ?? '').trim().isEmpty
          ? 'Please fill this in.'
          : null,
    ),
  );
  Widget _choice(String key, String label, Map<String, String> options) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: DropdownButtonFormField<String>(
          key: ValueKey('$key:${_values[key]}'),
          initialValue: _values[key] as String,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items: options.entries
              .map(
                (entry) => DropdownMenuItem(
                  value: entry.key,
                  child: Text(entry.value),
                ),
              )
              .toList(),
          onChanged: _saving
              ? null
              : (value) => setState(() => _values[key] = value),
        ),
      );
  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _saving) return;
    final mode = widget.mode;
    final amount = mode == 'trip'
        ? (_text['budget']!.text.isEmpty
              ? 0
              : parseMoney(_text['budget']!.text))
        : parseMoney(_text['amount']!.text);
    if (amount == null) {
      setState(
        () =>
            _error = 'Enter a positive amount with at most two decimal places.',
      );
      return;
    }
    late String path;
    late Map<String, dynamic> body;
    if (mode == 'payment') {
      final paymentId = widget.entry?['id'];
      path = paymentId == null ? 'payments' : 'payments/$paymentId/confirm';
      body = {
        'title': _text['title']!.text,
        'date': _text['date']!.text,
        'amountMinor': amount,
        'kind': _values['kind'],
        'person': _text['person']!.text,
        'recipientKey': _text['recipientKey']!.text,
        'category': _values['category'],
        'payment': _values['payment'],
        'note': _text['note']!.text,
        'remember': _values['remember'],
        if (paymentId == null) 'clientKey': _values['clientKey'],
      };
    } else if (mode == 'trip') {
      path = 'trips';
      body = {
        'title': _text['title']!.text,
        'members': [
          'Me',
          ..._text['members']!.text
              .split(',')
              .map((member) => member.trim())
              .where((member) => member.isNotEmpty),
        ],
        'budgetMinor': amount,
        'startDate': _text['startDate']!.text.isEmpty
            ? null
            : _text['startDate']!.text,
        'endDate': _text['endDate']!.text.isEmpty
            ? null
            : _text['endDate']!.text,
      };
    } else {
      path = 'trip-items';
      body = {
        'clientKey': _values['clientKey'],
        'tripId': widget.trip!['id'],
        'title': _text['title']!.text,
        'date': _text['date']!.text,
        'amountMinor': amount,
        'kind': mode == 'settlement' ? 'settlement' : 'expense',
        'payer': _values['payer'],
        'participants': _values['participants'],
      };
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final success = await widget.store.moneyCommand(path, body);
    if (!mounted) return;
    if (success) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _saving = false;
      _error = widget.store.error;
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: AlertDialog(
      scrollable: true,
      title: Text(
        widget.mode == 'payment'
            ? (widget.entry?['id'] == null
                  ? 'Record payment'
                  : 'Review payment')
            : widget.mode == 'trip'
            ? 'Plan a trip'
            : widget.mode == 'settlement'
            ? 'Record trip repayment'
            : 'Add shared cost',
      ),
      content: SizedBox(
        width: 520,
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.entry?['suggested'] == true)
                const Text('Remembered details. Check them before saving.'),
              _field(
                'title',
                widget.mode == 'payment'
                    ? 'What was this payment for?'
                    : widget.mode == 'trip'
                    ? 'Trip name'
                    : 'What was this for?',
                required: true,
                maxLength: widget.mode == 'payment' ? 120 : 80,
              ),
              if (widget.mode == 'payment') ...[
                _field(
                  'amount',
                  'Is the amount correct? (INR)',
                  required: true,
                  decimal: true,
                ),
                _choice('kind', 'Payment type', {
                  for (final entry in paymentLabels.entries)
                    if (widget.entry?['id'] == null ||
                        entry.key == 'self_transfer' ||
                        (incomingKinds.contains(entry.key)
                                ? 'incoming'
                                : 'outgoing') ==
                            widget.entry?['direction'])
                      entry.key: entry.value,
                }),
                _field(
                  'person',
                  'Who is this with?',
                  required: personKinds.contains(_values['kind']),
                  maxLength: 80,
                ),
                _field(
                  'recipientKey',
                  'UPI ID or phone number',
                  maxLength: 120,
                ),
                _choice('category', 'Category', {
                  for (final value in expenseCategories) value: value,
                }),
                _field('date', 'Payment date (YYYY-MM-DD)', required: true),
                _choice('payment', 'Paid using', {
                  for (final value in [
                    'UPI',
                    'Card',
                    'Wallet',
                    'Cash',
                    'Other',
                  ])
                    value: value,
                }),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'Remember details for this UPI ID or number',
                  ),
                  value: _values['remember'] == true,
                  onChanged: _saving
                      ? null
                      : (value) => setState(() => _values['remember'] = value),
                ),
                const Text(
                  'The amount is never reused. You always choose Save.',
                ),
              ] else if (widget.mode == 'trip') ...[
                _field(
                  'members',
                  'Other people, separated by commas',
                  required: true,
                ),
                const Text(
                  'Me is included automatically. Use different names.',
                ),
                _field('budget', 'Trip budget (INR, optional)', decimal: true),
                _field('startDate', 'Start date (YYYY-MM-DD, optional)'),
                _field('endDate', 'End date (YYYY-MM-DD, optional)'),
              ] else ...[
                _field(
                  'amount',
                  'Total amount (INR)',
                  required: true,
                  decimal: true,
                ),
                _field('date', 'Payment date (YYYY-MM-DD)', required: true),
                _choice('payer', 'Who paid?', {
                  for (final member in widget.trip!['members'] as List)
                    member as String: member,
                }),
                if (widget.mode == 'settlement')
                  DropdownButtonFormField<String>(
                    initialValue: (_values['participants'] as List).first,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Who received?',
                    ),
                    items: (widget.trip!['members'] as List)
                        .map(
                          (member) => DropdownMenuItem<String>(
                            value: member,
                            child: Text(member),
                          ),
                        )
                        .toList(),
                    onChanged: _saving
                        ? null
                        : (value) =>
                              setState(() => _values['participants'] = [value]),
                  )
                else ...[
                  const Text('Split equally between'),
                  for (final member in widget.trip!['members'] as List)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(member),
                      value: (_values['participants'] as List).contains(member),
                      onChanged: _saving
                          ? null
                          : (selected) => setState(() {
                              if (selected == true) {
                                (_values['participants'] as List).add(member);
                              } else {
                                (_values['participants'] as List).remove(
                                  member,
                                );
                              }
                            }),
                    ),
                ],
                const Text(
                  'Whole paise are split exactly. Any extra paise go to the first selected people.',
                ),
              ],
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Color(0xFF99442F))),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Saving…' : 'Save'),
        ),
      ],
    ),
  );
}
