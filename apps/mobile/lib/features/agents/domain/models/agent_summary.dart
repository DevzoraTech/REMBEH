class AgentSummary {
  const AgentSummary({
    required this.id,
    required this.name,
    required this.email,
    required this.status,
    required this.createdAt,
    required this.collectionsToday,
    required this.collectionsLifetime,
    required this.applicationsToday,
    required this.applicationsLifetime,
    required this.amountCollectedLifetime,
    required this.amountDisbursedLifetime,
    required this.amountCollectedToday,
    required this.amountDisbursedToday,
    this.publicId,
    this.phone,
    this.roleName,
    this.branchId,
    this.branchName,
    this.photoUrl,
    this.lastActiveAt,
    this.floatToday,
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
  final DateTime? lastActiveAt;

  final int collectionsToday;
  final int collectionsLifetime;

  final int applicationsToday;
  final int applicationsLifetime;

  final num amountCollectedLifetime;
  final num amountDisbursedLifetime;

  final num amountCollectedToday;
  final num amountDisbursedToday;

  final num? floatToday;

  bool get isActive => status.toUpperCase() == 'ACTIVE';

  bool get isSuspended => status.toUpperCase() == 'SUSPENDED';

  bool get isInactive => status.toUpperCase() == 'INACTIVE';

  bool get isInvited => status.toUpperCase() == 'INVITED';

  bool get isPendingVerification =>
      status.toUpperCase() == 'PENDING_VERIFICATION';

  bool get hasPhoto => photoUrl != null && photoUrl!.trim().isNotEmpty;

  bool get hasActivity => collectionsLifetime > 0 || applicationsLifetime > 0;

  num get activityValueToday => amountCollectedToday + amountDisbursedToday;
}
