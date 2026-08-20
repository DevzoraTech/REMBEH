/// Pending operation for upload queue
class PendingOperation {
  final int? id;
  final String operationType;
  final String localEntityId;
  final String payload;
  final DateTime createdAt;
  final int retryCount;
  final String? lastError;
  final String status;

  PendingOperation({
    this.id,
    required this.operationType,
    required this.localEntityId,
    required this.payload,
    required this.createdAt,
    this.retryCount = 0,
    this.lastError,
    required this.status,
  });

  /// Create from database map
  factory PendingOperation.fromMap(Map<String, dynamic> map) {
    return PendingOperation(
      id: map['id'] as int?,
      operationType: map['operation_type'] as String,
      localEntityId: map['local_entity_id'] as String,
      payload: map['payload'] as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      retryCount: map['retry_count'] as int,
      lastError: map['last_error'] as String?,
      status: map['status'] as String,
    );
  }

  /// Convert to database map
  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'operation_type': operationType,
      'local_entity_id': localEntityId,
      'payload': payload,
      'created_at': createdAt.millisecondsSinceEpoch,
      'retry_count': retryCount,
      'last_error': lastError,
      'status': status,
    };
  }

  /// Copy with updated fields
  PendingOperation copyWith({
    int? retryCount,
    String? lastError,
    String? status,
  }) {
    return PendingOperation(
      id: id,
      operationType: operationType,
      localEntityId: localEntityId,
      payload: payload,
      createdAt: createdAt,
      retryCount: retryCount ?? this.retryCount,
      lastError: lastError ?? this.lastError,
      status: status ?? this.status,
    );
  }
}

/// Operation types
class OperationType {
  static const String loanApplicationCreate = 'LOAN_APPLICATION_CREATE';
  static const String collectionCreate = 'COLLECTION_CREATE';
  static const String paymentCreate = 'PAYMENT_CREATE';
  static const String agentDayClose = 'AGENT_DAY_CLOSE';
  static const String mediaUpload = 'MEDIA_UPLOAD';
}

/// Operation status
class OperationStatus {
  static const String pending = 'PENDING';
  static const String uploading = 'UPLOADING';
  static const String uploaded = 'UPLOADED';
  static const String failed = 'FAILED';
  static const String conflict = 'CONFLICT';
}
