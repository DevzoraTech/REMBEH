class DailyReportPortfolioPerformance {
  const DailyReportPortfolioPerformance({
    required this.activeBorrowers,
    required this.borrowersDue,
    required this.borrowersPaid,
    required this.borrowersMissed,
    required this.payerRatePercent,
    required this.totalDue,
    required this.totalRepaid,
    required this.totalStillDue,
    required this.borrowersWithAdvance,
    required this.totalAdvanceAmount,
    required this.missedRepaymentBuckets,
    required this.principalDisbursed,
    required this.principalRepaid,
    required this.principalOutstanding,
    required this.interestExpected,
    required this.interestCollected,
    required this.interestOutstanding,
  });

  final int activeBorrowers;
  final int borrowersDue;
  final int borrowersPaid;
  final int borrowersMissed;
  final num payerRatePercent;
  final num totalDue;
  final num totalRepaid;
  final num totalStillDue;
  final int borrowersWithAdvance;
  final num totalAdvanceAmount;
  final List<DailyReportMissedRepaymentBucket> missedRepaymentBuckets;
  final num principalDisbursed;
  final num principalRepaid;
  final num principalOutstanding;
  final num interestExpected;
  final num interestCollected;
  final num interestOutstanding;
}

class DailyReportMissedRepaymentBucket {
  const DailyReportMissedRepaymentBucket({
    required this.key,
    required this.label,
    required this.borrowers,
    required this.amount,
  });

  final String key;
  final String label;
  final int borrowers;
  final num amount;
}
