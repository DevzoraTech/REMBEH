// lib/features/operations/domain/models/report/daily_report_expense.dart

class DailyReportExpense {
  const DailyReportExpense({
    required this.id,
    required this.category,
    required this.amount,
    required this.recordedByName,
    required this.incurredAt,
    this.description,
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

  final DateTime? approvedAt;
  final String? approvedByName;

  final DateTime? voidedAt;
  final String? voidedByName;
  final String? voidReason;

  bool get isVoided => voidedAt != null;
}
