class AgentDayStatus {
  const AgentDayStatus({
    required this.date,
    required this.canUseApp,
    required this.float,
    this.branch,
    this.branchStatus,
    this.lockReason,
    this.lockTitle,
    this.lockMessage,
  });

  final String date;
  final AgentDayBranch? branch;
  final String? branchStatus;
  final bool canUseApp;
  final String? lockReason;
  final String? lockTitle;
  final String? lockMessage;
  final AgentDayFloatSummary float;

  factory AgentDayStatus.fromApi(Map<String, dynamic> json) {
    final branch = json['branch'] as Map<String, dynamic>?;
    return AgentDayStatus(
      date: json['date'] as String? ?? '',
      branch: branch == null ? null : AgentDayBranch.fromApi(branch),
      branchStatus: json['branchStatus'] as String?,
      canUseApp: json['canUseApp'] as bool? ?? false,
      lockReason: json['lockReason'] as String?,
      lockTitle: json['lockTitle'] as String?,
      lockMessage: json['lockMessage'] as String?,
      float: AgentDayFloatSummary.fromApi(
        json['float'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AgentDayBranch {
  const AgentDayBranch({
    required this.id,
    required this.name,
    required this.address,
  });

  final String id;
  final String name;
  final String address;

  factory AgentDayBranch.fromApi(Map<String, dynamic> json) {
    return AgentDayBranch(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      address: json['address'] as String? ?? '',
    );
  }
}

class AgentDayFloatSummary {
  const AgentDayFloatSummary({
    required this.amountReceived,
    required this.amountDisbursed,
    required this.amountCollected,
    required this.unusedFloat,
    required this.expectedHandover,
    this.amountReturned,
    this.returnedAt,
  });

  final int amountReceived;
  final int amountDisbursed;
  final int amountCollected;
  final int unusedFloat;
  final int expectedHandover;
  final int? amountReturned;
  final DateTime? returnedAt;

  factory AgentDayFloatSummary.fromApi(Map<String, dynamic> json) {
    return AgentDayFloatSummary(
      amountReceived: _asMoney(json['amountReceived']),
      amountDisbursed: _asMoney(json['amountDisbursed']),
      amountCollected: _asMoney(json['amountCollected']),
      unusedFloat: _asMoney(json['unusedFloat']),
      expectedHandover: _asMoney(json['expectedHandover']),
      amountReturned: json['amountReturned'] == null
          ? null
          : _asMoney(json['amountReturned']),
      returnedAt: DateTime.tryParse(json['returnedAt'] as String? ?? ''),
    );
  }
}

int _asMoney(Object? value) {
  if (value is num) return value.round();
  if (value is String) return (num.tryParse(value) ?? 0).round();
  return 0;
}
