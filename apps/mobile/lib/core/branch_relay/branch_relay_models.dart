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

/// A manager-created immutable branch view. The label is readable in the
/// Sync Centre while the id is used by the relay protocol.
class BranchRelayDistribution {
  const BranchRelayDistribution({
    required this.distributionId,
    required this.tenantId,
    required this.branchId,
    required this.versionLabel,
    required this.sequence,
    required this.businessDay,
    required this.cutoffAt,
    required this.createdAt,
    required this.createdByUserId,
    required this.status,
    this.previousDistributionId,
  });

  final String distributionId;
  final String tenantId;
  final String branchId;
  final String versionLabel;
  final int sequence;
  final String businessDay;
  final DateTime cutoffAt;
  final DateTime createdAt;
  final String createdByUserId;
  final String? previousDistributionId;
  final String status;

  Map<String, Object?> toMap() => {
    'distribution_id': distributionId,
    'tenant_id': tenantId,
    'branch_id': branchId,
    'version_label': versionLabel,
    'sequence': sequence,
    'business_day': businessDay,
    'cutoff_at': cutoffAt.millisecondsSinceEpoch,
    'created_at': createdAt.millisecondsSinceEpoch,
    'created_by_user_id': createdByUserId,
    'previous_distribution_id': previousDistributionId,
    'status': status,
  };

  factory BranchRelayDistribution.fromMap(Map<String, Object?> map) =>
      BranchRelayDistribution(
        distributionId: map['distribution_id']! as String,
        tenantId: map['tenant_id']! as String,
        branchId: map['branch_id']! as String,
        versionLabel: map['version_label']! as String,
        sequence: map['sequence']! as int,
        businessDay: map['business_day']! as String,
        cutoffAt: DateTime.fromMillisecondsSinceEpoch(
          map['cutoff_at']! as int,
        ).toUtc(),
        createdAt: DateTime.fromMillisecondsSinceEpoch(
          map['created_at']! as int,
        ).toUtc(),
        createdByUserId: map['created_by_user_id']! as String,
        previousDistributionId: map['previous_distribution_id'] as String?,
        status: map['status']! as String,
      );
}

/// Delivery state for one manager-created distribution and one field officer.
/// Unlike live relay participant updates, this survives an app restart.
class BranchRelayDistributionOffer {
  const BranchRelayDistributionOffer({
    required this.distributionId,
    required this.deviceId,
    required this.status,
    required this.offeredAt,
    required this.updatedAt,
    this.officerUserId,
    this.officerName,
    this.acceptedAt,
    this.completedAt,
  });

  final String distributionId;
  final String deviceId;
  final String? officerUserId;
  final String? officerName;
  final String status;
  final DateTime offeredAt;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final DateTime updatedAt;

  factory BranchRelayDistributionOffer.fromMap(Map<String, Object?> map) {
    DateTime? date(String key) {
      final value = map[key] as num?;
      return value == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(value.toInt()).toUtc();
    }

    return BranchRelayDistributionOffer(
      distributionId: map['distribution_id']! as String,
      deviceId: map['device_id']! as String,
      officerUserId: map['officer_user_id'] as String?,
      officerName: map['officer_name'] as String?,
      status: map['status']! as String,
      offeredAt: date('offered_at')!,
      acceptedAt: date('accepted_at'),
      completedAt: date('completed_at'),
      updatedAt: date('updated_at')!,
    );
  }
}

/// Ephemeral status sent over the local encrypted relay channel. It exists
/// only while the manager is hosting, so it never becomes another source of
/// truth for branch records.
class BranchRelayParticipant {
  const BranchRelayParticipant({
    required this.deviceId,
    this.userId,
    required this.name,
    required this.role,
    required this.phase,
    required this.received,
    required this.total,
    required this.updatedAt,
  });

  final String deviceId;
  final String? userId;
  final String name;
  final String role;
  final String phase;
  final int received;
  final int total;
  final DateTime updatedAt;

  double get progress => total <= 0 ? 0 : (received / total).clamp(0, 1);

  factory BranchRelayParticipant.fromWire(Map<String, dynamic> value) {
    return BranchRelayParticipant(
      deviceId: value['deviceId'] as String,
      userId: value['userId'] as String?,
      name: value['name'] as String,
      role: value['role'] as String? ?? 'Field officer',
      phase: value['phase'] as String? ?? 'Preparing',
      received: (value['received'] as num?)?.toInt() ?? 0,
      total: (value['total'] as num?)?.toInt() ?? 0,
      updatedAt:
          DateTime.tryParse(value['updatedAt'] as String? ?? '')?.toLocal() ??
          DateTime.now(),
    );
  }
}

/// A field officer included in the manager's collection decision for a local
/// sharing session. A manager must account for every active officer before a
/// frozen distribution is created.
class BranchRelayCollectionOfficer {
  const BranchRelayCollectionOfficer({
    required this.agentId,
    required this.name,
    required this.status,
  });

  final String agentId;
  final String name;
  final String status;

  bool get isReceived => status == 'RECEIVED';
  bool get isSkipped => status == 'SKIPPED';
  bool get isReady => status == 'READY';
  bool get isReceiving => status == 'RECEIVING';
  bool get isResolved => isReceived || isSkipped;
}
