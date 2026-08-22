// lib/features/operations/domain/models/report/daily_report_agent_return.dart

class DailyReportAgentReturn {
  const DailyReportAgentReturn({
    required this.floatId,
    required this.agentId,
    required this.agentName,
    required this.amountGiven,
    required this.amountDisbursed,
    required this.processingFees,
    required this.amountCollected,
    required this.expectedReturn,
    required this.status,
    this.agentPublicId,
    this.amountReturned,
    this.variance,
    this.returnedAt,
    this.returnedByName,
    this.notes,
  });

  final String floatId;
  final String agentId;

  final String agentName;
  final String? agentPublicId;

  final num amountGiven;
  final num amountDisbursed;
  final num processingFees;
  final num amountCollected;

  final num expectedReturn;

  final num? amountReturned;
  final num? variance;

  final DateTime? returnedAt;
  final String? returnedByName;

  final String? notes;

  final String status;

  bool get hasReturned => amountReturned != null;

  bool get isShort => hasReturned && (variance ?? 0) < 0;

  bool get isOver => hasReturned && (variance ?? 0) > 0;

  bool get isBalanced => hasReturned && (variance ?? 0) == 0;
}
