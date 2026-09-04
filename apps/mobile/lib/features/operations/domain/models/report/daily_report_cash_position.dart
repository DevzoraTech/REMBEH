// lib/features/operations/domain/models/report/daily_report_cash_position.dart

class DailyReportCashPosition {
  const DailyReportCashPosition({
    required this.openingCash,
    required this.capitalReceived,
    required this.totalCashAvailable,
    required this.repaymentsCollected,
    required this.processingFees,
    this.shortageRecoveries = 0,
    this.recoveryLines = const [],
    required this.expenses,
    required this.salaries,
    this.loansIssued = 0,
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
  final num shortageRecoveries;
  final List<DailyReportShortageRecovery> recoveryLines;

  /// All day expenses (cashier + field officers).
  final num expenses;
  final num salaries;
  final num loansIssued;

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

class DailyReportShortageRecovery {
  const DailyReportShortageRecovery({
    required this.employeeName,
    required this.amount,
  });

  final String employeeName;
  final num amount;
}
