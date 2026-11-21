import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../capture/ocr_service.dart';
import '../core/money.dart';
import '../khata/bulk_import.dart';
import 'money_store.dart';
import 'overview_tab.dart' show asString;
import 'photos.dart';

/// On-device OCR (ML Kit). Swappable in tests.
OcrService ocrService = MlKitOcrService();

/// Reads an image file into upload-ready JPEG bytes (≤ 1600 px).
Future<Uint8List> Function(String path) readPhotoForUpload = (path) async =>
    compute(downscaleToJpeg, await File(path).readAsBytes());

String _signed(int paise) =>
    '${paise < 0 ? '−' : ''}${Money.format(paise.abs())}';

/// Paste one person's old notes → server parse → preview → save as opening.
class KhataPersonImportScreen extends StatefulWidget {
  const KhataPersonImportScreen({
    super.key,
    required this.store,
    required this.name,
  });
  final MoneyStore store;
  final String name;
  @override
  State<KhataPersonImportScreen> createState() =>
      _KhataPersonImportScreenState();
}

class _KhataPersonImportScreenState extends State<KhataPersonImportScreen> {
  final _text = TextEditingController();
  List<Json>? _lines;
  int _total = 0;
  bool _plusTheyOwe = false;
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _read() async {
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    final result = await widget.store.run(
      context,
      () => widget.store.api.importParse(_text.text, mode: 'person'),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (result != null) {
        _lines = itemsOf(result, 'lines');
        _total = asInt(result['totalMinor']);
      }
    });
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final store = widget.store;
    final result = await store.run(
      context,
      () => store.api.importSave([
        {
          'name': widget.name,
          'choice': 'lines',
          'plusTheyOwe': _plusTheyOwe,
          'lines': _lines,
          'statedMinor': null,
        },
      ]),
      done: 'Old khata saved for ${widget.name}.',
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final owed = _plusTheyOwe ? _total : -_total;
    return Scaffold(
      appBar: AppBar(title: Text('Old notes · ${widget.name}')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(
            'Paste what you wrote in your notebook or notes app. Each + or − becomes one line, saved under "Old khata · opening balance".',
            style: t.bodyMedium,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('person_import_text'),
            controller: _text,
            minLines: 5,
            maxLines: 12,
            decoration: const InputDecoration(
              hintText: '50000 + 2000 (rent 3 oct) - 1000 bori\n- 5k 12 sep',
            ),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonalIcon(
              key: const Key('person_import_read'),
              onPressed: _busy ? null : _read,
              icon: const Icon(Icons.auto_fix_high),
              label: const Text('Read it'),
            ),
          ),
          if (_lines != null) ...[
            const SizedBox(height: 12),
            Text('In these notes, plus (+) means:', style: t.labelLarge),
            const SizedBox(height: 6),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                  value: false,
                  label: Text(
                    'I owe ${widget.name}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                ButtonSegment(
                  value: true,
                  label: Text(
                    '${widget.name} owes me',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
              selected: {_plusTheyOwe},
              onSelectionChanged: (value) =>
                  setState(() => _plusTheyOwe = value.first),
            ),
            const SizedBox(height: 10),
            Text(
              owed == 0
                  ? 'All settled'
                  : owed > 0
                  ? '${widget.name} owes you ${Money.format(owed)}'
                  : 'You owe ${widget.name} ${Money.format(-owed)}',
              key: const Key('person_import_result'),
              style: t.titleMedium,
            ),
            const SizedBox(height: 8),
            for (final line in _lines!)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  asString(line['note']).isEmpty ? '—' : asString(line['note']),
                ),
                subtitle: line['date'] == null
                    ? null
                    : Text(prettyDate(asString(line['date']))),
                trailing: Text(
                  _signed(asInt(line['signedMinor'])),
                  style: t.titleSmall?.copyWith(fontFeatures: tabular),
                ),
              ),
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('person_import_save'),
              onPressed: _busy || _lines!.isEmpty ? null : _save,
              child: Text('Save ${_lines!.length} lines'),
            ),
          ],
        ],
      ),
    );
  }
}

class _BulkRow {
  _BulkRow(Json json)
    : name = asString(json['name']),
      tag = json['tag'] as String?,
      lines = itemsOf(json, 'lines'),
      linesMinor = asInt(json['linesMinor']),
      statedMinor = json['statedMinor'] == null
          ? null
          : asInt(json['statedMinor']),
      choice = asString(json['choice'], 'lines');
  String name;
  final String? tag;
  final List<Json> lines;
  final int linesMinor;
  final int? statedMinor;
  String choice;
  bool plusTheyOwe = false;

  bool get matches => statedMinor == null || statedMinor == linesMinor;
  int get finalMinor => switch (choice) {
    'linesAndFix' || 'totalOnly' => statedMinor ?? linesMinor,
    'lines' => linesMinor,
    _ => 0,
  };
  int owedToMe(int notesSigned) => plusTheyOwe ? notesSigned : -notesSigned;

  Json toJson() => {
    'name': name,
    'choice': choice,
    'plusTheyOwe': plusTheyOwe,
    'lines': lines,
    'statedMinor': statedMinor,
  };
}

/// "Import everyone": paste all old notes, or read screenshots on the phone.
class KhataBulkImportScreen extends StatefulWidget {
  const KhataBulkImportScreen({super.key, required this.store});
  final MoneyStore store;
  @override
  State<KhataBulkImportScreen> createState() => _KhataBulkImportScreenState();
}

class _KhataBulkImportScreenState extends State<KhataBulkImportScreen> {
  final _text = TextEditingController();
  List<_BulkRow> _people = [];
  final List<String> _shots = [];
  bool _onlyTotals = false;
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _applyTotals() {
    for (final p in _people) {
      if (p.choice == 'skip') continue;
      p.choice = _onlyTotals
          ? 'totalOnly'
          : (p.lines.isEmpty
                ? 'totalOnly'
                : (p.matches ? 'lines' : 'linesAndFix'));
    }
  }

  Future<void> _read() async {
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    final result = await widget.store.run(
      context,
      () => widget.store.api.importParse(_text.text, mode: 'bulk'),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (result != null) {
        _people = [for (final p in itemsOf(result, 'people')) _BulkRow(p)];
        if (_onlyTotals) _applyTotals();
      }
    });
    if (result != null && _people.isEmpty) {
      snack(
        context,
        'No people found. Start each person on a new line: Name - 5000 + 2000 - 1000',
      );
    }
  }

  Future<void> _fromScreenshot() async {
    final paths = await photoSource.pickPaths();
    if (paths.isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      final texts = <String>[];
      for (final path in paths) {
        texts.add(
          KhataBulkImport.textFromOcr(await ocrService.recognize(path)),
        );
      }
      final text = texts.where((x) => x.trim().isNotEmpty).join('\n\n');
      if (!mounted) return;
      _text.text = _text.text.trim().isEmpty
          ? text
          : '${_text.text.trim()}\n\n$text';
      setState(() {
        _shots.addAll(paths);
        _onlyTotals = true;
        _applyTotals();
      });
      snack(context, 'Text read on this phone. Check it, then tap Read it.');
    } catch (_) {
      if (mounted) snack(context, 'Could not read this image.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final store = widget.store;
    final photoIds = <String>[];
    for (final path in _shots) {
      try {
        final jpeg = await readPhotoForUpload(path);
        photoIds.add(
          await store.api.uploadPhoto(
            ownerType: 'khata_contact',
            jpeg: jpeg,
            caption: 'Old khata',
          ),
        );
      } catch (_) {
        // The photo is a bonus; the khata is still saved without it.
      }
    }
    if (!mounted) return;
    final saving = _people.where((p) => p.choice != 'skip').toList();
    final result = await store.run(
      context,
      () => store.api.importSave([
        for (final p in saving) p.toJson(),
      ], photoIds: photoIds),
      done:
          'Saved old khata for ${saving.length} ${saving.length == 1 ? 'person' : 'people'}.',
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context);
    } else {
      setState(() => _busy = false);
    }
  }

  String _who(_BulkRow p, int owed) => owed == 0
      ? 'All settled with ${p.name}'
      : owed > 0
      ? '${p.name} owes you ${Money.format(owed)}'
      : 'You owe ${p.name} ${Money.format(-owed)}';

  Widget _person(BuildContext context, int i, _BulkRow p) {
    final c = context.lc;
    final t = Theme.of(context).textTheme;
    final hasStated = p.statedMinor != null;
    final choices = <(String, String)>[
      if (p.lines.isNotEmpty && hasStated && !p.matches)
        ('linesAndFix', 'All lines + correction to match my total'),
      if (p.lines.isNotEmpty) ('lines', 'All lines as written'),
      ('totalOnly', hasStated ? 'Only my total' : 'Only the total'),
      ('skip', 'Skip this person'),
    ];
    if (!choices.any((x) => x.$1 == p.choice)) p.choice = choices.first.$1;
    return LCard(
      key: Key('bulk_person_$i'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GeneratedAvatar(name: p.name, size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  p.name,
                  style: t.titleMedium,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (p.tag != null) Text(p.tag!, style: t.bodySmall),
          const SizedBox(height: 6),
          Text(
            [
              '${p.lines.length} lines add up to ${_signed(p.linesMinor)}',
              if (hasStated) 'your total: ${_signed(p.statedMinor!)}',
            ].join(' · '),
            style: t.bodyMedium?.copyWith(fontFeatures: tabular),
          ),
          if (hasStated)
            Text(
              p.matches
                  ? '✓ Matches your total'
                  : '⚠ Differs by ${Money.format(((p.statedMinor ?? 0) - p.linesMinor).abs())}. Check the lines.',
              key: Key('bulk_check_$i'),
              style: TextStyle(
                color: p.matches ? c.moneyIn : c.warn,
                fontWeight: FontWeight.w700,
              ),
            ),
          const SizedBox(height: 10),
          Text('In these notes, plus (+) means:', style: t.labelLarge),
          const SizedBox(height: 4),
          SegmentedButton<bool>(
            key: Key('bulk_plus_$i'),
            segments: [
              ButtonSegment(
                value: false,
                label: Text('I owe ${p.name}', overflow: TextOverflow.ellipsis),
              ),
              ButtonSegment(
                value: true,
                label: Text(
                  '${p.name} owes me',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
            selected: {p.plusTheyOwe},
            onSelectionChanged: (v) => setState(() => p.plusTheyOwe = v.first),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: Key('bulk_choice_${i}_${p.choice}'),
            initialValue: p.choice,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Save'),
            items: [
              for (final (value, label) in choices)
                DropdownMenuItem(value: value, child: Text(label)),
            ],
            onChanged: (v) => setState(() => p.choice = v ?? p.choice),
          ),
          const SizedBox(height: 8),
          if (p.choice != 'skip')
            Text(
              'After saving: ${_who(p, p.owedToMe(p.finalMinor))}',
              key: Key('bulk_result_$i'),
              style: t.titleSmall,
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final saving = _people.where((p) => p.choice != 'skip').length;
    return Scaffold(
      appBar: AppBar(title: const Text('Old khata for everyone')),
      bottomNavigationBar: _people.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: FilledButton(
                  key: const Key('bulk_save'),
                  onPressed: saving == 0 || _busy ? null : _save,
                  child: Text(
                    'Save $saving ${saving == 1 ? 'person' : 'people'}',
                  ),
                ),
              ),
            ),
      body: ListView(
        key: const Key('bulk_scroll'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          Text(
            'Paste all your old khata notes at once. Start each person on a new line with their name. If you wrote your own totals under "pending", they are used to check everything.',
            style: t.bodyMedium,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('bulk_text'),
            controller: _text,
            minLines: 6,
            maxLines: 14,
            decoration: const InputDecoration(
              hintText:
                  'Dadaji - 50000 + 2000 (rent 3 oct) - 1000\nMaa - 68000 - 20000 (mama)\n\npending\nDadaji - 51000\nMaa - 48000',
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('bulk_from_shot'),
                onPressed: _busy ? null : _fromScreenshot,
                icon: const Icon(Icons.image_search),
                label: const Text('From screenshots'),
              ),
              FilledButton.tonalIcon(
                key: const Key('bulk_read'),
                onPressed: _busy ? null : _read,
                icon: const Icon(Icons.auto_fix_high),
                label: const Text('Read it'),
              ),
            ],
          ),
          if (_shots.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              '${_shots.length} screenshot${_shots.length == 1 ? '' : 's'} read on this phone. They are kept with each person you save.',
              key: const Key('bulk_shots'),
              style: t.bodySmall,
            ),
          ],
          const SizedBox(height: 6),
          SwitchListTile(
            key: const Key('bulk_only_totals'),
            contentPadding: EdgeInsets.zero,
            value: _onlyTotals,
            onChanged: (value) => setState(() {
              _onlyTotals = value;
              _applyTotals();
            }),
            title: const Text("Only save each person's total"),
            subtitle: const Text(
              'The screenshot keeps the details. Turn off to save every line.',
            ),
          ),
          for (var i = 0; i < _people.length; i++)
            _person(context, i, _people[i]),
        ],
      ),
    );
  }
}
