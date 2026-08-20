/// Local loan application model for offline storage
class LoanApplicationLocal {
  final String? id; // Null until synced to server
  final String localId;
  final String tenantId;
  final String branchId;
  final String agentId;
  final String? customerId;
  final String status;
  final String? applicantNin;
  final String applicantFirstName;
  final String applicantLastName;
  final String applicantPhone;
  final String? applicantVillage;
  final double requestedAmount;
  final String loanProductId;
  final String? guarantorName;
  final String? guarantorPhone;
  final String? guarantorNin;
  final String? businessDescription;
  final DateTime createdAt;
  final DateTime? submittedAt;
  final DateTime? syncedAt;

  LoanApplicationLocal({
    this.id,
    required this.localId,
    required this.tenantId,
    required this.branchId,
    required this.agentId,
    this.customerId,
    required this.status,
    this.applicantNin,
    required this.applicantFirstName,
    required this.applicantLastName,
    required this.applicantPhone,
    this.applicantVillage,
    required this.requestedAmount,
    required this.loanProductId,
    this.guarantorName,
    this.guarantorPhone,
    this.guarantorNin,
    this.businessDescription,
    required this.createdAt,
    this.submittedAt,
    this.syncedAt,
  });

  /// Full name of applicant
  String get applicantFullName => '$applicantFirstName $applicantLastName';

  /// Is pending sync
  bool get isPendingSync => status == 'SUBMITTED' && syncedAt == null;

  /// Is draft
  bool get isDraft => status == 'DRAFT';

  /// Is synced
  bool get isSynced => syncedAt != null;

  /// Create from database map
  factory LoanApplicationLocal.fromMap(Map<String, dynamic> map) {
    return LoanApplicationLocal(
      id: map['id'] as String?,
      localId: map['local_id'] as String,
      tenantId: map['tenant_id'] as String,
      branchId: map['branch_id'] as String,
      agentId: map['agent_id'] as String,
      customerId: map['customer_id'] as String?,
      status: map['status'] as String,
      applicantNin: map['applicant_nin'] as String?,
      applicantFirstName: map['applicant_first_name'] as String,
      applicantLastName: map['applicant_last_name'] as String,
      applicantPhone: map['applicant_phone'] as String,
      applicantVillage: map['applicant_village'] as String?,
      requestedAmount: map['requested_amount'] as double,
      loanProductId: map['loan_product_id'] as String,
      guarantorName: map['guarantor_name'] as String?,
      guarantorPhone: map['guarantor_phone'] as String?,
      guarantorNin: map['guarantor_nin'] as String?,
      businessDescription: map['business_description'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      submittedAt: map['submitted_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['submitted_at'] as int)
          : null,
      syncedAt: map['synced_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['synced_at'] as int)
          : null,
    );
  }

  /// Convert to database map
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'local_id': localId,
      'tenant_id': tenantId,
      'branch_id': branchId,
      'agent_id': agentId,
      'customer_id': customerId,
      'status': status,
      'applicant_nin': applicantNin,
      'applicant_first_name': applicantFirstName,
      'applicant_last_name': applicantLastName,
      'applicant_phone': applicantPhone,
      'applicant_village': applicantVillage,
      'requested_amount': requestedAmount,
      'loan_product_id': loanProductId,
      'guarantor_name': guarantorName,
      'guarantor_phone': guarantorPhone,
      'guarantor_nin': guarantorNin,
      'business_description': businessDescription,
      'created_at': createdAt.millisecondsSinceEpoch,
      'submitted_at': submittedAt?.millisecondsSinceEpoch,
      'synced_at': syncedAt?.millisecondsSinceEpoch,
    };
  }

  /// Copy with updated fields
  LoanApplicationLocal copyWith({
    String? id,
    String? status,
    DateTime? submittedAt,
    DateTime? syncedAt,
  }) {
    return LoanApplicationLocal(
      id: id ?? this.id,
      localId: localId,
      tenantId: tenantId,
      branchId: branchId,
      agentId: agentId,
      customerId: customerId,
      status: status ?? this.status,
      applicantNin: applicantNin,
      applicantFirstName: applicantFirstName,
      applicantLastName: applicantLastName,
      applicantPhone: applicantPhone,
      applicantVillage: applicantVillage,
      requestedAmount: requestedAmount,
      loanProductId: loanProductId,
      guarantorName: guarantorName,
      guarantorPhone: guarantorPhone,
      guarantorNin: guarantorNin,
      businessDescription: businessDescription,
      createdAt: createdAt,
      submittedAt: submittedAt ?? this.submittedAt,
      syncedAt: syncedAt ?? this.syncedAt,
    );
  }
}
