import 'package:flutter/material.dart';
import 'workspace_controller.dart';
import 'utils.dart';

class EntryEditor extends StatefulWidget {
  const EntryEditor({
    super.key,
    required this.store,
    required this.collection,
    this.entry,
  });
  final WorkspaceController store;
  final String collection;
  final Map<String, dynamic>? entry;
  @override
  State<EntryEditor> createState() => _EntryEditorState();
}

class _EntryEditorState extends State<EntryEditor> {
  final _form = GlobalKey<FormState>();
  final Map<String, TextEditingController> _text = {};
  late Map<String, dynamic> _values;
  String? _error;
  @override
  void initState() {
    super.initState();
    widget.store.auth.addListener(_authChanged);
    _values = {
      'title': '',
      'body': '',
      'kind': 'note',
      'tag': 'Personal',
      'dueDate': dateKey(),
      'pinned': false,
      'completed': false,
      'archived': false,
      'date': dateKey(),
      'type': 'Strength',
      'duration': 30,
      'exercises': '',
      'effort': 'Moderate',
      'category': widget.collection == 'expenses' ? 'Food' : 'Other',
      'time': 'Morning',
      'days': [0, 1, 2, 3, 4, 5, 6],
      'payment': 'UPI',
      'note': '',
      'month': dateKey().substring(0, 7),
      ...?widget.entry,
    };
    for (final key in [
      'title',
      'body',
      'tag',
      'dueDate',
      'date',
      'duration',
      'exercises',
      'note',
      'month',
    ]) {
      _text[key] = TextEditingController(text: '${_values[key] ?? ''}');
    }
    _text['amount'] = TextEditingController(
      text: widget.entry?['amountMinor'] != null
          ? (widget.entry!['amountMinor'] / 100).toStringAsFixed(2)
          : '',
    );
    _text['limit'] = TextEditingController(
      text: widget.entry?['limitMinor'] != null
          ? (widget.entry!['limitMinor'] / 100).toStringAsFixed(2)
          : '',
    );
  }

  @override
  void dispose() {
    widget.store.auth.removeListener(_authChanged);
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _authChanged() {
    if (widget.store.auth.account != null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    });
  }

  Widget _field(
    String key,
    String label, {
    bool required = false,
    int lines = 1,
    int? maxLength,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(
      controller: _text[key],
      maxLines: lines,
      maxLength: maxLength,
      keyboardType: keyboard,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: (value) {
        if (required && (value == null || value.trim().isEmpty)) {
          return 'Enter $label.';
        }
        if ((key == 'amount' || key == 'limit') &&
            parseMoney(value ?? '') == null) {
          return 'Use a positive amount with up to two decimal places.';
        }
        if (key == 'duration') {
          final minutes = int.tryParse(value ?? '');
          if (minutes == null || minutes < 1 || minutes > 1440) {
            return 'Use 1 to 1440 whole minutes.';
          }
        }
        return null;
      },
    ),
  );
  Widget _select(String key, String label, List<String> options) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$key:${_values[key]}'),
      initialValue: _values[key] as String,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: options
          .map(
            (value) => DropdownMenuItem(
              value: value,
              child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: (value) => setState(() => _values[key] = value),
    ),
  );
  Widget _date(String key, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(
      controller: _text[key],
      readOnly: true,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: const Icon(Icons.calendar_today_outlined, size: 20),
      ),
      validator: (value) =>
          value == null || value.isEmpty ? 'Choose a date.' : null,
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: DateTime.tryParse(_text[key]!.text) ?? DateTime.now(),
          firstDate: DateTime(1900),
          lastDate: DateTime(2200),
        );
        if (picked != null && mounted) _text[key]!.text = dateKey(picked);
      },
    ),
  );
  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final title = _text['title']!.text.trim();
    late Map<String, dynamic> values;
    switch (widget.collection) {
      case 'notes':
        values = {
          'title': title,
          'body': _text['body']!.text,
          'kind': _values['kind'],
          'tag': _text['tag']!.text,
          'dueDate': _values['kind'] == 'reminder'
              ? _text['dueDate']!.text
              : null,
          'pinned': _values['pinned'],
          'completed': _values['completed'],
          'archived': _values['archived'],
        };
      case 'workouts':
        values = {
          'title': title,
          'date': _text['date']!.text,
          'type': _values['type'],
          'duration': int.parse(_text['duration']!.text),
          'exercises': _text['exercises']!.text,
          'effort': _values['effort'],
        };
      case 'routines':
        if ((_values['days'] as List).isEmpty) {
          setState(() => _error = 'Choose at least one day.');
          return;
        }
        values = {
          'title': title,
          'category': _values['category'],
          'time': _values['time'],
          'days': _values['days'],
        };
      case 'expenses':
        values = {
          'title': title,
          'date': _text['date']!.text,
          'amountMinor': parseMoney(_text['amount']!.text),
          'category': _values['category'],
          'payment': _values['payment'],
          'note': _text['note']!.text,
        };
      case 'budgets':
        values = {
          'month': _text['month']!.text,
          'limitMinor': parseMoney(_text['limit']!.text),
        };
      default:
        return;
    }
    final saved = await widget.store.save(
      widget.collection,
      values,
      id: widget.collection == 'budgets'
          ? null
          : widget.entry?['id'] as String?,
    );
    if (saved && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final title = switch (widget.collection) {
      'notes' => 'Note or reminder',
      'workouts' => 'Workout',
      'routines' => 'Routine',
      'expenses' => 'Expense',
      _ => 'Monthly budget',
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFFFAFBF7),
      ),
      body: SafeArea(
        child: AnimatedBuilder(
          animation: widget.store,
          builder: (context, _) => SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.collection != 'budgets')
                    _field(
                      'title',
                      widget.collection == 'expenses'
                          ? 'What was it for?'
                          : 'Title',
                      required: true,
                      maxLength: 120,
                    ),
                  if (widget.collection == 'notes') ...[
                    _select('kind', 'Type', ['note', 'reminder']),
                    _field('body', 'Details', lines: 5, maxLength: 10000),
                    _field('tag', 'Tag', maxLength: 40),
                    if (_values['kind'] == 'reminder')
                      _date('dueDate', 'Reminder date'),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Pin to the top'),
                      value: _values['pinned'] as bool,
                      onChanged: (value) =>
                          setState(() => _values['pinned'] = value),
                    ),
                  ],
                  if (widget.collection == 'workouts') ...[
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final template in [
                          ('A walk', 'Cardio', 20),
                          ('Strength session', 'Strength', 45),
                          ('Mobility session', 'Mobility', 10),
                        ])
                          OutlinedButton(
                            onPressed: () => setState(() {
                              _text['title']!.text = template.$1;
                              _values['type'] = template.$2;
                              _text['duration']!.text = '${template.$3}';
                            }),
                            child: Text(template.$1),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _date('date', 'Date'),
                    _field(
                      'duration',
                      'Minutes',
                      required: true,
                      keyboard: TextInputType.number,
                    ),
                    _select('type', 'Workout type', workoutTypes),
                    _select('effort', 'How it felt', [
                      'Easy',
                      'Moderate',
                      'Hard',
                    ]),
                    _field(
                      'exercises',
                      'Exercises, sets & notes',
                      lines: 5,
                      maxLength: 4000,
                    ),
                  ],
                  if (widget.collection == 'routines') ...[
                    _select('category', 'Category', routineCategories),
                    _select('time', 'Time of day', [
                      'Morning',
                      'Afternoon',
                      'Evening',
                      'Anytime',
                    ]),
                    const Text('Repeat on'),
                    const SizedBox(height: 10),
                    LayoutBuilder(
                      builder: (context, constraints) => Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (var index = 0; index < dayNames.length; index++)
                            ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth: constraints.maxWidth,
                              ),
                              child: FilterChip(
                                label: Text(dayNames[index]),
                                selected: (_values['days'] as List).contains(
                                  index,
                                ),
                                onSelected: (selected) => setState(() {
                                  final days = List<int>.from(
                                    _values['days'] as List,
                                  );
                                  if (selected) {
                                    days.add(index);
                                  } else {
                                    days.remove(index);
                                  }
                                  days.sort();
                                  _values['days'] = days;
                                }),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (widget.collection == 'expenses') ...[
                    _field(
                      'amount',
                      'Amount (INR)',
                      required: true,
                      keyboard: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    _date('date', 'Date'),
                    _select('category', 'Category', expenseCategories),
                    _select('payment', 'Paid with', [
                      'UPI',
                      'Card',
                      'Wallet',
                      'Cash',
                      'Other',
                    ]),
                    _field('note', 'Note', lines: 3, maxLength: 2000),
                  ],
                  if (widget.collection == 'budgets') ...[
                    Text(
                      'Budget for ${_text['month']!.text}',
                      style: const TextStyle(fontSize: 18),
                    ),
                    const SizedBox(height: 18),
                    _field(
                      'limit',
                      'Monthly budget (INR)',
                      required: true,
                      keyboard: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                  ],
                  if (_error != null || widget.store.error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _error ?? widget.store.error!,
                          style: const TextStyle(color: Color(0xFF99442F)),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: widget.store.saving ? null : _save,
                    child: Text(widget.store.saving ? 'Saving…' : 'Save'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
