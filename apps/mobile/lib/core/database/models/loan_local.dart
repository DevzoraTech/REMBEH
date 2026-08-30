/// Local loan model for offline storage
class LoanLocal {
  final String id;
  final String tenantId;
  final String branchId;
  final String customerId;
  final String loanProductId;
  final double principal;
  final double interestRate;
  final int termMonths;
  final double installmentAmount;
  final String status;
  final DateTime? disbursedAt;
  final DateTime? maturityDate;
  final double? outstandingBalance;
  final double? totalPaid;
  final double disbursedAmount;
  final double pendingDisbursementAmount;
  final int disbursementCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  LoanLocal({
    required this.id,
    required this.tenantId,
    required this.branchId,
    required this.customerId,
    required this.loanProductId,
    required this.principal,
    required this.interestRate,
    required this.termMonths,
    required this.installmentAmount,
    required this.status,
    this.disbursedAt,
    this.maturityDate,
    this.outstandingBalance,
    this.totalPaid,
    this.disbursedAmount = 0,
    this.pendingDisbursementAmount = 0,
    this.disbursementCount = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Is loan active
  bool get isActive => status == 'ACTIVE';

  /// Is loan overdue
  bool get isOverdue => status == 'OVERDUE';

  /// Is loan completed
  bool get isCompleted => status == 'COMPLETED';

  /// Create from database map
  factory LoanLocal.fromMap(Map<String, dynamic> map) {
    return LoanLocal(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      branchId: map['branch_id'] as String,
      customerId: map['customer_id'] as String,
      loanProductId: map['loan_product_id'] as String,
      principal: map['principal'] as double,
      interestRate: map['interest_rate'] as double,
      termMonths: map['term_months'] as int,
      installmentAmount: map['installment_amount'] as double,
      status: map['status'] as String,
      disbursedAt: map['disbursed_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['disbursed_at'] as int)
          : null,
      maturityDate: map['maturity_date'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['maturity_date'] as int)
          : null,
      outstandingBalance: map['outstanding_balance'] as double?,
      totalPaid: map['total_paid'] as double?,
      disbursedAmount: _double(map['disbursed_amount']),
      pendingDisbursementAmount: _double(map['pending_disbursement_amount']),
      disbursementCount: _int(map['disbursement_count']) ?? 0,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(map['updated_at'] as int),
    );
  }

  /// Convert to database map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'branch_id': branchId,
      'customer_id': customerId,
      'loan_product_id': loanProductId,
      'principal': principal,
      'interest_rate': interestRate,
      'term_months': termMonths,
      'installment_amount': installmentAmount,
      'status': status,
      'disbursed_at': disbursedAt?.millisecondsSinceEpoch,
      'maturity_date': maturityDate?.millisecondsSinceEpoch,
      'outstanding_balance': outstandingBalance,
      'total_paid': totalPaid,
      'disbursed_amount': disbursedAmount,
      'pending_disbursement_amount': pendingDisbursementAmount,
      'disbursement_count': disbursementCount,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  /// Create from API JSON
  factory LoanLocal.fromJson(Map<String, dynamic> json) {
    final application = json['application'] is Map<String, dynamic>
        ? json['application'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final principal = _double(json['principal']);
    final disbursed = _double(json['disbursedAmount']);
    final double pendingDisbursement = json['pendingDisbursementAmount'] != null
        ? _double(json['pendingDisbursementAmount'])
        : (principal - disbursed <= 0 ? 0 : principal - disbursed).toDouble();
    final outstanding = _double(json['outstandingBalance'] ?? json['balance']);
    return LoanLocal(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      branchId: json['branchId'] as String,
      customerId: json['customerId'] as String,
      loanProductId:
          _text(json['loanProductId']) ??
          _text(application['loanProductTemplateId']) ??
          '',
      principal: principal,
      interestRate: _double(
        json['interestRate'] ?? application['interestRatePercent'],
      ),
      termMonths:
          _int(json['termMonths']) ??
          ((_int(application['durationDays']) ?? 30) / 30).ceil(),
      installmentAmount: _double(json['installmentAmount']),
      status: _localStatus(_text(json['status']) ?? 'ACTIVE'),
      disbursedAt: json['disbursedAt'] != null
          ? DateTime.parse(json['disbursedAt'] as String)
          : null,
      maturityDate: json['maturityDate'] != null
          ? DateTime.parse(json['maturityDate'] as String)
          : null,
      outstandingBalance: outstanding,
      totalPaid: json['totalPaid'] != null
          ? _double(json['totalPaid'])
          : principal > outstanding
          ? principal - outstanding
          : 0,
      disbursedAmount: disbursed,
      pendingDisbursementAmount: pendingDisbursement,
      disbursementCount: _int(json['disbursementCount']) ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

String _localStatus(String status) {
  switch (status.toUpperCase()) {
    case 'CURRENT':
    case 'DISBURSED':
      return 'ACTIVE';
    case 'IN_ARREARS':
      return 'OVERDUE';
    case 'PAID_OFF':
    case 'CLOSED':
      return 'COMPLETED';
    default:
      return status.toUpperCase();
  }
}

String? _text(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int? _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}
