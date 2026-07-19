enum RecordsSection { repayments, applications }

enum RecordsFilter {
  all,
  dueToday,
  collectedToday,
  today,
  yesterday,
  thisWeek,
  thisMonth,
  pendingSync,
  uploaded,
  custom,
}

extension RecordsFilterX on RecordsFilter {
  String get label {
    switch (this) {
      case RecordsFilter.all:
        return 'All';
      case RecordsFilter.dueToday:
        return 'Due Today';
      case RecordsFilter.collectedToday:
        return 'Collected Today';
      case RecordsFilter.today:
        return 'Today';
      case RecordsFilter.yesterday:
        return 'Yesterday';
      case RecordsFilter.thisWeek:
        return 'This Week';
      case RecordsFilter.thisMonth:
        return 'This Month';
      case RecordsFilter.pendingSync:
        return 'Pending Sync';
      case RecordsFilter.uploaded:
        return 'Uploaded';
      case RecordsFilter.custom:
        return 'Custom';
    }
  }

}

/// Filters available on Repayments (screenshot 2).
const repaymentFilters = <RecordsFilter>[
  RecordsFilter.all,
  RecordsFilter.dueToday,
  RecordsFilter.collectedToday,
  RecordsFilter.yesterday,
  RecordsFilter.thisWeek,
  RecordsFilter.thisMonth,
  RecordsFilter.pendingSync,
  RecordsFilter.uploaded,
  RecordsFilter.custom,
];

/// Applications reuses the same menu, without repayment-only options.
const applicationFilters = <RecordsFilter>[
  RecordsFilter.all,
  RecordsFilter.today,
  RecordsFilter.yesterday,
  RecordsFilter.thisWeek,
  RecordsFilter.thisMonth,
  RecordsFilter.pendingSync,
  RecordsFilter.uploaded,
  RecordsFilter.custom,
];

class HomeSummary {
  const HomeSummary({
    required this.amountCollectedToday,
    required this.repaymentsTodayCount,
    required this.dueTodayCount,
    required this.newApplicationsTodayCount,
    required this.pendingSyncCount,
    required this.clientsDueToday,
  });

  final int amountCollectedToday;
  final int repaymentsTodayCount;
  final int dueTodayCount;
  final int newApplicationsTodayCount;
  final int pendingSyncCount;
  final List<DueClient> clientsDueToday;
}

class DueClient {
  const DueClient({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.amountPaid,
    required this.loanAmount,
    required this.amountDue,
    required this.lastActivityAt,
    required this.synced,
  });

  final String id;
  final String fullName;
  final String phone;
  /// Total repaid against the loan so far.
  final int amountPaid;
  /// Full loan principal / package amount.
  final int loanAmount;
  /// Still expected today (used for due counts / search).
  final int amountDue;
  final DateTime lastActivityAt;
  final bool synced;

  String get initials => initialsFromName(fullName);
}

class FieldRepayment {
  const FieldRepayment({
    required this.id,
    required this.clientName,
    required this.phone,
    required this.amount,
    required this.amountPaid,
    required this.loanAmount,
    required this.recordedAt,
    required this.synced,
    required this.dueToday,
  });

  final String id;
  final String clientName;
  final String phone;
  /// This repayment entry amount.
  final int amount;
  /// Total repaid against the loan so far.
  final int amountPaid;
  /// Full loan amount.
  final int loanAmount;
  final DateTime recordedAt;
  final bool synced;
  final bool dueToday;

  String get initials => initialsFromName(clientName);
}

class FieldApplication {
  const FieldApplication({
    required this.id,
    required this.clientName,
    required this.phone,
    required this.amountRequested,
    required this.interestRatePercent,
    required this.registeredAt,
    required this.synced,
  });

  final String id;
  final String clientName;
  final String phone;
  final int amountRequested;
  /// Annual / product interest rate shown as e.g. 20.
  final int interestRatePercent;
  final DateTime registeredAt;
  final bool synced;

  String get initials => initialsFromName(clientName);

  String get interestLabel => '$interestRatePercent%';
}

String initialsFromName(String fullName) {
  final parts = fullName
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'CL';
  if (parts.length == 1) {
    return parts.first.substring(0, parts.first.length.clamp(0, 2)).toUpperCase();
  }
  return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
}
