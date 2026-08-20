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
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  /// Create from API JSON
  factory LoanLocal.fromJson(Map<String, dynamic> json) {
    return LoanLocal(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      branchId: json['branchId'] as String,
      customerId: json['customerId'] as String,
      loanProductId: json['loanProductId'] as String,
      principal: (json['principal'] as num).toDouble(),
      interestRate: (json['interestRate'] as num).toDouble(),
      termMonths: json['termMonths'] as int,
      installmentAmount: (json['installmentAmount'] as num).toDouble(),
      status: json['status'] as String,
      disbursedAt: json['disbursedAt'] != null
          ? DateTime.parse(json['disbursedAt'] as String)
          : null,
      maturityDate: json['maturityDate'] != null
          ? DateTime.parse(json['maturityDate'] as String)
          : null,
      outstandingBalance: json['outstandingBalance'] != null
          ? (json['outstandingBalance'] as num).toDouble()
          : null,
      totalPaid: json['totalPaid'] != null
          ? (json['totalPaid'] as num).toDouble()
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
