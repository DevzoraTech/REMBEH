class LoanDisbursementRecord {
  const LoanDisbursementRecord({
    required this.id,
    required this.loanId,
    required this.amount,
    required this.assignedFloatAmount,
    required this.collectedRepaymentsAmount,
    required this.source,
    required this.disbursedAt,
    required this.recordedByName,
    this.recordedByPublicId,
    this.note,
  });

  final String id;
  final String loanId;
  final int amount;
  final int assignedFloatAmount;
  final int collectedRepaymentsAmount;
  final String source;
  final DateTime disbursedAt;
  final String recordedByName;
  final String? recordedByPublicId;
  final String? note;

  factory LoanDisbursementRecord.fromJson(Map<String, dynamic> json) {
    return LoanDisbursementRecord(
      id: _string(json['id']) ?? '',
      loanId: _string(json['loanId']) ?? '',
      amount: _int(json['amount']),
      assignedFloatAmount: _int(json['assignedFloatAmount']),
      collectedRepaymentsAmount: _int(json['collectedRepaymentsAmount']),
      source: _string(json['source']) ?? 'ASSIGNED_FLOAT',
      disbursedAt: _date(json['disbursedAt']) ?? DateTime.now(),
      recordedByName: _string(json['recordedByName']) ?? 'Staff member',
      recordedByPublicId: _string(json['recordedByPublicId']),
      note: _string(json['note']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'loanId': loanId,
      'amount': amount,
      'assignedFloatAmount': assignedFloatAmount,
      'collectedRepaymentsAmount': collectedRepaymentsAmount,
      'source': source,
      'disbursedAt': disbursedAt.toIso8601String(),
      'recordedByName': recordedByName,
      'recordedByPublicId': recordedByPublicId,
      'note': note,
    };
  }
}

class PendingDisbursement {
  const PendingDisbursement({
    required this.loanId,
    required this.customerId,
    required this.borrowerName,
    required this.phone,
    required this.branchId,
    required this.agreedAmount,
    required this.disbursedAmount,
    required this.remainingAmount,
    required this.percentDisbursed,
    required this.disbursementCount,
    required this.createdAt,
    required this.disbursements,
    this.applicationId,
    this.branchName,
    this.lastDisbursementAt,
    this.lastDisbursementAmount,
    this.issuedByName,
    this.issuedByPublicId,
    this.status = 'PARTIALLY_DISBURSED',
  });

  final String loanId;
  final String? applicationId;
  final String customerId;
  final String borrowerName;
  final String phone;
  final String branchId;
  final String? branchName;
  final int agreedAmount;
  final int disbursedAmount;
  final int remainingAmount;
  final int percentDisbursed;
  final int disbursementCount;
  final DateTime? lastDisbursementAt;
  final int? lastDisbursementAmount;
  final String? issuedByName;
  final String? issuedByPublicId;
  final String status;
  final DateTime createdAt;
  final List<LoanDisbursementRecord> disbursements;

  String get initials {
    final parts = borrowerName
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'CL';
    if (parts.length == 1) {
      return parts.first
          .substring(0, parts.first.length.clamp(0, 2))
          .toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }

  PendingDisbursement copyWith({
    int? disbursedAmount,
    int? remainingAmount,
    int? percentDisbursed,
    int? disbursementCount,
    DateTime? lastDisbursementAt,
    int? lastDisbursementAmount,
    List<LoanDisbursementRecord>? disbursements,
  }) {
    return PendingDisbursement(
      loanId: loanId,
      applicationId: applicationId,
      customerId: customerId,
      borrowerName: borrowerName,
      phone: phone,
      branchId: branchId,
      branchName: branchName,
      agreedAmount: agreedAmount,
      disbursedAmount: disbursedAmount ?? this.disbursedAmount,
      remainingAmount: remainingAmount ?? this.remainingAmount,
      percentDisbursed: percentDisbursed ?? this.percentDisbursed,
      disbursementCount: disbursementCount ?? this.disbursementCount,
      lastDisbursementAt: lastDisbursementAt ?? this.lastDisbursementAt,
      lastDisbursementAmount:
          lastDisbursementAmount ?? this.lastDisbursementAmount,
      issuedByName: issuedByName,
      issuedByPublicId: issuedByPublicId,
      status: status,
      createdAt: createdAt,
      disbursements: disbursements ?? this.disbursements,
    );
  }

  factory PendingDisbursement.fromJson(Map<String, dynamic> json) {
    final disbursements = (json['disbursements'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(LoanDisbursementRecord.fromJson)
        .toList(growable: false);

    return PendingDisbursement(
      loanId: _string(json['loanId']) ?? '',
      applicationId: _string(json['applicationId']),
      customerId: _string(json['customerId']) ?? '',
      borrowerName: _string(json['borrowerName']) ?? 'Borrower',
      phone: _string(json['phone']) ?? '',
      branchId: _string(json['branchId']) ?? '',
      branchName: _string(json['branchName']),
      agreedAmount: _int(json['agreedAmount']),
      disbursedAmount: _int(json['disbursedAmount']),
      remainingAmount: _int(json['remainingAmount']),
      percentDisbursed: _int(json['percentDisbursed']),
      disbursementCount: _int(json['disbursementCount']),
      lastDisbursementAt: _date(json['lastDisbursementAt']),
      lastDisbursementAmount: _nullableInt(json['lastDisbursementAmount']),
      issuedByName: _string(json['issuedByName']),
      issuedByPublicId: _string(json['issuedByPublicId']),
      status: _string(json['status']) ?? 'PARTIALLY_DISBURSED',
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
      disbursements: disbursements,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'loanId': loanId,
      'applicationId': applicationId,
      'customerId': customerId,
      'borrowerName': borrowerName,
      'phone': phone,
      'branchId': branchId,
      'branchName': branchName,
      'agreedAmount': agreedAmount,
      'disbursedAmount': disbursedAmount,
      'remainingAmount': remainingAmount,
      'percentDisbursed': percentDisbursed,
      'disbursementCount': disbursementCount,
      'lastDisbursementAt': lastDisbursementAt?.toIso8601String(),
      'lastDisbursementAmount': lastDisbursementAmount,
      'issuedByName': issuedByName,
      'issuedByPublicId': issuedByPublicId,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
      'disbursements': disbursements.map((item) => item.toJson()).toList(),
    };
  }
}

class PendingDisbursementSummary {
  const PendingDisbursementSummary({
    required this.borrowersCount,
    required this.totalRemaining,
  });

  final int borrowersCount;
  final int totalRemaining;

  factory PendingDisbursementSummary.fromJson(Map<String, dynamic>? json) {
    return PendingDisbursementSummary(
      borrowersCount: _int(json?['borrowersCount']),
      totalRemaining: _int(json?['totalRemaining']),
    );
  }
}

class PendingDisbursementsResponse {
  const PendingDisbursementsResponse({
    required this.summary,
    required this.items,
  });

  final PendingDisbursementSummary summary;
  final List<PendingDisbursement> items;

  factory PendingDisbursementsResponse.fromJson(Map<String, dynamic> json) {
    return PendingDisbursementsResponse(
      summary: PendingDisbursementSummary.fromJson(
        json['summary'] as Map<String, dynamic>?,
      ),
      items: (json['pendingDisbursements'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PendingDisbursement.fromJson)
          .toList(growable: false),
    );
  }
}

String? _string(Object? value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty) return null;
  return text;
}

int _int(Object? value) => _nullableInt(value) ?? 0;

int? _nullableInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString().replaceAll(',', '').trim() ?? '');
}

DateTime? _date(Object? value) {
  if (value is DateTime) return value;
  final text = _string(value);
  if (text == null) return null;
  return DateTime.tryParse(text)?.toLocal();
}
