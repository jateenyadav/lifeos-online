import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import '../../auth/auth_api.dart';
import '../api/money_api.dart';
import '../models.dart';
import '../ocr/screenshot_parser.dart';
import '../parsing/notification_parser.dart';
import '../parsing/sms_parser.dart';
import 'capture_bridge.dart';

/// "VM-HDFCBK-S" → "HDFCBK"; app packages stay as they are.
String normalizeSender(String sender) {
  final upper = sender.trim().toUpperCase();
  if (upper.contains('.') && !upper.contains(' ')) return sender.trim();
  final parts = upper.split('-').where((part) => part.isNotEmpty).toList();
  if (parts.length >= 2 && parts.first.length == 2) parts.removeAt(0);
  if (parts.length >= 2 && parts.last.length == 1) parts.removeLast();
  return parts.join('-').replaceAll(RegExp(r'[^A-Z0-9-]'), '');
}

/// Idempotent key: the same message always gives the same key, so retries
/// and re-imports never create a second transaction.
String captureSourceKey({
  required String source,
  required String sender,
  required int amountMinor,
  required DateTime at,
  String? reference,
}) {
  final ref = reference?.trim().toUpperCase() ?? '';
  // With a bank reference the time does not matter; without one use a
  // 10-minute bucket (the receiver and the inbox clocks differ by seconds).
  final bucket = ref.isNotEmpty
      ? 'ref'
      : '${at.millisecondsSinceEpoch ~/ const Duration(minutes: 10).inMilliseconds}';
  final raw = 'v1|$source|${normalizeSender(sender)}|$amountMinor|$bucket|$ref';
  return '$source:${sha256.convert(utf8.encode(raw))}';
}

String _two(int value) => value.toString().padLeft(2, '0');
String ymd(DateTime at) => '${at.year}-${_two(at.month)}-${_two(at.day)}';
String hm(DateTime at) => '${_two(at.hour)}:${_two(at.minute)}';

String channelName(TxnChannel channel) => switch (channel) {
  TxnChannel.upi => 'UPI',
  TxnChannel.card => 'Card',
  TxnChannel.netbanking ||
  TxnChannel.neft ||
  TxnChannel.imps ||
  TxnChannel.rtgs => 'NetBanking',
  TxnChannel.wallet => 'Wallet',
  TxnChannel.cash || TxnChannel.atm => 'Cash',
  TxnChannel.cheque || TxnChannel.other => 'Other',
};

/// Structured fields only — never the message text.
Json ingestItem({
  required ParsedTransaction parsed,
  required String source,
  required String sender,
  required DateTime receivedAt,
  String sourceApp = '',
}) {
  final at = parsed.occurredAt ?? receivedAt;
  final credit = parsed.direction == TxnDirection.credit;
  final merchant = parsed.merchant?.trim();
  final upi = parsed.upiId?.trim();
  var title = (merchant != null && merchant.isNotEmpty)
      ? merchant
      : (upi != null && upi.isNotEmpty)
      ? upi
      : credit
      ? 'Money received'
      : 'Payment';
  if (parsed.isRefund && !title.toLowerCase().startsWith('refund')) {
    title = 'Refund: $title';
  }
  var confidence = parsed.confidence / 100;
  if (parsed.status == TxnStatus.pending) confidence = confidence.clamp(0, .5);
  return {
    'sourceKey': captureSourceKey(
      source: source,
      sender: sender,
      amountMinor: parsed.amountPaise,
      at: receivedAt,
      reference: parsed.reference,
    ),
    'source': source,
    'date': ymd(at),
    'time': hm(at),
    'amountMinor': parsed.amountPaise,
    'direction': credit ? 'credit' : 'debit',
    'title': title.length > 80 ? title.substring(0, 80) : title,
    'counterparty': upi ?? merchant ?? '',
    'channel': channelName(parsed.channel),
    'bank': parsed.bankName ?? '',
    'last4': parsed.accountSuffix ?? '',
    'utr': parsed.reference,
    'sourceApp': sourceApp,
    if (parsed.availableBalancePaise != null)
      'availableBalanceMinor': parsed.availableBalancePaise,
    'confidence': double.parse(confidence.clamp(0, 1).toStringAsFixed(2)),
  };
}

Json screenshotIngestItem(ScreenshotTxn txn, {required DateTime now}) {
  final at = txn.occurredAt ?? now;
  final credit = txn.direction == TxnDirection.credit;
  return {
    'sourceKey': captureSourceKey(
      source: 'screenshot',
      sender: 'screenshot',
      amountMinor: txn.amountPaise!,
      at: at,
      reference: txn.reference,
    ),
    'source': 'screenshot',
    'date': ymd(at),
    'time': txn.occurredAt == null ? null : hm(at),
    'amountMinor': txn.amountPaise,
    'direction': credit ? 'credit' : 'debit',
    'title': txn.merchant ?? (credit ? 'Money received' : 'Payment'),
    'counterparty': txn.merchant ?? '',
    'channel': 'UPI',
    'bank': '',
    'last4': '',
    'utr': txn.reference,
    'sourceApp': '',
    // The user checked every field on the review screen.
    'confidence': 0.9,
  };
}

class CaptureRun {
  int seen = 0;
  int ignored = 0;
  int sent = 0;
  int created = 0;
  int merged = 0;
  int duplicates = 0;
  int waiting = 0;
  String? error;
  @override
  String toString() =>
      'seen $seen, ignored $ignored, sent $sent (created $created, merged $merged, duplicate $duplicates), waiting $waiting';
}

/// Moves captured SMS / notifications from the on-device queue to the
/// server: parse on the phone → POST /txns/ingest → ack. An event leaves the
/// queue only after the server accepted it (or it was not a payment), so
/// offline phones keep everything for later.
class CapturePipeline {
  CapturePipeline({
    required this.bridge,
    required this.api,
    DateTime Function()? now,
    this.batchSize = 50,
  }) : _now = now ?? DateTime.now;
  final CaptureBridge bridge;
  final MoneyApi api;
  final DateTime Function() _now;
  final int batchSize;
  final SmsParserEngine _sms = SmsParserEngine();
  final NotificationParser _notifications = NotificationParser();
  bool _running = false;
  bool _again = false;

  /// Never logs message text: only the kind of sender and the decision.
  static void _log(String kind, String sender, String decision) {
    if (kDebugMode) {
      final who = kind == 'notification' ? sender : 'sms-sender';
      debugPrint('capture: $kind from $who → $decision');
    }
  }

  Json? parse(CapturedEvent event) {
    if (event.type == 'notification') {
      final parsed = _notifications.parse(
        packageName: event.sender,
        title: event.title,
        text: event.text,
        postedAt: event.timestamp,
      );
      if (parsed == null || _dropped(parsed)) {
        _log('notification', event.sender, 'not a payment');
        return null;
      }
      _log('notification', event.sender, 'payment');
      return ingestItem(
        parsed: parsed,
        source: 'notification',
        sender: event.sender,
        receivedAt: event.timestamp,
        sourceApp: event.sender,
      );
    }
    final outcome = _sms.parse(
      sender: event.sender,
      body: event.text,
      receivedAt: event.timestamp,
    );
    final parsed = outcome.transaction;
    if (parsed == null || _dropped(parsed)) {
      _log(
        'sms',
        event.sender,
        'ignored (${outcome.classification.kind.name})',
      );
      return null;
    }
    _log('sms', event.sender, 'payment');
    return ingestItem(
      parsed: parsed,
      source: 'sms',
      sender: event.sender,
      receivedAt: event.timestamp,
    );
  }

  static bool _dropped(ParsedTransaction parsed) =>
      parsed.status == TxnStatus.failed || parsed.status == TxnStatus.reversed;

  Future<CaptureRun> drain() async {
    final run = CaptureRun();
    if (_running) {
      _again = true;
      return run;
    }
    _running = true;
    try {
      var more = true;
      while (more) {
        _again = false;
        final events = await bridge.peekEvents();
        if (events.isEmpty) break;
        await _send(events, run, ackIgnored: true);
        if (run.error != null) break;
        more = _again || events.length >= 200;
      }
    } finally {
      _running = false;
    }
    return run;
  }

  Future<CaptureRun> importInbox(int days) async {
    final run = CaptureRun();
    final since = _now().subtract(Duration(days: days));
    final events = await bridge.readSmsInbox(since: since);
    events.sort((a, b) => a.timestamp.compareTo(b.timestamp));
    await _send(events, run, ackIgnored: false, ack: false);
    return run;
  }

  Future<void> _send(
    List<CapturedEvent> events,
    CaptureRun run, {
    required bool ackIgnored,
    bool ack = true,
  }) async {
    final ignored = <String>[];
    final ready = <(String, Json)>[];
    for (final event in events) {
      run.seen++;
      Json? item;
      try {
        item = parse(event);
      } catch (_) {
        item = null;
      }
      if (item == null) {
        run.ignored++;
        ignored.add(event.id);
      } else {
        ready.add((event.id, item));
      }
    }
    if (ack && ackIgnored) await bridge.ack(ignored);
    for (var start = 0; start < ready.length; start += batchSize) {
      final batch = ready.sublist(
        start,
        start + batchSize > ready.length ? ready.length : start + batchSize,
      );
      try {
        final response = await api.ingest([for (final row in batch) row.$2]);
        run.sent += batch.length;
        for (final result in itemsOf(response)) {
          switch (result['status']) {
            case 'created':
              run.created++;
            case 'merged':
              run.merged++;
            default:
              run.duplicates++;
          }
        }
        if (ack) await bridge.ack([for (final row in batch) row.$1]);
      } on ApiException catch (failure) {
        run.error = failure.message;
        run.waiting += ready.length - start;
        return;
      } catch (_) {
        run.error =
            'Could not send captured payments. They stay on this phone.';
        run.waiting += ready.length - start;
        return;
      }
    }
  }
}
