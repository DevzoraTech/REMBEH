import 'dart:convert';

class BranchRelaySession {
  const BranchRelaySession({
    required this.sessionId,
    required this.tenantId,
    required this.branchId,
    required this.hostUserId,
    required this.hostName,
    required this.role,
    required this.createdAt,
    required this.expiresAt,
    required this.status,
    this.endpoint,
    this.pairedAt,
    this.lastActivityAt,
  });

  final String sessionId;
  final String tenantId;
  final String branchId;
  final String hostUserId;
  final String hostName;
  final String role;
  final String? endpoint;
  final DateTime createdAt;
  final DateTime expiresAt;
  final DateTime? pairedAt;
  final DateTime? lastActivityAt;
  final String status;

  bool get isExpired => !expiresAt.isAfter(DateTime.now().toUtc());

  Map<String, Object?> toMap() => {
    'session_id': sessionId,
    'tenant_id': tenantId,
    'branch_id': branchId,
    'host_user_id': hostUserId,
    'host_name': hostName,
    'role': role,
    'endpoint': endpoint,
    'created_at': createdAt.millisecondsSinceEpoch,
    'expires_at': expiresAt.millisecondsSinceEpoch,
    'paired_at': pairedAt?.millisecondsSinceEpoch,
    'last_activity_at': lastActivityAt?.millisecondsSinceEpoch,
    'status': status,
  };

  factory BranchRelaySession.fromMap(Map<String, Object?> map) {
    DateTime? nullableDate(String key) {
      final value = map[key] as int?;
      return value == null ? null : DateTime.fromMillisecondsSinceEpoch(value);
    }

    return BranchRelaySession(
      sessionId: map['session_id']! as String,
      tenantId: map['tenant_id']! as String,
      branchId: map['branch_id']! as String,
      hostUserId: map['host_user_id']! as String,
      hostName: map['host_name']! as String,
      role: map['role']! as String,
      endpoint: map['endpoint'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at']! as int),
      expiresAt: DateTime.fromMillisecondsSinceEpoch(map['expires_at']! as int),
      pairedAt: nullableDate('paired_at'),
      lastActivityAt: nullableDate('last_activity_at'),
      status: map['status']! as String,
    );
  }
}

/// Immutable local event. `occurredAt` is the operational date and time; it
/// is never rewritten when the relay receives or later uploads this record.
class BranchRelayEvent {
  const BranchRelayEvent({
    required this.eventId,
    required this.sessionId,
    required this.tenantId,
    required this.branchId,
    required this.actorUserId,
    required this.operationType,
    required this.localEntityId,
    required this.occurredAt,
    required this.payload,
    required this.payloadHash,
    required this.sourceDeviceId,
    required this.status,
    this.receivedAt,
  });

  final String eventId;
  final String sessionId;
  final String tenantId;
  final String branchId;
  final String actorUserId;
  final String operationType;
  final String localEntityId;
  final DateTime occurredAt;
  final DateTime? receivedAt;
  final Map<String, dynamic> payload;
  final String payloadHash;
  final String sourceDeviceId;
  final String status;

  Map<String, dynamic> toWire() => {
    'eventId': eventId,
    'tenantId': tenantId,
    'branchId': branchId,
    'actorUserId': actorUserId,
    'operationType': operationType,
    'localEntityId': localEntityId,
    'occurredAt': occurredAt.toUtc().toIso8601String(),
    'payload': payload,
    'payloadHash': payloadHash,
    'sourceDeviceId': sourceDeviceId,
  };

  String get wireJson => jsonEncode(toWire());

  factory BranchRelayEvent.fromWire({
    required String sessionId,
    required Map<String, dynamic> json,
  }) {
    return BranchRelayEvent(
      eventId: json['eventId'] as String,
      sessionId: sessionId,
      tenantId: json['tenantId'] as String,
      branchId: json['branchId'] as String,
      actorUserId: json['actorUserId'] as String,
      operationType: json['operationType'] as String,
      localEntityId: json['localEntityId'] as String,
      occurredAt: DateTime.parse(json['occurredAt'] as String).toUtc(),
      payload: Map<String, dynamic>.from(json['payload'] as Map),
      payloadHash: json['payloadHash'] as String,
      sourceDeviceId: json['sourceDeviceId'] as String,
      status: 'RECEIVED',
    );
  }
}

class BranchRelayTransfer {
  const BranchRelayTransfer({
    required this.transferId,
    required this.sessionId,
    required this.direction,
    required this.contentType,
    required this.contentId,
    required this.totalBytes,
    required this.acknowledgedBytes,
    required this.sha256,
    required this.createdAt,
    required this.updatedAt,
    required this.status,
  });

  final String transferId;
  final String sessionId;
  final String direction;
  final String contentType;
  final String contentId;
  final int totalBytes;
  final int acknowledgedBytes;
  final String sha256;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String status;

  bool get complete => acknowledgedBytes >= totalBytes || status == 'COMPLETED';
}
