/// Shared domain enums and value types. Stored in the DB by [name].
library;

enum TxnDirection { debit, credit }

enum TxnSource { sms, notification, screenshot, manual, statement }

enum TxnChannel {
  upi,
  card,
  netbanking,
  atm,
  neft,
  imps,
  rtgs,
  cash,
  wallet,
  cheque,
  other,
}

/// cleared = settled; pending = awaiting completion (shown, not in balance);
/// failed/reversed = never affects balances or analytics.
enum TxnStatus { cleared, pending, failed, reversed }

enum AccountType { savings, current, salary, creditCard, cash, wallet, other }

extension AccountTypeLabel on AccountType {
  String get label => switch (this) {
    AccountType.savings => 'Savings',
    AccountType.current => 'Current',
    AccountType.salary => 'Salary',
    AccountType.creditCard => 'Credit card',
    AccountType.cash => 'Cash',
    AccountType.wallet => 'Wallet',
    AccountType.other => 'Other',
  };
}

extension TxnSourceLabel on TxnSource {
  String get label => switch (this) {
    TxnSource.sms => 'SMS',
    TxnSource.notification => 'Notification',
    TxnSource.screenshot => 'Screenshot import',
    TxnSource.manual => 'Manual',
    TxnSource.statement => 'Statement import',
  };
}

extension TxnChannelLabel on TxnChannel {
  String get label => switch (this) {
    TxnChannel.upi => 'UPI',
    TxnChannel.card => 'Card',
    TxnChannel.netbanking => 'Net banking',
    TxnChannel.atm => 'ATM',
    TxnChannel.neft => 'NEFT',
    TxnChannel.imps => 'IMPS',
    TxnChannel.rtgs => 'RTGS',
    TxnChannel.cash => 'Cash',
    TxnChannel.wallet => 'Wallet',
    TxnChannel.cheque => 'Cheque',
    TxnChannel.other => 'Other',
  };
}

T enumByName<T extends Enum>(List<T> values, String? name, T fallback) {
  if (name == null) return fallback;
  for (final v in values) {
    if (v.name == name) return v;
  }
  return fallback;
}

/// Output of the SMS / notification / OCR parsers before persistence.
class ParsedTransaction {
  final int amountPaise;
  final TxnDirection direction;
  final TxnChannel channel;
  final TxnStatus status;
  final DateTime? occurredAt;
  final String? bankName;
  final String? accountSuffix;
  final String? merchant;
  final String? upiId;
  final String? reference;
  final int? availableBalancePaise;
  final bool isRefund;

  /// Account suffix of the counterparty when the message mentions one
  /// (useful for self-transfer detection).
  final String? counterpartySuffix;
  final bool mentionsSelfTransfer;
  final int confidence;
  final String parserId;

  const ParsedTransaction({
    required this.amountPaise,
    required this.direction,
    this.channel = TxnChannel.other,
    this.status = TxnStatus.cleared,
    this.occurredAt,
    this.bankName,
    this.accountSuffix,
    this.merchant,
    this.upiId,
    this.reference,
    this.availableBalancePaise,
    this.isRefund = false,
    this.counterpartySuffix,
    this.mentionsSelfTransfer = false,
    required this.confidence,
    required this.parserId,
  });

  ParsedTransaction copyWith({
    int? confidence,
    String? merchant,
    DateTime? occurredAt,
    String? bankName,
  }) => ParsedTransaction(
    amountPaise: amountPaise,
    direction: direction,
    channel: channel,
    status: status,
    occurredAt: occurredAt ?? this.occurredAt,
    bankName: bankName ?? this.bankName,
    accountSuffix: accountSuffix,
    merchant: merchant ?? this.merchant,
    upiId: upiId,
    reference: reference,
    availableBalancePaise: availableBalancePaise,
    isRefund: isRefund,
    counterpartySuffix: counterpartySuffix,
    mentionsSelfTransfer: mentionsSelfTransfer,
    confidence: confidence ?? this.confidence,
    parserId: parserId,
  );

  @override
  String toString() =>
      'ParsedTransaction($direction $amountPaise paise, bank=$bankName, acct=$accountSuffix, '
      'merchant=$merchant, upi=$upiId, ref=$reference, refund=$isRefund, '
      'status=$status, conf=$confidence, parser=$parserId)';
}

enum MessageClass { transaction, otp, promotional, informational, unknown }

class ClassificationResult {
  final MessageClass kind;
  final String reason;
  const ClassificationResult(this.kind, this.reason);
}
