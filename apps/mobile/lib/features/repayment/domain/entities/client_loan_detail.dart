class PaymentHistoryItem {
  const PaymentHistoryItem({
    required this.id,
    required this.amount,
    required this.method,
    required this.paidAt,
    required this.recordedByName,
    this.agentPhotoUrl,
    this.note,
    this.correctionLocked = false,
    this.canRequestCorrection = true,
    this.pendingCorrectionRequestId,
    this.approvedCorrectionRequestId,
    this.officerCanEdit = false,
    this.correctionAppliedAt,
  });

  final String id;
  final int amount;
  final String method;
  final DateTime paidAt;
  final String recordedByName;
  final String? agentPhotoUrl;
  final String? note;
  final bool correctionLocked;
  final bool canRequestCorrection;
  final String? pendingCorrectionRequestId;
  final String? approvedCorrectionRequestId;
  final bool officerCanEdit;
  final DateTime? correctionAppliedAt;
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

class ClientLoanMediaItem {
  const ClientLoanMediaItem({
    required this.id,
    required this.mediaType,
    required this.mimeType,
    required this.byteSize,
    required this.createdAt,
    this.fileName,
    this.url,
  });

  final String id;
  final String mediaType;
  final String mimeType;
  final int byteSize;
  final DateTime createdAt;
  final String? fileName;
  final String? url;
}

class ClientLoanDetail {
  const ClientLoanDetail({
    required this.id,
    required this.loanId,
    required this.customerId,
    required this.fullName,
    required this.phone,
    required this.nationalId,
    required this.customerEmail,
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
    required this.principalAmount,
    required this.openingBalance,
    required this.interestRatePercent,
    required this.loanStartDate,
    required this.maturityDate,
    this.paymentStartDate,
    this.agentPhotoUrl,
    this.status = '',
    this.isFined = false,
    this.finesTotal = 0,
    this.paymentHistory = const [],
    this.fineHistory = const [],
    this.media = const [],
    this.correctionAccess = const ClientLoanCorrectionAccess(),
  });

  final String id;
  final String loanId;
  final String customerId;
  final String fullName;
  final String phone;
  final String? nationalId;
  final String? customerEmail;
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
  final int principalAmount;
  final int? openingBalance;
  final int interestRatePercent;
  final DateTime loanStartDate;
  final DateTime maturityDate;
  final DateTime? paymentStartDate;
  final String status;
  final bool isFined;
  final int finesTotal;
  final List<PaymentHistoryItem> paymentHistory;
  final List<FineHistoryItem> fineHistory;
  final List<ClientLoanMediaItem> media;
  final ClientLoanCorrectionAccess correctionAccess;

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

class ClientLoanCorrectionAccess {
  const ClientLoanCorrectionAccess({
    this.enabled = false,
    this.source,
    this.reason,
  });

  final bool enabled;
  final String? source;
  final String? reason;

  factory ClientLoanCorrectionAccess.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ClientLoanCorrectionAccess();
    return ClientLoanCorrectionAccess(
      enabled: json['enabled'] as bool? ?? false,
      source: json['source'] as String?,
      reason: json['reason'] as String?,
    );
  }
}
