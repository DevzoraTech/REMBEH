/// Local loan product model for offline storage
class LoanProductLocal {
  final String id;
  final String tenantId;
  final String name;
  final double minAmount;
  final double maxAmount;
  final double interestRate;
  final String interestType;
  final int minTerm;
  final int maxTerm;
  final int termValue;
  final String termUnit;
  final int durationDays;
  final String repaymentFrequency;
  final String processingFeeType;
  final double processingFeePercent;
  final double? processingFeeFixedAmount;
  final double penaltyRatePercent;
  final int finePeriodDays;
  final String paymentStartPolicy;
  final int? paymentStartDelayDays;
  final bool allowAgentDatePick;
  final String? description;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  LoanProductLocal({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.minAmount,
    required this.maxAmount,
    required this.interestRate,
    required this.interestType,
    required this.minTerm,
    required this.maxTerm,
    required this.termValue,
    required this.termUnit,
    required this.durationDays,
    required this.repaymentFrequency,
    required this.processingFeeType,
    required this.processingFeePercent,
    required this.processingFeeFixedAmount,
    required this.penaltyRatePercent,
    required this.finePeriodDays,
    required this.paymentStartPolicy,
    required this.paymentStartDelayDays,
    required this.allowAgentDatePick,
    required this.description,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Create from database map
  factory LoanProductLocal.fromMap(Map<String, dynamic> map) {
    final minTerm = _int(map['min_term']) ?? 0;
    final maxTerm = _int(map['max_term']) ?? minTerm;

    return LoanProductLocal(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      name: map['name'] as String,
      minAmount: _double(map['min_amount']),
      maxAmount: _double(map['max_amount']),
      interestRate: _double(map['interest_rate']),
      interestType: _text(map['interest_type']) ?? 'FLAT',
      minTerm: minTerm,
      maxTerm: maxTerm,
      termValue: _int(map['term_value']) ?? maxTerm,
      termUnit: _text(map['term_unit']) ?? 'DAYS',
      durationDays: _int(map['duration_days']) ?? maxTerm,
      repaymentFrequency: _text(map['repayment_frequency']) ?? 'DAILY',
      processingFeeType: _text(map['processing_fee_type']) ?? 'PERCENTAGE',
      processingFeePercent: _double(map['processing_fee_percent']),
      processingFeeFixedAmount: _nullableDouble(
        map['processing_fee_fixed_amount'],
      ),
      penaltyRatePercent: _double(map['penalty_rate_percent']),
      finePeriodDays: _int(map['fine_period_days']) ?? 10,
      paymentStartPolicy: _text(map['payment_start_policy']) ?? 'NEXT_DAY',
      paymentStartDelayDays: _int(map['payment_start_delay_days']),
      allowAgentDatePick: (_int(map['allow_agent_date_pick']) ?? 0) == 1,
      description: _text(map['description']),
      isActive: (_int(map['is_active']) ?? 1) == 1,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(map['updated_at'] as int),
    );
  }

  /// Convert to database map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'name': name,
      'min_amount': minAmount,
      'max_amount': maxAmount,
      'interest_rate': interestRate,
      'interest_type': interestType,
      'min_term': minTerm,
      'max_term': maxTerm,
      'term_value': termValue,
      'term_unit': termUnit,
      'duration_days': durationDays,
      'repayment_frequency': repaymentFrequency,
      'processing_fee_type': processingFeeType,
      'processing_fee_percent': processingFeePercent,
      'processing_fee_fixed_amount': processingFeeFixedAmount,
      'penalty_rate_percent': penaltyRatePercent,
      'fine_period_days': finePeriodDays,
      'payment_start_policy': paymentStartPolicy,
      'payment_start_delay_days': paymentStartDelayDays,
      'allow_agent_date_pick': allowAgentDatePick ? 1 : 0,
      'description': description,
      'is_active': isActive ? 1 : 0,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  /// Create from API JSON
  factory LoanProductLocal.fromJson(Map<String, dynamic> json) {
    final term = _int(json['termValue']) ?? _int(json['durationDays']) ?? 1;
    final durationDays = _int(json['durationDays']) ?? term;
    return LoanProductLocal(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      name: json['name'] as String,
      minAmount: _double(json['minAmount'] ?? json['minLoanAmount']),
      maxAmount: _double(json['maxAmount'] ?? json['maxLoanAmount']),
      interestRate: _double(
        json['interestRate'] ?? json['interestRatePercent'],
      ),
      interestType: _text(json['interestType']) ?? 'FLAT',
      minTerm: _int(json['minTerm']) ?? durationDays,
      maxTerm: _int(json['maxTerm']) ?? durationDays,
      termValue: term,
      termUnit: _text(json['termUnit']) ?? 'DAYS',
      durationDays: durationDays,
      repaymentFrequency: _text(json['repaymentFrequency']) ?? 'DAILY',
      processingFeeType: _text(json['processingFeeType']) ?? 'PERCENTAGE',
      processingFeePercent: _double(json['processingFeePercent']),
      processingFeeFixedAmount: _nullableDouble(
        json['processingFeeFixedAmount'],
      ),
      penaltyRatePercent: _double(json['penaltyRatePercent']),
      finePeriodDays: _int(json['finePeriodDays']) ?? 10,
      paymentStartPolicy: _text(json['paymentStartPolicy']) ?? 'NEXT_DAY',
      paymentStartDelayDays: _int(json['paymentStartDelayDays']),
      allowAgentDatePick: json['allowAgentDatePick'] as bool? ?? false,
      description: _text(json['description']),
      isActive: json['isActive'] as bool? ?? true,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

double? _nullableDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int? _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}

String? _text(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}
