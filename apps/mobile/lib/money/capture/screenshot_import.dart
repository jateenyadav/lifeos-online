import 'package:flutter/material.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../api/money_api.dart';
import '../core/money.dart';
import '../models.dart';
import '../ocr/screenshot_parser.dart';
import '../ui/khata_import.dart' show ocrService;
import '../ui/money_store.dart';
import 'capture_pipeline.dart';

class _Draft {
  _Draft(ScreenshotTxn txn)
    : amount = TextEditingController(
        text: txn.amountPaise == null ? '' : paiseInput(txn.amountPaise!),
      ),
      title = TextEditingController(text: txn.merchant ?? ''),
      date = txn.occurredAt,
      credit = txn.direction == TxnDirection.credit,
      reference = txn.reference,
      failed = txn.status == TxnStatus.failed;
  final TextEditingController amount;
  final TextEditingController title;
  DateTime? date;
  bool credit;
  final String? reference;
  final bool failed;
  bool keep = true;
}

/// Shared / picked payment screenshots → on-device OCR → ported parser →
/// review → POST /txns/ingest with source 'screenshot'. Images never leave
/// the phone for this.
class ScreenshotImportScreen extends StatefulWidget {
  const ScreenshotImportScreen({
    super.key,
    required this.api,
    required this.paths,
    this.onSaved,
  });
  final MoneyApi api;
  final List<String> paths;
  final VoidCallback? onSaved;
  @override
  State<ScreenshotImportScreen> createState() => _ScreenshotImportScreenState();
}

class _ScreenshotImportScreenState extends State<ScreenshotImportScreen> {
  final List<_Draft> _drafts = [];
  bool _reading = true;
  bool _busy = false;
  int _unreadable = 0;

  @override
  void initState() {
    super.initState();
    _read();
  }

  @override
  void dispose() {
    for (final d in _drafts) {
      d.amount.dispose();
      d.title.dispose();
    }
    super.dispose();
  }

  Future<void> _read() async {
    final engine = ScreenshotParserEngine();
    for (final path in widget.paths) {
      try {
        final found = engine.parse(await ocrService.recognize(path));
        if (found.isEmpty) _unreadable++;
        _drafts.addAll(found.map(_Draft.new));
      } catch (_) {
        _unreadable++;
      }
    }
    if (mounted) setState(() => _reading = false);
  }

  Future<void> _save() async {
    final now = DateTime.now();
    final items = <Json>[];
    for (final d in _drafts.where((d) => d.keep && !d.failed)) {
      final amount = parseRupees(d.amount.text);
      if (amount == null) continue;
      items.add(
        screenshotIngestItem(
          ScreenshotTxn(
            amountPaise: amount,
            direction: d.credit ? TxnDirection.credit : TxnDirection.debit,
            occurredAt: d.date,
            merchant: d.title.text.trim().isEmpty ? null : d.title.text.trim(),
            reference: d.reference,
            layout: 'review',
          ),
          now: now,
        ),
      );
    }
    if (items.isEmpty) return;
    setState(() => _busy = true);
    try {
      final result = await widget.api.ingest(items);
      final created = itemsOf(
        result,
      ).where((r) => r['status'] == 'created').length;
      if (!mounted) return;
      widget.onSaved?.call();
      snack(
        context,
        created == items.length
            ? 'Saved $created from the screenshot.'
            : 'Saved $created · ${items.length - created} were already there.',
      );
      Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      snack(context, 'Could not save. Check your connection and try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final keep = _drafts.where((d) => d.keep && !d.failed).length;
    return Scaffold(
      appBar: AppBar(title: const Text('From a screenshot')),
      bottomNavigationBar: _drafts.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: FilledButton(
                  key: const Key('shot_save'),
                  onPressed: keep == 0 || _busy ? null : _save,
                  child: Text('Save $keep'),
                ),
              ),
            ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(
            'Read on this phone. Check each payment before saving.',
            style: t.bodyMedium,
          ),
          const SizedBox(height: 12),
          if (_reading)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (!_reading && _drafts.isEmpty)
            const EmptyState(
              icon: Icons.image_not_supported_outlined,
              title: 'No payment found in this image.',
              detail:
                  'Use a screenshot of the payment receipt or the app’s history list.',
            ),
          if (_unreadable > 0 && _drafts.isNotEmpty)
            Banner2(
              text:
                  '$_unreadable image${_unreadable == 1 ? '' : 's'} had no payment we could read.',
            ),
          for (var i = 0; i < _drafts.length; i++)
            _draft(context, i, _drafts[i]),
        ],
      ),
    );
  }

  Widget _draft(BuildContext context, int i, _Draft d) => LCard(
    key: Key('shot_draft_$i'),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Checkbox(
              value: d.keep && !d.failed,
              onChanged: d.failed
                  ? null
                  : (v) => setState(() => d.keep = v ?? false),
            ),
            Expanded(
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Paid')),
                  ButtonSegment(value: true, label: Text('Received')),
                ],
                selected: {d.credit},
                onSelectionChanged: (v) => setState(() => d.credit = v.first),
              ),
            ),
          ],
        ),
        if (d.failed)
          Text(
            'This payment failed, so it is not saved.',
            style: TextStyle(color: context.lc.danger),
          ),
        const SizedBox(height: 8),
        TextField(
          controller: d.amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Amount',
            prefixText: '₹ ',
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: d.title,
          decoration: const InputDecoration(labelText: 'To / from'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          icon: const Icon(Icons.event, size: 18),
          label: Text(
            d.date == null
                ? 'Date not found · pick one'
                : prettyDate(dayKey(d.date!)),
          ),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: d.date ?? DateTime.now(),
              firstDate: DateTime(2015),
              lastDate: DateTime.now(),
            );
            if (picked != null) setState(() => d.date = picked);
          },
        ),
        if (parseRupees(d.amount.text) != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              Money.format(parseRupees(d.amount.text)!),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    ),
  );
}
