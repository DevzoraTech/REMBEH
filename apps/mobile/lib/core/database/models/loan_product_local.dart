/// Local loan product model for offline storage
class LoanProductLocal {
  final String id;
  final String tenantId;
  final String name;
  final double minAmount;
  final double maxAmount;
  final double interestRate;
  final int minTerm;
  final int maxTerm;
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
    required this.minTerm,
    required this.maxTerm,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Create from database map
  factory LoanProductLocal.fromMap(Map<String, dynamic> map) {
    return LoanProductLocal(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      name: map['name'] as String,
      minAmount: map['min_amount'] as double,
      maxAmount: map['max_amount'] as double,
      interestRate: map['interest_rate'] as double,
      minTerm: map['min_term'] as int,
      maxTerm: map['max_term'] as int,
      isActive: (map['is_active'] as int) == 1,
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
      'min_term': minTerm,
      'max_term': maxTerm,
      'is_active': isActive ? 1 : 0,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  /// Create from API JSON
  factory LoanProductLocal.fromJson(Map<String, dynamic> json) {
    return LoanProductLocal(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      name: json['name'] as String,
      minAmount: (json['minAmount'] as num).toDouble(),
      maxAmount: (json['maxAmount'] as num).toDouble(),
      interestRate: (json['interestRate'] as num).toDouble(),
      minTerm: json['minTerm'] as int,
      maxTerm: json['maxTerm'] as int,
      isActive: json['isActive'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
