// lib/features/operations/domain/models/report/daily_report_variance.dart

class DailyReportVariance {
  const DailyReportVariance({
    required this.id,
    required this.source,
    required this.variance,
    required this.status,
    this.personName,
    this.personPublicId,
    this.expectedAmount,
    this.actualAmount,
    this.shortageAmount,
    this.outstandingAmount,
    this.notes,
    this.occurredAt,
  });

  final String id;

  final String source;

  final String? personName;
  final String? personPublicId;

  final num? expectedAmount;
  final num? actualAmount;

  final num variance;

  final num? shortageAmount;
  final num? outstandingAmount;

  final String status;

  final String? notes;

  final DateTime? occurredAt;

  bool get isShortage => variance < 0;

  bool get isExcess => variance > 0;
}
