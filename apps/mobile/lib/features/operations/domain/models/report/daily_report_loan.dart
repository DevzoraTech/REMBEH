// lib/features/operations/domain/models/report/daily_report_loan.dart

class DailyReportLoan {
  const DailyReportLoan({
    required this.id,
    required this.loanId,
    required this.borrowerName,
    required this.principalAmount,
    required this.processingFee,
    required this.issuedAt,
    required this.officerName,
    required this.durationDays,
    this.borrowerPhone,
    this.product,
    this.officerPublicId,
    this.purpose,
    this.recoveredToday = 0,
    this.outstandingBalance = 0,
  });

  final String id;
  final String? loanId;

  final String borrowerName;
  final String? borrowerPhone;

  final String? product;

  final num principalAmount;
  final num processingFee;

  final num recoveredToday;
  final num outstandingBalance;

  final DateTime? issuedAt;

  final String officerName;
  final String? officerPublicId;

  final int? durationDays;
  final String? purpose;
}
