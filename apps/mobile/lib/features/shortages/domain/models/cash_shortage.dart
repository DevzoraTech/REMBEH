class ShortageEmployeeOption {
  const ShortageEmployeeOption({
    required this.userId,
    required this.name,
    required this.outstanding,
  });

  final String userId;
  final String name;
  final num outstanding;
}

class CashShortagePayment {
  const CashShortagePayment({
    required this.id,
    required this.amount,
    required this.method,
    required this.paidAt,
    this.notes,
    this.recordedByName,
  });

  final String id;
  final num amount;
  final String method;
  final DateTime? paidAt;
  final String? notes;
  final String? recordedByName;
}

class CashShortage {
  const CashShortage({
    required this.id,
    required this.amountOriginal,
    required this.amountOutstanding,
    required this.amountPaid,
    required this.status,
    required this.payments,
    this.branchId,
    this.branchName,
    this.responsibleUserId,
    this.responsibleName,
    this.responsiblePublicId,
    this.responsiblePhotoUrl,
    this.createdByName,
    this.sourceType,
    this.sourceId,
    this.reason,
    this.operationDate,
    this.notes,
    this.createdAt,
    this.clearedAt,
  });

  final String id;
  final String? branchId;
  final String? branchName;
  final String? responsibleUserId;
  final String? responsibleName;
  final String? responsiblePublicId;
  final String? responsiblePhotoUrl;
  final String? createdByName;
  final String? sourceType;
  final String? sourceId;
  final String? reason;
  final DateTime? operationDate;
  final num amountOriginal;
  final num amountOutstanding;
  final num amountPaid;
  final String status;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? clearedAt;
  final List<CashShortagePayment> payments;

  bool get isOpen {
    final normalized = status.trim().toUpperCase();

    return normalized != 'CLEARED' &&
        normalized != 'CLOSED' &&
        normalized != 'RESOLVED';
  }

  bool get isClosed => !isOpen;
}
