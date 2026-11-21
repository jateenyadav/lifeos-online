import 'package:flutter_test/flutter_test.dart';
import 'package:lifeos_mobile/money/core/money.dart';
import 'package:lifeos_mobile/money/khata/khata.dart';
import 'package:lifeos_mobile/money/ledger/ledger.dart';
import 'package:lifeos_mobile/money/merchant/merchant_matcher.dart';
import 'package:lifeos_mobile/money/models.dart';
import 'package:lifeos_mobile/money/parsing/date_extractor.dart';

void main() {
  group('INR money', () {
    test('Indian grouping and decimals', () {
      expect(Money.format(0), '₹0');
      expect(Money.format(45000), '₹450');
      expect(Money.format(45050), '₹450.50');
      expect(Money.format(12345678), '₹1,23,456.78');
      expect(Money.format(1000000000), '₹1,00,00,000');
      expect(Money.format(-250000), '-₹2,500');
      expect(Money.format(250000, signed: true), '+₹2,500');
      expect(Money.format(100, forceDecimals: true), '₹1.00');
    });
    test('compact', () {
      expect(Money.compact(150000), '₹1.5K');
      expect(Money.compact(25000000), '₹2.5L');
      expect(Money.compact(1200000000), '₹1.2Cr');
      expect(Money.compact(50000), '₹500');
    });
    test('parsing is exact (no floating point)', () {
      expect(Money.parseToPaise('Rs.1,23,456.78'), 12345678);
      expect(Money.parseToPaise('INR 0.1'), 10);
      expect(Money.parseToPaise('₹ 99'), 9900);
      expect(Money.parseToPaise('abc'), isNull);
      // 0.1 + 0.2 style errors cannot happen with integer paise.
      expect(Money.parseToPaise('0.10')! + Money.parseToPaise('0.20')!, 30);
    });
    test('user input validation', () {
      expect(Money.fromUserInput('450.5'), 45050);
      expect(Money.fromUserInput('1,000'), 100000);
      expect(Money.fromUserInput('-5'), isNull);
      expect(Money.fromUserInput('1.234'), isNull);
      expect(Money.fromUserInput('abc'), isNull);
      expect(Money.toInput(45050), '450.50');
      expect(Money.toInput(45000), '450');
    });
    test('even split sums exactly', () {
      final parts = Money.splitEven(100, 3);
      expect(parts, [34, 33, 33]);
      expect(parts.reduce((a, b) => a + b), 100);
    });
  });

  group('date extraction', () {
    final ref = DateTime(2026, 11, 15, 12);
    test('formats', () {
      expect(
        DateExtractor.extract('on 15/11/26', reference: ref),
        DateTime(2026, 11, 15),
      );
      expect(
        DateExtractor.extract('15-Nov-26', reference: ref),
        DateTime(2026, 11, 15),
      );
      expect(
        DateExtractor.extract('on date 15Nov26 trf', reference: ref),
        DateTime(2026, 11, 15),
      );
      expect(
        DateExtractor.extract('2026-11-15:10:22:33', reference: ref),
        DateTime(2026, 11, 15, 10, 22, 33),
      );
      expect(
        DateExtractor.extract('15 Nov, 10:22 pm', reference: ref),
        DateTime(2026, 11, 15, 22, 22),
      );
      expect(
        DateExtractor.extract('Nov 14, 2026', reference: ref),
        DateTime(2026, 11, 14),
      );
    });
    test('missing year in the future means last year', () {
      expect(DateExtractor.extract('28 Dec', reference: ref)!.year, 2025);
    });
    test('invalid dates rejected', () {
      expect(DateExtractor.extract('31/02/26', reference: ref), isNull);
      expect(DateExtractor.extract('no date here', reference: ref), isNull);
    });
  });

  group('merchant normalisation and matching', () {
    test('normalisation', () {
      expect(
        MerchantNormalizer.normalize('Sharma Stores Pvt Ltd'),
        'SHARMA STORE',
      );
      expect(MerchantNormalizer.normalize('sharma.store@ybl'), 'SHARMA STORE');
      expect(MerchantNormalizer.normalize('UPI/SWIGGY 4455667788'), 'SWIGGY');
      expect(MerchantNormalizer.displayName('SHARMA STORE'), 'Sharma Store');
      expect(MerchantNormalizer.displayName('rahul.k@okaxis'), 'Rahul K');
    });

    final known = [
      const MerchantCandidate(
        merchantId: 1,
        normalizedKey: 'SHARMA STORE',
        categoryId: 10,
        upiId: 'sharma@ybl',
      ),
      const MerchantCandidate(
        merchantId: 2,
        normalizedKey: 'SWIGGY',
        categoryId: 11,
      ),
      const MerchantCandidate(
        merchantId: 3,
        normalizedKey: 'BIG BAZAAR',
        aliases: ['BIGBAZAAR'],
      ),
    ];
    final m = MerchantMatcher();

    test('exact, alias and UPI matches auto-apply', () {
      expect(m.match('SHARMA STORES', null, known)!.candidate.merchantId, 1);
      expect(m.match('SHARMA STORES', null, known)!.autoApply, isTrue);
      expect(m.match('BIGBAZAAR', null, known)!.confidence, 100);
      expect(
        m.match('Unknown name', 'sharma@ybl', known)!.candidate.merchantId,
        1,
      );
    });
    test('typo on long first token still matches', () {
      final r = m.match('SHARMAA STORE', null, known)!;
      expect(r.candidate.merchantId, 1);
      expect(r.confidence, greaterThanOrEqualTo(85));
    });
    test('different shops with similar names are NOT merged', () {
      final r = m.match('VERMA STORE', null, known);
      expect(r == null || !r.autoApply, isTrue);
    });
    test('related but different merchant is only suggested', () {
      final r = m.match('SWIGGY INSTAMART', null, known)!;
      expect(r.candidate.merchantId, 2);
      expect(r.autoApply, isFalse);
    });
    test('unrelated returns null', () {
      expect(m.match('ZOMATO', null, known), isNull);
    });
    test('levenshtein and jaro-winkler sanity', () {
      expect(MerchantMatcher.levenshtein('kitten', 'sitting'), 3);
      expect(
        MerchantMatcher.jaroWinkler('MARTHA', 'MARHTA'),
        closeTo(0.961, 0.01),
      );
    });
  });

  group('balances and period totals', () {
    LedgerEntry e(
      int id,
      int acct,
      int amt,
      TxnDirection d, {
      TxnStatus s = TxnStatus.cleared,
      bool transfer = false,
      bool refund = false,
    }) => LedgerEntry(
      id: id,
      accountId: acct,
      amountPaise: amt,
      direction: d,
      status: s,
      occurredAt: DateTime(2026),
      isTransfer: transfer,
      isRefund: refund,
    );

    test('balance = opening + credits - debits; pending/failed excluded', () {
      final entries = [
        e(1, 1, 45000, TxnDirection.debit),
        e(2, 1, 200000, TxnDirection.credit),
        e(3, 1, 10000, TxnDirection.debit, s: TxnStatus.pending),
        e(4, 1, 99900, TxnDirection.debit, s: TxnStatus.failed),
        e(5, 1, 5000, TxnDirection.debit, s: TxnStatus.reversed),
      ];
      expect(
        BalanceCalculator.balance(3000000, entries),
        3000000 - 45000 + 200000,
      );
      expect(BalanceCalculator.pendingDelta(entries), -10000);
    });
    test('self-transfer moves money but keeps net worth', () {
      final hdfc = BalanceCalculator.balance(3000000, [
        e(1, 1, 500000, TxnDirection.debit, transfer: true),
      ]);
      final sbi = BalanceCalculator.balance(2000000, [
        e(2, 2, 500000, TxnDirection.credit, transfer: true),
      ]);
      expect(hdfc, 2500000);
      expect(sbi, 2500000);
      expect(BalanceCalculator.netWorth([hdfc, sbi]), 5000000);
    });
    test('credit card dues reduce net worth; limits never counted', () {
      final card = BalanceCalculator.balance(-500000, [
        e(1, 3, 129900, TxnDirection.debit),
      ]);
      expect(card, -629900);
      expect(BalanceCalculator.netWorth([1000000, card]), 370100);
    });
    test('income/expense exclude transfers; refunds reduce expense', () {
      final t = PeriodCalculator.totals([
        e(1, 1, 100000, TxnDirection.debit),
        e(2, 1, 300000, TxnDirection.credit),
        e(3, 1, 500000, TxnDirection.debit, transfer: true),
        e(4, 2, 500000, TxnDirection.credit, transfer: true),
        e(5, 1, 20000, TxnDirection.credit, refund: true),
        e(6, 1, 70000, TxnDirection.debit, s: TxnStatus.failed),
      ]);
      expect(t.incomePaise, 300000);
      expect(t.expensePaise, 80000);
      expect(t.refundPaise, 20000);
      expect(t.transferPaise, 500000);
      expect(t.netPaise, 220000);
    });
  });

  group('duplicate detection', () {
    const d = DuplicateDetector();
    final base = DateTime(2026, 11, 15, 10);
    LedgerEntry ex({
      String? ref,
      String? acct = '1234',
      bool sms = true,
      bool notif = false,
      String? merchant,
      DateTime? at,
    }) => LedgerEntry(
      id: 9,
      accountId: 1,
      amountPaise: 45000,
      direction: TxnDirection.debit,
      occurredAt: at ?? base,
      reference: ref,
      accountSuffix: acct,
      hasSmsSource: sms,
      hasNotificationSource: notif,
      merchant: merchant,
      source: sms ? TxnSource.sms : TxnSource.notification,
    );

    test('same reference is exact duplicate', () {
      final v = d.check(
        amountPaise: 45000,
        direction: TxnDirection.debit,
        occurredAt: base.add(const Duration(days: 1)),
        source: TxnSource.sms,
        reference: '432109876543',
        accountSuffix: '1234',
        existing: [ex(ref: '432109876543')],
      );
      expect(v.kind, DuplicateKind.exact);
    });
    test('different references are different transactions', () {
      final v = d.check(
        amountPaise: 45000,
        direction: TxnDirection.debit,
        occurredAt: base,
        source: TxnSource.sms,
        reference: '111111111111',
        accountSuffix: '1234',
        existing: [ex(ref: '222222222222')],
      );
      expect(v.kind, DuplicateKind.none);
    });
    test('notification + SMS of same payment merge', () {
      final v = d.check(
        amountPaise: 45000,
        direction: TxnDirection.debit,
        occurredAt: base.add(const Duration(minutes: 1)),
        source: TxnSource.sms,
        reference: '432109876543',
        accountSuffix: '1234',
        merchant: 'SHARMA STORE',
        existing: [
          ex(
            ref: null,
            acct: null,
            sms: false,
            notif: true,
            merchant: 'Sharma Store',
          ),
        ],
      );
      expect(v.kind, DuplicateKind.crossSourceSame);
    });
    test('weak match is only "possible" (kept for review)', () {
      final v = d.check(
        amountPaise: 45000,
        direction: TxnDirection.debit,
        occurredAt: base.add(const Duration(minutes: 5)),
        source: TxnSource.sms,
        accountSuffix: '1234',
        existing: [ex()],
      );
      expect(v.kind, DuplicateKind.possible);
    });
    test('different amount or far in time is not a duplicate', () {
      expect(
        d
            .check(
              amountPaise: 45001,
              direction: TxnDirection.debit,
              occurredAt: base,
              source: TxnSource.sms,
              existing: [ex()],
            )
            .kind,
        DuplicateKind.none,
      );
      expect(
        d
            .check(
              amountPaise: 45000,
              direction: TxnDirection.debit,
              occurredAt: base.add(const Duration(hours: 5)),
              source: TxnSource.sms,
              existing: [ex()],
            )
            .kind,
        DuplicateKind.none,
      );
    });
  });

  group('self-transfer matching', () {
    const m = SelfTransferMatcher();
    final t = DateTime(2026, 11, 15, 10);
    final owned = [
      const OwnedAccount(1, '1234', 'HDFC'),
      const OwnedAccount(2, '5678', 'SBI'),
    ];
    final debit = LedgerEntry(
      id: 1,
      accountId: 1,
      amountPaise: 500000,
      direction: TxnDirection.debit,
      occurredAt: t,
      reference: '556677889900',
      accountSuffix: '1234',
      counterpartySuffix: '5678',
    );

    test('same UTR + named own account auto-links', () {
      final credit = LedgerEntry(
        id: 2,
        accountId: 2,
        amountPaise: 500000,
        direction: TxnDirection.credit,
        occurredAt: t.add(const Duration(minutes: 1)),
        reference: '556677889900',
        accountSuffix: '5678',
      );
      final r = m.findCounterpart(
        entry: credit,
        candidates: [debit],
        ownedAccounts: owned,
      )!;
      expect(r.autoLink, isTrue);
      expect(r.counterpart.id, 1);
    });
    test('amount + time alone is not enough to auto-link', () {
      final plainDebit = LedgerEntry(
        id: 3,
        accountId: 1,
        amountPaise: 70000,
        direction: TxnDirection.debit,
        occurredAt: t,
        merchant: 'RAHUL',
      );
      final credit = LedgerEntry(
        id: 4,
        accountId: 2,
        amountPaise: 70000,
        direction: TxnDirection.credit,
        occurredAt: t.add(const Duration(minutes: 2)),
      );
      final r = m.findCounterpart(
        entry: credit,
        candidates: [plainDebit],
        ownedAccounts: owned,
      )!;
      expect(r.autoLink, isFalse);
      expect(r.score, greaterThanOrEqualTo(50));
    });
    test('same account or same direction never matches', () {
      final sameAcct = LedgerEntry(
        id: 5,
        accountId: 1,
        amountPaise: 500000,
        direction: TxnDirection.credit,
        occurredAt: t,
      );
      final sameDir = LedgerEntry(
        id: 6,
        accountId: 2,
        amountPaise: 500000,
        direction: TxnDirection.debit,
        occurredAt: t,
      );
      expect(
        m.findCounterpart(
          entry: debit,
          candidates: [sameAcct, sameDir],
          ownedAccounts: owned,
        ),
        isNull,
      );
    });
    test('beneficiary named as the user boosts score', () {
      final d2 = LedgerEntry(
        id: 7,
        accountId: 1,
        amountPaise: 1000,
        direction: TxnDirection.debit,
        occurredAt: t,
        merchant: 'JATEEN YADAV',
      );
      final c2 = LedgerEntry(
        id: 8,
        accountId: 2,
        amountPaise: 1000,
        direction: TxnDirection.credit,
        occurredAt: t.add(const Duration(minutes: 1)),
      );
      final r = m.findCounterpart(
        entry: c2,
        candidates: [d2],
        ownedAccounts: owned,
        userDisplayName: 'Jateen Yadav',
      )!;
      expect(r.reasons, contains('beneficiary is you'));
    });
  });

  group('splits', () {
    test('valid and invalid splits', () {
      expect(
        SplitValidator.validate(1000, [
          const SplitPart(1, 600),
          const SplitPart(2, 400),
        ]),
        isNull,
      );
      expect(
        SplitValidator.validate(1000, [
          const SplitPart(1, 600),
          const SplitPart(2, 300),
        ]),
        isNotNull,
      );
      expect(
        SplitValidator.validate(1000, [const SplitPart(1, 1000)]),
        isNotNull,
      );
      expect(
        SplitValidator.validate(1000, [
          const SplitPart(1, 1100),
          const SplitPart(2, -100),
        ]),
        isNotNull,
      );
    });
  });

  group('Khata calculations', () {
    test('Rahul: gave 5000, returned 2000 -> receivable 3000', () {
      final b = KhataCalculator.balance([
        const KhataEntryLite(KhataDirection.gave, 500000),
        const KhataEntryLite(KhataDirection.got, 200000),
      ], const []);
      expect(b.actualPaise, 300000);
      expect(b.adjustedPaise, 300000);
      expect(b.theyOweMe, isTrue);
    });
    test('waiver keeps actual, changes adjusted', () {
      final delta = KhataCalculator.deltaFor(
        currentBalancePaise: 300000,
        amountPaise: 50000,
        reduce: true,
      );
      expect(delta, -50000);
      final b = KhataCalculator.balance(
        [
          const KhataEntryLite(KhataDirection.gave, 500000),
          const KhataEntryLite(KhataDirection.got, 200000),
        ],
        [KhataAdjustmentLite(AdjustmentType.waived, delta)],
      );
      expect(b.actualPaise, 300000);
      expect(b.adjustedPaise, 250000);
    });
    test('reversed adjustment no longer applies', () {
      final b = KhataCalculator.balance(
        [const KhataEntryLite(KhataDirection.gave, 100000)],
        [
          const KhataAdjustmentLite(
            AdjustmentType.discount,
            -20000,
            active: false,
          ),
        ],
      );
      expect(b.adjustedPaise, 100000);
    });
    test('I owe someone (payable) and reductions move toward zero', () {
      final b = KhataCalculator.balance([
        const KhataEntryLite(KhataDirection.got, 100000),
      ], const []);
      expect(b.actualPaise, -100000);
      expect(
        KhataCalculator.deltaFor(
          currentBalancePaise: -100000,
          amountPaise: 10000,
          reduce: true,
        ),
        10000,
      );
      expect(
        KhataCalculator.deltaFor(
          currentBalancePaise: -100000,
          amountPaise: 10000,
          reduce: false,
        ),
        -10000,
      );
    });
    test('disputed and pending confirmation are reported separately', () {
      final b = KhataCalculator.balance(
        [const KhataEntryLite(KhataDirection.gave, 100000)],
        const [
          KhataAdjustmentLite(AdjustmentType.disputed, -30000),
          KhataAdjustmentLite(AdjustmentType.pendingConfirmation, -10000),
        ],
      );
      expect(b.disputedPaise, 30000);
      expect(b.pendingConfirmationPaise, 10000);
      expect(b.adjustedPaise, 60000);
    });
    test('summary totals', () {
      final s = KhataSummary.fromBalances([300000, -50000, 0, 20000]);
      expect(s.receivablePaise, 320000);
      expect(s.payablePaise, 50000);
      expect(s.netPaise, 270000);
    });
  });
}
