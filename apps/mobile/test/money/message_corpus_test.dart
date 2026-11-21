// A wide corpus of Indian bank / card / wallet / payment-app messages, in the
// formats these senders use. Each row: who sent it, the text, and what the
// app must extract. Amounts are paise; merchant is a case-insensitive "contains".
import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/models.dart';
import 'package:lifeos_mobile/money/parsing/card_bill_parser.dart';
import 'package:lifeos_mobile/money/parsing/notification_parser.dart';
import 'package:lifeos_mobile/money/parsing/sms_parser.dart';

class Sms {
  final String sender, body;
  final int amount;
  final TxnDirection dir;
  final String? acct, merchant;
  final TxnChannel? channel;
  const Sms(
    this.sender,
    this.body,
    this.amount,
    this.dir, {
    this.acct,
    this.merchant,
    this.channel,
  });
}

class Notif {
  final String pkg, title, text;
  final int amount;
  final TxnDirection dir;
  final String? merchant;
  const Notif(
    this.pkg,
    this.title,
    this.text,
    this.amount,
    this.dir, {
    this.merchant,
  });
}

void main() {
  final engine = SmsParserEngine();
  final notif = NotificationParser();
  final now = DateTime(2026, 11, 17, 14);

  const sms = <Sms>[
    // ---- Credit cards ----
    Sms(
      'AD-HDFCBK',
      'Spent Rs.1,299.00 On HDFC Bank Card 4521 At AMAZON PAY INDIA On 2026-11-17:13:22:10.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 4521 to 7308080808',
      129900,
      TxnDirection.debit,
      acct: '4521',
      merchant: 'amazon',
      channel: TxnChannel.card,
    ),
    Sms(
      'JD-ICICIT',
      'INR 2,450.00 spent using ICICI Bank Card XX9012 on 17-Nov-26 on SWIGGY. Avl Limit: INR 1,12,550.00. If not you, call 1800 2662/SMS BLOCK 9012 to 9215676766.',
      245000,
      TxnDirection.debit,
      acct: '9012',
      merchant: 'swiggy',
      channel: TxnChannel.card,
    ),
    Sms(
      'VM-SBICRD',
      'Rs.799.00 spent on your SBI Credit Card ending 3344 at NETFLIX COM on 17/11/26. Trxn. not done by you? Report at https://sbicard.com/Dispute',
      79900,
      TxnDirection.debit,
      acct: '3344',
      merchant: 'netflix',
      channel: TxnChannel.card,
    ),
    Sms(
      'AX-AXISBK',
      'Spent INR 560.00\nAxis Bank Card no. XX7788\n17-11-26 12:10:45 IST\nZOMATO\nAvl Limit: INR 88,440.00\nNot you? SMS BLOCK 7788 to 919951860002',
      56000,
      TxnDirection.debit,
      acct: '7788',
      channel: TxnChannel.card,
    ),
    Sms(
      'VK-KOTAKB',
      'Rs.3,200.00 spent via Kotak Credit Card XX6655 at DMART AVENUE on 17/11/2026. Avl limit Rs.46,800.00. Not you? Call 18602662666',
      320000,
      TxnDirection.debit,
      acct: '6655',
      merchant: 'dmart',
      channel: TxnChannel.card,
    ),
    Sms(
      'BP-IDFCFB',
      'Transaction of INR 1,050.00 on your IDFC FIRST Bank Credit Card ending 2211 at UBER INDIA on 17-NOV-2026 was successful.',
      105000,
      TxnDirection.debit,
      acct: '2211',
      merchant: 'uber',
      channel: TxnChannel.card,
    ),
    Sms(
      'VM-ONECRD',
      'You have spent Rs. 649 at BLINKIT using your OneCard ending 8899 on 17 Nov 2026.',
      64900,
      TxnDirection.debit,
      acct: '8899',
      merchant: 'blinkit',
      channel: TxnChannel.card,
    ),
    Sms(
      'AD-HDFCBK',
      'Payment of Rs. 15,000.00 received towards your HDFC Bank Credit Card ending 4521 on 17-11-2026. Thank you.',
      1500000,
      TxnDirection.credit,
      acct: '4521',
    ),
    Sms(
      'VM-SBICRD',
      'We have received payment of Rs.8,540.00 on your SBI Card ending 3344 on 17-Nov-26. Thank you.',
      854000,
      TxnDirection.credit,
      acct: '3344',
    ),
    Sms(
      'JD-ICICIT',
      'Dear Customer, a refund of INR 499.00 from MYNTRA has been credited to your ICICI Bank Credit Card XX9012 on 17-Nov-26.',
      49900,
      TxnDirection.credit,
      acct: '9012',
    ),

    // ---- Bank accounts: UPI / IMPS / NEFT / ATM ----
    Sms(
      'VM-SBIUPI',
      'Dear UPI user A/C X4567 debited by 250.0 on date 17Nov26 trf to RAHUL KUMAR Refno 431234567890. If not u? call 1800111109. -SBI',
      25000,
      TxnDirection.debit,
      acct: '4567',
      merchant: 'rahul',
    ),
    Sms(
      'JM-ICICIB',
      'ICICI Bank Acct XX321 debited for Rs 1,200.00 on 17-Nov-26; PRIYA SHARMA credited. UPI:431299887766. Call 18002662 for dispute.',
      120000,
      TxnDirection.debit,
      acct: '321',
      merchant: 'priya',
    ),
    Sms(
      'VK-KOTAKB',
      'Sent Rs.500.00 from Kotak Bank AC X1122 to amit.k@okaxis on 17-11-26.UPI Ref 431255667788. Not you, https://kotak.com/KBANKT/Fraud',
      50000,
      TxnDirection.debit,
      acct: '1122',
    ),
    Sms(
      'AX-AXISBK',
      'INR 300.00 debited\nA/c no. XX5566\n17-11-26, 09:15:02\nUPI/P2A/431211223344/NEHA GUPTA\nNot you? SMS BLOCKUPI Cust ID to 919951860002',
      30000,
      TxnDirection.debit,
      acct: '5566',
      merchant: 'neha',
    ),
    Sms(
      'VM-PNBSMS',
      'Your A/c XX7890 has been debited with INR 2,000.00 on 17-11-2026 by UPI ref no 431277788899. Avl Bal INR 12,345.67',
      200000,
      TxnDirection.debit,
      acct: '7890',
    ),
    Sms(
      'VM-CANBNK',
      'An amount of INR 750.00 has been DEBITED to your account XXX345 on 17/11/2026 towards UPI/431200011122/SWIGGY. Total Avail.bal INR 5,250.00 - Canara Bank',
      75000,
      TxnDirection.debit,
      acct: '345',
    ),
    Sms(
      'AD-UNIONB',
      'A/c *6789 Debited for Rs:150.00 on 17-11-2026 12:30:11 by Mob Bk ref no 431200099988 Avl Bal Rs:9,850.00. Never share OTP/PIN with anyone - Union Bank of India',
      15000,
      TxnDirection.debit,
      acct: '6789',
    ),
    Sms(
      'VM-BOBTXN',
      'Rs.420.00 transferred from A/c ...2345 to:UPI/431266655544. Total Bal:Rs.3,580.00CR. Avlbl Amt:Rs.3,580.00(17-11-2026 11:10:20) - Bank of Baroda',
      42000,
      TxnDirection.debit,
      acct: '2345',
    ),
    Sms(
      'BZ-IDFCFB',
      'Your A/C XXXXXXX4321 is credited with INR 45,000.00 on 17/11/2026 by NEFT from ACME TECHNOLOGIES PVT LTD. New Bal: INR 52,300.00',
      4500000,
      TxnDirection.credit,
      acct: '4321',
    ),
    Sms(
      'VM-YESBNK',
      'INR 1,000.00 withdrawn at ATM S1AW000123 from A/c XX9988 on 17-NOV-26. Avl Bal INR 4,000.00',
      100000,
      TxnDirection.debit,
      acct: '9988',
      channel: TxnChannel.atm,
    ),
    Sms(
      'AD-INDUSB',
      'Your IndusInd A/C 1234XXXX5678 is debited for INR 899.00 towards AIRTEL PREPAID on 17-11-2026. Avl Bal: INR 10,101.00',
      89900,
      TxnDirection.debit,
      acct: '5678',
      merchant: 'airtel',
    ),
    Sms(
      'JK-FEDBNK',
      'Rs 2,500.00 credited to your A/c XX1357 via IMPS from SURESH on 17-11-2026. Ref No 431288899900. Bal Rs 7,500.00 -Federal Bank',
      250000,
      TxnDirection.credit,
      acct: '1357',
    ),
    Sms(
      'VM-AUBANK',
      'Dear Customer, INR 600.00 debited from your AU Bank A/c XX2468 on 17-11-2026 via UPI to zepto@ybl. Ref 431211122233.',
      60000,
      TxnDirection.debit,
      acct: '2468',
    ),
    Sms(
      'VM-JUPITR',
      'Rs 340 paid to CHAI POINT from your Federal Bank a/c XX1122 via Jupiter on 17 Nov. UPI Ref 431233344455',
      34000,
      TxnDirection.debit,
      acct: '1122',
      merchant: 'chai point',
    ),

    // ---- Wallets ----
    Sms(
      'VM-PAYTMB',
      'Paid Rs.120 to Ramu Tea Stall from Paytm Wallet. Txn ID 2026111712345. Balance Rs.880',
      12000,
      TxnDirection.debit,
      merchant: 'ramu tea',
    ),
    Sms(
      'VM-AMZPAY',
      'Rs 349.00 paid using Amazon Pay balance for your order at Amazon. Available balance Rs 1,151.00',
      34900,
      TxnDirection.debit,
    ),
    Sms(
      'VM-MOBIKW',
      'Payment of Rs 75 to Metro Card Recharge was successful using MobiKwik Wallet. Balance: Rs 425.',
      7500,
      TxnDirection.debit,
      merchant: 'metro',
    ),
  ];

  group('SMS corpus', () {
    for (final c in sms) {
      test(
        '${c.sender}: ${c.body.substring(0, c.body.length.clamp(0, 50))}',
        () {
          final t = engine
              .parse(sender: c.sender, body: c.body, receivedAt: now)
              .transaction;
          expect(t, isNotNull, reason: 'not read at all');
          expect(t!.amountPaise, c.amount, reason: 'amount');
          expect(t.direction, c.dir, reason: 'direction');
          if (c.acct != null) {
            expect(t.accountSuffix, c.acct, reason: 'account');
          }
          if (c.merchant != null) {
            expect(
              t.merchant?.toLowerCase(),
              contains(c.merchant),
              reason: 'merchant',
            );
          }
          if (c.channel != null) {
            expect(t.channel, c.channel, reason: 'channel');
          }
        },
      );
    }
  });

  group('not transactions', () {
    const ignored = [
      (
        'AD-HDFCBK',
        'Your OTP for txn of Rs 1,299.00 at AMAZON on HDFC Bank Card 4521 is 482913. Do not share.',
      ),
      (
        'VM-SBICRD',
        'Get a pre-approved loan of Rs 5,00,000 on your SBI Card. Apply now: https://sbi.co/x',
      ),
      (
        'JD-ICICIT',
        'Rs 2,000 will be debited from your a/c XX321 on 20-Nov-26 towards SIP. Ensure sufficient balance.',
      ),
      (
        'VM-PAYTMB',
        'Rahul has requested Rs 500 from you on Paytm. Pay now: https://p.paytm.me/x',
      ),
      (
        'VK-KOTAKB',
        'Congratulations! You have won a cashback of up to Rs 100. Claim now.',
      ),
    ];
    for (final (s, b) in ignored) {
      test(b.substring(0, 40), () {
        expect(
          engine.parse(sender: s, body: b, receivedAt: now).transaction,
          isNull,
        );
      });
    }
  });

  group('card bills', () {
    test('HDFC statement', () {
      final b = CardBillParser.parse(
        'AD-HDFCBK',
        'Your HDFC Bank Credit Card XX4521 statement is generated. Total Amt Due: Rs 12,345.67, Min Amt Due: Rs 620.00, Due Date: 05-12-2026.',
        reference: now,
      )!;
      expect(b.cardSuffix, '4521');
      expect(b.totalDuePaise, 1234567);
      expect(b.minDuePaise, 62000);
      expect(b.dueDate, DateTime(2026, 12, 5));
      expect(b.isStatement, isTrue);
      expect(
        engine
            .parse(sender: 'AD-HDFCBK', body: 'x', receivedAt: now)
            .transaction,
        isNull,
      );
    });
    test('ICICI statement', () {
      final b = CardBillParser.parse(
        'JD-ICICIT',
        'ICICI Bank Credit Card XX9012 Statement: Total Amount due INR 8,540.00; Minimum Amount due INR 430.00. Payment due date 03-DEC-26.',
        reference: now,
      )!;
      expect(b.totalDuePaise, 854000);
      expect(b.minDuePaise, 43000);
      expect(b.dueDate, DateTime(2026, 12, 3));
      expect(b.bankName, 'ICICI Bank');
    });
    test('SBI Card reminder', () {
      final b = CardBillParser.parse(
        'VM-SBICRD',
        'Payment of Rs.4,500.00 for your SBI Card ending 3344 is due on 07 Dec 2026. Please pay to avoid late charges.',
        reference: now,
      )!;
      expect(b.cardSuffix, '3344');
      expect(b.totalDuePaise, 450000);
      expect(b.dueDate, DateTime(2026, 12, 7));
      expect(b.isStatement, isFalse);
    });
    test('available limit from a spend message', () {
      final b = CardBillParser.parse(
        'JD-ICICIT',
        'INR 2,450.00 spent using ICICI Bank Card XX9012 on 17-Nov-26 on SWIGGY. Avl Limit: INR 1,12,550.00.',
      )!;
      expect(b.availableLimitPaise, 11255000);
    });
    test('bill messages are not transactions', () {
      expect(
        engine
            .parse(
              sender: 'AD-HDFCBK',
              body:
                  'Your HDFC Bank Credit Card XX4521 statement is generated. Total Amt Due: Rs 12,345.67, Min Amt Due: Rs 620.00, Due Date: 05-12-2026.',
              receivedAt: now,
            )
            .transaction,
        isNull,
      );
    });
  });

  const notifs = <Notif>[
    Notif(
      'com.tatadigital.tcp',
      'Payment successful',
      'Successfully paid ₹259 to Maiz Mexican Kitchen',
      25900,
      TxnDirection.debit,
      merchant: 'maiz',
    ),
    Notif(
      'com.naviapp',
      'Paid ₹1,200',
      '₹1,200 paid successfully to Priya Singh',
      120000,
      TxnDirection.debit,
      merchant: 'priya',
    ),
    Notif(
      'com.bharatpe.app',
      'Payment received',
      'You received ₹350 from Ankit Verma',
      35000,
      TxnDirection.credit,
      merchant: 'ankit',
    ),
    Notif(
      'money.jupiter',
      'Payment done',
      'Your payment of ₹199 to Spotify was successful',
      19900,
      TxnDirection.debit,
      merchant: 'spotify',
    ),
    Notif(
      'com.epifi.paisa',
      'Money sent',
      '₹500 sent to Rohit via UPI',
      50000,
      TxnDirection.debit,
      merchant: 'rohit',
    ),
    Notif(
      'indwin.c3.shareapp',
      'slice',
      'Spent ₹420 at Starbucks using your slice card',
      42000,
      TxnDirection.debit,
      merchant: 'starbucks',
    ),
    Notif(
      'com.freecharge.android',
      'Paid',
      'Paid ₹99 for Jio Recharge',
      9900,
      TxnDirection.debit,
      merchant: 'jio',
    ),
    Notif(
      'com.google.android.apps.nbu.paisa.user',
      'Rahul Kumar paid you ₹250',
      '',
      25000,
      TxnDirection.credit,
      merchant: 'rahul',
    ),
    Notif(
      'com.phonepe.app',
      'Received ₹1,000',
      'Received ₹1,000 from MOM in your SBI account',
      100000,
      TxnDirection.credit,
      merchant: 'mom',
    ),
    Notif(
      'com.dreamplug.androidapp',
      'Bill paid',
      'Payment of ₹15,000 to HDFC Bank Credit Card was successful',
      1500000,
      TxnDirection.debit,
    ),
  ];

  group('notifications from many apps', () {
    for (final n in notifs) {
      test('${n.pkg}: ${n.text.isEmpty ? n.title : n.text}', () {
        final t = notif.parse(
          packageName: n.pkg,
          title: n.title,
          text: n.text,
          postedAt: now,
        );
        expect(t, isNotNull, reason: 'not read');
        expect(t!.amountPaise, n.amount);
        expect(t.direction, n.dir);
        if (n.merchant != null) {
          expect(t.merchant?.toLowerCase(), contains(n.merchant));
        }
      });
    }
    test('requests / offers from these apps are ignored', () {
      expect(
        notif.parse(
          packageName: 'com.naviapp',
          title: 'Get ₹100 cashback',
          text: 'Pay ₹500 and win',
          postedAt: now,
        ),
        isNull,
      );
      expect(
        notif.parse(
          packageName: 'com.bharatpe.app',
          title: 'Request',
          text: 'Ankit requested ₹350 from you',
          postedAt: now,
        ),
        isNull,
      );
    });
  });
}
