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
    this.clearedByName,
    this.clearedAt,
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

  final String? clearedByName;

  final DateTime? clearedAt;

  final DateTime? occurredAt;

  String get displayNotes {
    final by = clearedByName?.trim();
    if (by != null && by.isNotEmpty) {
      return 'Shortage cleared by $by';
    }
    return notes?.trim() ?? '';
  }

  bool get isShortage => variance < 0;

  bool get isExcess => variance > 0;
}
