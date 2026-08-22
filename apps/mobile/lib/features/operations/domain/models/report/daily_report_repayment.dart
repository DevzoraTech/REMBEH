// lib/features/operations/domain/models/report/daily_report_repayment.dart

class DailyReportRepayment {
  const DailyReportRepayment({
    required this.id,
    required this.borrowerName,
    required this.amount,
    required this.paidAt,
    required this.recordedByName,
    this.loanId,
    this.borrowerPhone,
    this.product,
    this.method,
    this.receiptNumber,
    this.recordedByPublicId,
    this.note,
  });

  final String id;

  final String? loanId;

  final String borrowerName;
  final String? borrowerPhone;

  final String? product;

  final num amount;

  final DateTime? paidAt;

  final String? method;
  final String? receiptNumber;

  final String recordedByName;
  final String? recordedByPublicId;

  final String? note;
}
