class ClientPaymentHistoryItem {
  const ClientPaymentHistoryItem({
    required this.id,
    required this.amount,
    required this.method,
    required this.paidAt,
    required this.recordedByName,
    this.note,
  });

  final String id;
  final int amount;
  final String method;
  final DateTime paidAt;
  final String recordedByName;
  final String? note;
}

class ClientDetail {
  const ClientDetail({
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
    this.interestAmount = 0,
    this.processingFee = 0,
    this.status = '',
    this.paymentHistory = const [],
  });

  final String id;
  final String loanId;
  final String customerId;
  final String fullName;
  final String phone;
  final String registeredBy;
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
  final double interestRatePercent;
  final DateTime loanStartDate;
  final DateTime maturityDate;
  final DateTime? paymentStartDate;
  final int interestAmount;
  final int processingFee;
  final String status;
  final List<ClientPaymentHistoryItem> paymentHistory;

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

  factory ClientDetail.fromApi(Map<String, dynamic> json) {
    DateTime parseDate(String? raw, {DateTime? fallback}) {
      final parsed = DateTime.tryParse(raw ?? '');
      return parsed ?? fallback ?? DateTime.now();
    }

    return ClientDetail(
      id: json['id'] as String? ?? json['loanId'] as String? ?? '',
      loanId: json['loanId'] as String? ?? json['id'] as String? ?? '',
      customerId: json['customerId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      registeredBy: json['registeredBy'] as String? ?? '',
      outstanding: ((json['outstanding'] as num?) ?? 0).round(),
      lastPaymentAmount: ((json['lastPaymentAmount'] as num?) ?? 0).round(),
      lastPaymentAt: json['lastPaymentAt'] != null
          ? DateTime.tryParse(json['lastPaymentAt'] as String)
          : null,
      lastPaymentBy: json['lastPaymentBy'] as String?,
      expectedToday: ((json['expectedToday'] as num?) ?? 0).round(),
      carriedForward: ((json['carriedForward'] as num?) ?? 0).round(),
      dailyInstalment: ((json['dailyInstalment'] as num?) ?? 0).round(),
      loanPeriodDays: ((json['loanPeriodDays'] as num?) ?? 0).round(),
      daysLeft: ((json['daysLeft'] as num?) ?? 0).round(),
      nextDueLabel: json['nextDueLabel'] as String? ?? '',
      nextDueIsToday: json['nextDueIsToday'] as bool? ?? false,
      paidAmount: ((json['paidAmount'] as num?) ?? 0).round(),
      loanAmount: ((json['loanAmount'] as num?) ?? 0).round(),
      interestRatePercent:
          (json['interestRatePercent'] as num?)?.toDouble() ?? 0,
      loanStartDate: parseDate(json['loanStartDate'] as String?),
      maturityDate: parseDate(json['maturityDate'] as String?),
      paymentStartDate: json['paymentStartDate'] != null
          ? DateTime.tryParse(json['paymentStartDate'] as String)
          : null,
      interestAmount: ((json['interestAmount'] as num?) ?? 0).round(),
      processingFee: ((json['processingFee'] as num?) ?? 0).round(),
      status: json['status'] as String? ?? '',
      paymentHistory: ((json['paymentHistory'] as List?) ?? const [])
          .whereType<Map>()
          .map(
            (row) => ClientPaymentHistoryItem(
              id: row['id'] as String? ?? '',
              amount: ((row['amount'] as num?) ?? 0).round(),
              method: row['method'] as String? ?? 'CASH',
              paidAt: DateTime.tryParse(row['paidAt'] as String? ?? '') ??
                  DateTime.now(),
              recordedByName: row['recordedByName'] as String? ?? '',
              note: row['note'] as String?,
            ),
          )
          .toList()
        ..sort((a, b) => b.paidAt.compareTo(a.paidAt)),
    );
  }
}
