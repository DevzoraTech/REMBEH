class OperationDashboardData {
  const OperationDashboardData({
    required this.status,
    required this.operationDate,
    required this.openingCash,
    required this.capitalReceived,
    required this.collections,
    required this.processingFees,
    this.shortageRecoveries = 0,
    required this.loansDisbursed,
    required this.expenses,
    required this.salaries,
    required this.floatWithAgents,
    required this.expectedClosingCash,
    this.openedBy,
    this.openedAt,
  });

  final String status;
  final DateTime operationDate;

  final num openingCash;
  final num capitalReceived;
  final num collections;
  final num processingFees;
  final num shortageRecoveries;
  final num loansDisbursed;
  final num expenses;
  final num salaries;
  final num floatWithAgents;
  final num expectedClosingCash;

  final String? openedBy;
  final DateTime? openedAt;

  bool get isOpen => status.toUpperCase() == 'OPEN';
}
