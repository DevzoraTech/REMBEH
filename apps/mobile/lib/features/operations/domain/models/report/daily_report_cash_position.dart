// lib/features/operations/domain/models/report/daily_report_cash_position.dart

class DailyReportCashPosition {
  const DailyReportCashPosition({
    required this.openingCash,
    required this.capitalReceived,
    required this.totalCashAvailable,
    required this.repaymentsCollected,
    required this.processingFees,
    required this.expenses,
    required this.salaries,
    required this.floatIssued,
    required this.floatReturned,
    required this.expectedClosingCash,
    required this.countedCash,
    required this.variance,
  });

  final num openingCash;
  final num capitalReceived;
  final num totalCashAvailable;

  final num repaymentsCollected;
  final num processingFees;

  final num expenses;
  final num salaries;

  final num floatIssued;
  final num floatReturned;

  final num expectedClosingCash;
  final num? countedCash;
  final num? variance;

  bool get hasBeenCounted => countedCash != null;

  bool get isBalanced => countedCash != null && (variance ?? 0) == 0;

  bool get hasShortage => countedCash != null && (variance ?? 0) < 0;

  bool get hasExcess => countedCash != null && (variance ?? 0) > 0;
}
