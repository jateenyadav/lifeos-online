import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/models.dart';
import 'package:lifeos_mobile/money/parsing/sms_parser.dart';

void main() {
  final engine = SmsParserEngine();
  final now = DateTime(2026, 11, 15, 10, 30);

  ParsedTransaction? p(String sender, String body) =>
      engine.parse(sender: sender, body: body, receivedAt: now).transaction;
  MessageClass cls(String sender, String body) => engine
      .parse(sender: sender, body: body, receivedAt: now)
      .classification
      .kind;

  group('HDFC', () {
    test('UPI debit (multi-line)', () {
      final t = p(
        'VM-HDFCBK',
        'Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SHARMA STORE\nOn 15/11/26\nRef 432109876543\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.direction, TxnDirection.debit);
      expect(t.accountSuffix, '1234');
      expect(t.merchant, 'SHARMA STORE');
      expect(t.reference, '432109876543');
      expect(t.bankName, 'HDFC Bank');
      expect(t.channel, TxnChannel.upi);
      expect(t.confidence, greaterThanOrEqualTo(85));
    });
    test('UPI credit by VPA', () {
      final t = p(
        'AD-HDFCBK',
        'Rs.2000 credited to HDFC Bank A/c XX1234 on 15-11-26 by VPA rahul@okaxis (UPI 432109876111)',
      )!;
      expect(t.amountPaise, 200000);
      expect(t.direction, TxnDirection.credit);
      expect(t.upiId, 'rahul@okaxis');
      expect(t.reference, '432109876111');
      expect(t.accountSuffix, '1234');
    });
    test('card spend', () {
      final t = p(
        'VM-HDFCBK',
        'Spent Rs.1,299 On HDFC Bank Card 5678 At AMAZON On 2026-11-15:10:22:33',
      )!;
      expect(t.amountPaise, 129900);
      expect(t.direction, TxnDirection.debit);
      expect(t.accountSuffix, '5678');
      expect(t.merchant, 'AMAZON');
      expect(t.channel, TxnChannel.card);
    });
    test('NEFT deposit', () {
      final t = p(
        'VM-HDFCBK',
        'Update! INR 5,000.00 deposited in HDFC Bank A/c XX1234 on 15-NOV-26 for NEFT Cr-ABC0001-RAHUL KUMAR. Avl bal INR 25,000.00',
      )!;
      expect(t.amountPaise, 500000);
      expect(t.direction, TxnDirection.credit);
      expect(t.availableBalancePaise, 2500000);
    });
  });

  group('SBI', () {
    test('UPI debit', () {
      final t = p(
        'JD-SBIUPI',
        'Dear UPI user A/C X1234 debited by 450.0 on date 15Nov26 trf to SHARMA STORE Refno 432109876543. If not u? call 1800111109. -SBI',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.direction, TxnDirection.debit);
      expect(t.accountSuffix, '1234');
      expect(t.merchant, 'SHARMA STORE');
      expect(t.reference, '432109876543');
      expect(t.bankName, 'SBI');
    });
    test('UPI credit', () {
      final t = p(
        'BZ-SBIINB',
        'Dear SBI User, your A/c X5678-credited by Rs.2000 on 15Nov26 transfer from RAHUL KUMAR Ref No 432109876222 -SBI',
      )!;
      expect(t.amountPaise, 200000);
      expect(t.direction, TxnDirection.credit);
      expect(t.accountSuffix, '5678');
      expect(t.merchant, 'RAHUL KUMAR');
      expect(t.reference, '432109876222');
    });
  });

  group('ICICI', () {
    test('UPI debit with beneficiary credited', () {
      final t = p(
        'VK-ICICIT',
        'ICICI Bank Acct XX123 debited for Rs 450.00 on 15-Nov-26; SHARMA STORE credited. UPI:432109876543. Call 18002662 for dispute.',
      )!;
      expect(t.direction, TxnDirection.debit);
      expect(t.amountPaise, 45000);
      expect(t.accountSuffix, '123');
      expect(t.merchant, 'SHARMA STORE');
      expect(t.reference, '432109876543');
    });
    test('card spend ignores available limit', () {
      final t = p(
        'VK-ICICIB',
        'INR 1,299.00 spent using ICICI Bank Card XX5678 on 15-Nov-26 on AMAZON. Avl Limit: INR 98,701.00.',
      )!;
      expect(t.amountPaise, 129900);
      expect(t.merchant, 'AMAZON');
      expect(t.direction, TxnDirection.debit);
    });
  });

  group('Axis / Kotak / PNB / BoB', () {
    test('Axis UPI P2M debit', () {
      final t = p(
        'AX-AXISBK',
        'INR 450.00 debited\nA/c no. XX1234\n15-11-26, 10:22:33\nUPI/P2M/432109876543/SHARMA STORE\nNot you? SMS BLOCKUPI Cust ID to 919951860002',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.direction, TxnDirection.debit);
      expect(t.merchant, 'SHARMA STORE');
      expect(t.reference, '432109876543');
      expect(t.accountSuffix, '1234');
    });
    test('Kotak UPI sent', () {
      final t = p(
        'VM-KOTAKB',
        'Sent Rs.450.00 from Kotak Bank AC X1234 to sharma@ybl on 15-11-26.UPI Ref 432109876543. Not you, https://kotak.com/KBANKT/Fraud',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.upiId, 'sharma@ybl');
      expect(t.reference, '432109876543');
      expect(t.direction, TxnDirection.debit);
    });
    test('Kotak UPI received', () {
      final t = p(
        'VM-KOTAKB',
        'Received Rs.2000.00 in your Kotak Bank AC X1234 from rahul@okaxis on 15-11-26.UPI Ref:432109876999.',
      )!;
      expect(t.direction, TxnDirection.credit);
      expect(t.amountPaise, 200000);
    });
    test('PNB debit with balance', () {
      final t = p(
        'VM-PNBSMS',
        'A/c XX1234 debited INR 450.00 Dt 15-11-26 10:22:33 thru UPI:432109876543.Bal INR 10,000.00 Not u?Fwd this SMS to 9264092640 to block UPI.Download PNB ONE-PNB',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.direction, TxnDirection.debit);
      expect(t.availableBalancePaise, 1000000);
      expect(t.reference, '432109876543');
    });
    test('BoB transfer debit', () {
      final t = p(
        'BP-BOBTXN',
        'Rs.450.00 transferred from A/c ...1234 to:UPI/432109876543. Total Bal:Rs.10000.00CR. Avlbl Amt:Rs.10000.00(15-11-2026 10:22:33) - Bank of Baroda',
      )!;
      expect(t.amountPaise, 45000);
      expect(t.direction, TxnDirection.debit);
      expect(t.accountSuffix, '1234');
    });
    test('BoB credit by VPA', () {
      final t = p(
        'BP-BOBSMS',
        'Rs.2000 Credited to A/c ...1234 thru UPI/432109876777 by rahul@okaxis. Total Bal:Rs.12000.00CR. - Bank of Baroda',
      )!;
      expect(t.direction, TxnDirection.credit);
      expect(t.upiId, 'rahul@okaxis');
    });
  });

  group('generic fallback', () {
    test('unknown bank still parsed', () {
      final t = p(
        'VM-XYZBNK',
        'Your a/c no. XXXX9876 is debited for Rs.300.00 on 15-11-2026 towards ZOMATO. Ref 998877665544',
      )!;
      expect(t.amountPaise, 30000);
      expect(t.direction, TxnDirection.debit);
      expect(t.accountSuffix, '9876');
      expect(t.parserId, startsWith('generic'));
      expect(t.confidence, lessThan(90));
    });
    test('ATM withdrawal', () {
      final t = p(
        'VM-HDFCBK',
        'Rs.5000 withdrawn from HDFC Bank A/c XX1234 at ATM on 15-11-26',
      )!;
      expect(t.direction, TxnDirection.debit);
      expect(t.channel, TxnChannel.atm);
    });
    test('credit card usage message is a debit', () {
      final t = p(
        'VM-HDFCCC',
        'Your HDFC Bank Credit Card XX5678 has been used for Rs 500.00 at SWIGGY on 15-11-26',
      )!;
      expect(t.direction, TxnDirection.debit);
      expect(t.amountPaise, 50000);
    });
  });

  group('refunds, failures, transfers', () {
    test('refund is a credit flagged as refund', () {
      final t = p(
        'VM-HDFCBK',
        'Refund of Rs.299.00 for AMAZON credited to HDFC Bank A/c XX1234 on 15-11-26. Ref 112233445566',
      )!;
      expect(t.direction, TxnDirection.credit);
      expect(t.isRefund, isTrue);
      expect(t.amountPaise, 29900);
    });
    test('reversal of failed UPI is a refund credit', () {
      final t = p(
        'JD-SBIUPI',
        'Your A/c X1234 credited by Rs.450 on 15Nov26 towards reversal of failed UPI txn Ref No 432109876543 -SBI',
      )!;
      expect(t.isRefund, isTrue);
      expect(t.direction, TxnDirection.credit);
    });
    test('failed transaction gets failed status', () {
      final t = p(
        'VM-HDFCBK',
        'Rs.450 debit from HDFC Bank A/c XX1234 to SHARMA STORE failed. Ref 432109870000. Amount will not be debited',
      )!;
      expect(t.status, TxnStatus.failed);
    });
    test('transfer to own account mentions counterparty suffix', () {
      final t = p(
        'VM-HDFCBK',
        'Rs.5000.00 debited from HDFC Bank A/c XX1234 to A/c XX5678 via IMPS on 15-11-26. Ref 556677889900',
      )!;
      expect(t.accountSuffix, '1234');
      expect(t.counterpartySuffix, '5678');
      expect(t.channel, TxnChannel.imps);
    });
    test('numeric sender lowers confidence', () {
      final a = p(
        'VM-HDFCBK',
        'Rs.100 debited from HDFC Bank A/c XX1234 on 15-11-26. Ref 556677889901',
      )!;
      final b = p(
        '+919876543210',
        'Rs.100 debited from HDFC Bank A/c XX1234 on 15-11-26. Ref 556677889901',
      )!;
      expect(b.confidence, lessThan(a.confidence));
    });
  });

  group('ignored messages (negative cases)', () {
    test('OTP', () {
      expect(
        cls(
          'VM-HDFCBK',
          '123456 is your OTP for txn of Rs.450.00 at AMAZON on HDFC Bank card 5678. Valid for 5 mins. Do not share.',
        ),
        MessageClass.otp,
      );
      expect(
        p(
          'VM-HDFCBK',
          'OTP is 998877 for your transaction of INR 1,000. Never share it.',
        ),
        isNull,
      );
    });
    test('OTP via strong pattern', () {
      expect(
        cls('AD-SBIINB', 'Use 4455 as One Time Password to login to SBI YONO.'),
        MessageClass.otp,
      );
    });
    test('promotional', () {
      expect(
        cls(
          'VM-HDFCBK',
          'Congratulations! You are pre-approved for a Personal Loan of Rs.5,00,000. Apply now: https://hdfc.bank/xyz',
        ),
        MessageClass.promotional,
      );
      expect(
        p(
          'AD-AMAZON',
          'Flat 50% off + cashback up to Rs 500 on electronics. Limited period offer! Shop now www.amzn.in',
        ),
        isNull,
      );
    });
    test('modal credit promo is not a transaction', () {
      expect(
        p(
          'VM-KREDIT',
          'Rs 50,000 can be credited to your account in 5 minutes. Get instant loan now!',
        ),
        isNull,
      );
    });
    test('bill reminder is informational', () {
      expect(
        cls(
          'VM-HDFCCC',
          'Payment of Rs.12,500 for HDFC Bank Credit Card XX5678 is due on 20-Nov-26. Minimum amount due Rs.625.',
        ),
        MessageClass.informational,
      );
    });
    test('mandate notice is not a transaction', () {
      expect(
        p(
          'VM-ICICIB',
          'Rs 499 will be debited from your ICICI Bank Acct XX123 on 20-Nov-26 for NETFLIX e-mandate.',
        ),
        isNull,
      );
    });
    test('generic non-financial message', () {
      expect(p('+919999999999', 'Hey are we meeting at 6?'), isNull);
    });
  });

  group('dates', () {
    test('delayed SMS uses date in body', () {
      final t = engine
          .parse(
            sender: 'VM-HDFCBK',
            body:
                'Rs.100 debited from HDFC Bank A/c XX1234 on 10-11-26. Ref 556677889902',
            receivedAt: now,
          )
          .transaction!;
      expect(t.occurredAt!.day, 10);
      expect(t.occurredAt!.month, 11);
    });
    test('same-day keeps precise received timestamp', () {
      final t = p(
        'VM-HDFCBK',
        'Rs.100 debited from HDFC Bank A/c XX1234 on 15-11-26. Ref 556677889903',
      )!;
      expect(t.occurredAt, now);
    });
  });
}
