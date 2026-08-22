class AgentAccountability {
  const AgentAccountability({
    required this.date,
    required this.amountGiven,
    required this.amountDisbursed,
    required this.amountCollected,
    required this.expectedCash,
    required this.formula,
  });

  final String date;

  final num amountGiven;
  final num amountDisbursed;
  final num amountCollected;

  final num expectedCash;

  final String formula;
}

class AgentDailyFloat {
  const AgentDailyFloat({
    required this.id,
    required this.agentId,
    required this.floatDate,
    required this.amountGiven,
    required this.recordedByName,
    required this.recordedAt,
    this.notes,
  });

  final String id;
  final String agentId;

  final String floatDate;

  final num amountGiven;

  final String? notes;

  final String recordedByName;
  final DateTime recordedAt;
}

class AgentDetail {
  const AgentDetail({
    required this.id,
    required this.name,
    required this.email,
    required this.status,
    required this.createdAt,
    required this.accountability,
    required this.collectionsToday,
    required this.collectionsLifetime,
    required this.applicationsToday,
    required this.applicationsLifetime,
    required this.amountCollectedLifetime,
    required this.amountDisbursedLifetime,
    this.publicId,
    this.phone,
    this.roleName,
    this.branchId,
    this.branchName,
    this.photoUrl,
    this.lastSignInAt,
    this.lastActiveAt,
    this.float,
  });

  final String id;
  final String? publicId;

  final String name;
  final String email;
  final String? phone;

  final String status;
  final String? roleName;

  final String? branchId;
  final String? branchName;

  final String? photoUrl;

  final DateTime createdAt;
  final DateTime? lastSignInAt;
  final DateTime? lastActiveAt;

  final AgentAccountability accountability;
  final AgentDailyFloat? float;

  final int collectionsToday;
  final int collectionsLifetime;

  final int applicationsToday;
  final int applicationsLifetime;

  final num amountCollectedLifetime;
  final num amountDisbursedLifetime;

  bool get isActive => status.toUpperCase() == 'ACTIVE';

  bool get isSuspended => status.toUpperCase() == 'SUSPENDED';

  bool get isInactive => status.toUpperCase() == 'INACTIVE';

  bool get hasFloat => float != null;

  bool get hasPhoto => photoUrl != null && photoUrl!.trim().isNotEmpty;

  num get expectedCash => accountability.expectedCash;
}
