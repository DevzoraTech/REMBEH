class PaymentHistoryItem {
  const PaymentHistoryItem({
    required this.id,
    required this.amount,
    required this.method,
    required this.paidAt,
    required this.recordedByName,
    this.agentPhotoUrl,
    this.note,
  });

  final String id;
  final int amount;
  final String method;
  final DateTime paidAt;
  final String recordedByName;
  final String? agentPhotoUrl;
  final String? note;
}

class FineHistoryItem {
  const FineHistoryItem({
    required this.id,
    required this.periodIndex,
    required this.amount,
    required this.dueAt,
    required this.appliedAt,
  });

  final String id;
  final int periodIndex;
  final int amount;
  final DateTime dueAt;
  final DateTime appliedAt;
}

class ClientLoanDetail {
  const ClientLoanDetail({
    required this.id,
    required this.loanId,
    required this.customerId,
    required this.fullName,
    required this.phone,
    required this.registeredBy,
    required this.outstanding,
    required this.lastPaymentAmount,
    required this.lastPaymentAt,
    required this.lastPaymentBy,
    required this.expectedToday,
    required this.carriedForward,
    required this.dailyInstalment,
    required this.loanPeriodDays,
    required this.daysLeft,
    required this.nextDueLabel,
    required this.nextDueIsToday,
    required this.paidAmount,
    required this.loanAmount,
    required this.interestRatePercent,
    required this.loanStartDate,
    required this.maturityDate,
    this.paymentStartDate,
    this.agentPhotoUrl,
    this.isFined = false,
    this.finesTotal = 0,
    this.paymentHistory = const [],
    this.fineHistory = const [],
  });

  final String id;
  final String loanId;
  final String customerId;
  final String fullName;
  final String phone;
  final String registeredBy;
  final String? agentPhotoUrl;
  final int outstanding;
  final int lastPaymentAmount;
  final DateTime? lastPaymentAt;
  final String? lastPaymentBy;
  final int expectedToday;
  final int carriedForward;
  final int dailyInstalment;
  final int loanPeriodDays;
  final int daysLeft;
  final String nextDueLabel;
  final bool nextDueIsToday;
  final int paidAmount;
  final int loanAmount;
  final int interestRatePercent;
  final DateTime loanStartDate;
  final DateTime maturityDate;
  final DateTime? paymentStartDate;
  final bool isFined;
  final int finesTotal;
  final List<PaymentHistoryItem> paymentHistory;
  final List<FineHistoryItem> fineHistory;

  String get initials {
    final parts = fullName
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'CL';
    if (parts.length == 1) {
      return parts.first
          .substring(0, parts.first.length.clamp(0, 2))
          .toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }

  double get progressRatio {
    if (loanAmount <= 0) return 0;
    return (paidAmount / loanAmount).clamp(0, 1);
  }

  int get progressPercent => (progressRatio * 100).round();
}
