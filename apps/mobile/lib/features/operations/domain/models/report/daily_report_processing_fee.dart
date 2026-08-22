// lib/features/operations/domain/models/report/daily_report_processing_fee.dart

class DailyReportProcessingFee {
  const DailyReportProcessingFee({
    required this.id,
    required this.borrowerName,
    required this.amount,
    required this.officerName,
    this.loanId,
    this.product,
    this.receivedAt,
  });

  final String id;

  final String? loanId;

  final String borrowerName;

  final String? product;

  final num amount;

  final DateTime? receivedAt;

  final String officerName;
}
