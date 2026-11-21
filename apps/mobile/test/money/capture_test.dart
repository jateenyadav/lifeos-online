import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/auth/auth_api.dart';
import 'package:lifeos_mobile/money/api/money_api.dart';
import 'package:lifeos_mobile/money/capture/capture_bridge.dart';
import 'package:lifeos_mobile/money/capture/capture_pipeline.dart';
import '../support/auth_fixture.dart';

const hdfcSms =
    'Rs.450.00 debited from a/c **1234 on 21-11-26 to VPA rahul@okaxis (UPI Ref No 123456789012). Not you? Call 18002586161';

CapturedEvent sms(
  String id,
  String body, {
  String sender = 'VM-HDFCBK',
  DateTime? at,
}) => CapturedEvent(
  id: id,
  type: 'sms',
  sender: sender,
  text: body,
  timestamp: at ?? DateTime(2026, 11, 21, 14, 5),
);

void main() {
  test(
    'bank SMS → ingest with structured fields only, never the message text',
    () async {
      final bridge = FakeCaptureBridge()
        ..queue.addAll([
          sms('1', hdfcSms),
          sms('2', '482913 is your OTP for Rs 2,000 at AMAZON. Do not share.'),
          CapturedEvent(
            id: '3',
            type: 'notification',
            sender: 'com.phonepe.app',
            title: 'Payment successful',
            text: 'Paid ₹250 to Sharma Grocery',
            timestamp: DateTime(2026, 11, 21, 15),
          ),
        ]);
      final bodies = <Json>[];
      final api = MoneyApi((path, {method = 'GET', body}) async {
        expect('$method $path', 'POST /txns/ingest');
        bodies.add(body!);
        return {
          'items': [
            for (final _ in body['items'] as List) {'status': 'created'},
          ],
        };
      });
      final run = await CapturePipeline(bridge: bridge, api: api).drain();
      expect(run.created, 2);
      expect(run.ignored, 1);
      expect(bridge.queue, isEmpty);
      expect(bridge.acked.toSet(), {'1', '2', '3'});
      final items = (bodies.single['items'] as List).cast<Json>();
      final first = items.first;
      expect(first['source'], 'sms');
      expect(first['amountMinor'], 45000);
      expect(first['direction'], 'debit');
      expect(first['last4'], '1234');
      expect(first['utr'], '123456789012');
      expect(first['channel'], 'UPI');
      expect(first['date'], '2026-11-21');
      expect(first['sourceKey'], startsWith('sms:'));
      expect(first['confidence'], inInclusiveRange(0, 1));
      expect(items[1]['source'], 'notification');
      expect(items[1]['amountMinor'], 25000);
      const allowed = {
        'sourceKey',
        'source',
        'date',
        'time',
        'amountMinor',
        'direction',
        'title',
        'counterparty',
        'channel',
        'bank',
        'last4',
        'utr',
        'sourceApp',
        'availableBalanceMinor',
        'confidence',
      };
      for (final item in items) {
        expect(allowed.containsAll(item.keys), isTrue, reason: '${item.keys}');
      }
      final wire = jsonEncode(bodies);
      expect(wire.contains('debited from'), isFalse);
      expect(wire.contains('Not you'), isFalse);
      expect(wire.contains('OTP'), isFalse);
      expect(wire.contains('Paid ₹250'), isFalse);
    },
  );

  test('the same SMS always gives the same sourceKey (idempotent retries)', () {
    String key(DateTime at, {String sender = 'VM-HDFCBK'}) => captureSourceKey(
      source: 'sms',
      sender: sender,
      amountMinor: 45000,
      at: at,
    );
    expect(
      key(DateTime(2026, 11, 21, 14, 1)),
      key(DateTime(2026, 11, 21, 14, 1, 30)),
    );
    expect(
      key(DateTime(2026, 11, 21, 14, 1)),
      key(DateTime(2026, 11, 21, 14, 1), sender: 'AD-HDFCBK-S'),
    );
    expect(
      key(DateTime(2026, 11, 21, 14, 1)),
      isNot(key(DateTime(2026, 11, 22, 14, 1))),
    );
    expect(normalizeSender('VM-HDFCBK-S'), 'HDFCBK');
  });

  test(
    'when the API fails, captured payments stay queued and go on the next try',
    () async {
      final bridge = FakeCaptureBridge()..queue.add(sms('1', hdfcSms));
      var fail = true;
      var posts = 0;
      final api = MoneyApi((path, {method = 'GET', body}) async {
        posts++;
        if (fail) throw const ApiException('Cannot reach the server.');
        return {
          'items': [
            {'status': 'created'},
          ],
        };
      });
      final pipeline = CapturePipeline(bridge: bridge, api: api);
      final first = await pipeline.drain();
      expect(first.error, 'Cannot reach the server.');
      expect(first.waiting, 1);
      expect(bridge.queue.length, 1);
      expect(bridge.acked, isEmpty);
      fail = false;
      final second = await pipeline.drain();
      expect(second.created, 1);
      expect(bridge.queue, isEmpty);
      expect(posts, 2);
    },
  );

  test(
    'past inbox import sends in batches of 50 and leaves the queue alone',
    () async {
      final bridge = FakeCaptureBridge();
      for (var i = 0; i < 60; i++) {
        bridge.inbox.add(
          sms(
            'in$i',
            'Rs.${100 + i}.00 debited from a/c **1234 on 01-11-26 to VPA shop$i@okaxis (UPI Ref No 1234567890${i.toString().padLeft(2, '0')}).',
            at: DateTime.now().subtract(Duration(days: 10, minutes: i * 20)),
          ),
        );
      }
      final sizes = <int>[];
      final api = MoneyApi((path, {method = 'GET', body}) async {
        final items = body!['items'] as List;
        sizes.add(items.length);
        return {
          'items': [
            for (final _ in items) {'status': 'created'},
          ],
        };
      });
      final run = await CapturePipeline(
        bridge: bridge,
        api: api,
      ).importInbox(30);
      expect(sizes, [50, 10]);
      expect(run.created, 60);
      expect(bridge.acked, isEmpty);
    },
  );
}
