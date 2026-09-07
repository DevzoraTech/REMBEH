// lib/features/operations/domain/models/report/daily_report_expense.dart

class DailyReportExpense {
  const DailyReportExpense({
    required this.id,
    required this.category,
    required this.amount,
    required this.recordedByName,
    required this.incurredAt,
    this.description,
    this.agentId,
    this.recordedByUserId,
    this.approvedAt,
    this.approvedByName,
    this.voidedAt,
    this.voidedByName,
    this.voidReason,
  });

  final String id;

  final String category;

  final num amount;

  final String? description;

  final DateTime? incurredAt;

  final String recordedByName;
  final String? agentId;
  final String? recordedByUserId;

  final DateTime? approvedAt;
  final String? approvedByName;

  final DateTime? voidedAt;
  final String? voidedByName;
  final String? voidReason;

  bool get isVoided => voidedAt != null;

  String get ownerKey {
    final agent = agentId?.trim();
    if (agent != null && agent.isNotEmpty) return agent;
    final recorder = recordedByUserId?.trim();
    if (recorder != null && recorder.isNotEmpty) return recorder;
    return 'name:${recordedByName.trim().toLowerCase()}';
  }
}
