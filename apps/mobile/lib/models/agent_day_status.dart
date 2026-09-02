class AgentDayStatus {
  const AgentDayStatus({
    required this.date,
    required this.canUseApp,
    required this.canBrowseClients,
    required this.float,
    this.branch,
    this.branchStatus,
    this.lockReason,
    this.lockTitle,
    this.lockMessage,
    this.canRecordExpense = false,
  });

  final String date;
  final AgentDayBranch? branch;
  final String? branchStatus;
  final bool canUseApp;
  final bool canBrowseClients;
  final String? lockReason;
  final String? lockTitle;
  final String? lockMessage;
  final bool canRecordExpense;
  final AgentDayFloatSummary float;

  factory AgentDayStatus.fromApi(Map<String, dynamic> json) {
    final branch = json['branch'] as Map<String, dynamic>?;
    final canUseApp = json['canUseApp'] as bool? ?? false;
    return AgentDayStatus(
      date: json['date'] as String? ?? '',
      branch: branch == null ? null : AgentDayBranch.fromApi(branch),
      branchStatus: json['branchStatus'] as String?,
      canUseApp: canUseApp,
      canBrowseClients: json['canBrowseClients'] as bool? ?? canUseApp,
      lockReason: json['lockReason'] as String?,
      lockTitle: json['lockTitle'] as String?,
      lockMessage: json['lockMessage'] as String?,
      canRecordExpense: json['canRecordExpense'] as bool? ?? false,
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
    required this.processingFees,
    required this.amountCollected,
    required this.collectedRepaymentsAvailable,
    required this.unusedFloat,
    required this.expectedHandover,
    this.expensesTotal = 0,
    this.expenses = const [],
    this.amountReturned,
    this.returnedAt,
  });

  final int amountReceived;
  final int amountDisbursed;
  final int processingFees;
  final int amountCollected;
  final int collectedRepaymentsAvailable;
  final int unusedFloat;
  final int expectedHandover;
  final int expensesTotal;
  final List<AgentDayExpense> expenses;
  final int? amountReturned;
  final DateTime? returnedAt;

  factory AgentDayFloatSummary.fromApi(Map<String, dynamic> json) {
    return AgentDayFloatSummary(
      amountReceived: _asMoney(json['amountReceived']),
      amountDisbursed: _asMoney(json['amountDisbursed']),
      processingFees: _asMoney(json['processingFees']),
      amountCollected: _asMoney(json['amountCollected']),
      collectedRepaymentsAvailable: json['collectedRepaymentsAvailable'] == null
          ? _asMoney(json['amountCollected'])
          : _asMoney(json['collectedRepaymentsAvailable']),
      unusedFloat: _asMoney(json['unusedFloat']),
      expectedHandover: _asMoney(json['expectedHandover']),
      expensesTotal: _asMoney(json['expensesTotal']),
      expenses: (json['expenses'] as List? ?? const [])
          .whereType<Map>()
          .map((row) => AgentDayExpense.fromApi(Map<String, dynamic>.from(row)))
          .toList(),
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

class AgentDayExpense {
  const AgentDayExpense({
    required this.id,
    required this.amount,
    required this.description,
    required this.paidFrom,
  });

  final String id;
  final int amount;
  final String description;
  final String paidFrom;

  factory AgentDayExpense.fromApi(Map<String, dynamic> json) {
    return AgentDayExpense(
      id: json['id'] as String? ?? '',
      amount: _asMoney(json['amount']),
      description: (json['description'] as String?)?.trim() ?? 'Expense',
      paidFrom: json['paidFrom'] as String? ?? 'AGENT_FLOAT',
    );
  }
}
