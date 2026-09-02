enum RecordsSection { repayments, applications }

enum RecordsFilter {
  all,
  dueToday,
  duePaidToday,
  overduePaid,
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
        return 'Still due';
      case RecordsFilter.duePaidToday:
        return 'Paid today';
      case RecordsFilter.overduePaid:
        return 'Overdue paid';
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
  RecordsFilter.duePaidToday,
  RecordsFilter.overduePaid,
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
    this.dueTodayPaidCount = 0,
    this.overduePaidCount = 0,
    required this.newApplicationsTodayCount,
    required this.pendingSyncCount,
    required this.clientsDueToday,
    this.clientsDueTodayPaid = const [],
    this.clientsOverduePaid = const [],
  });

  final int amountCollectedToday;
  final int repaymentsTodayCount;
  final int dueTodayCount;
  final int dueTodayPaidCount;
  final int overduePaidCount;
  final int newApplicationsTodayCount;
  final int pendingSyncCount;
  final List<DueClient> clientsDueToday;
  final List<DueClient> clientsDueTodayPaid;
  final List<DueClient> clientsOverduePaid;
}

enum DueDayCoverage { duePaid, dueUnpaid, overduePaid, overdueUnpaid, none }

class DueClient {
  const DueClient({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.amountPaid,
    required this.loanAmount,
    required this.amountDue,
    this.paidTodayAmount = 0,
    this.coverage = DueDayCoverage.dueUnpaid,
    required this.lastActivityAt,
    required this.synced,
    this.branchId,
    this.branchName,
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
  final int paidTodayAmount;
  final DueDayCoverage coverage;
  final DateTime lastActivityAt;
  final bool synced;
  final String? branchId;
  final String? branchName;

  String get initials => initialsFromName(fullName);
}

class DueTodayBundle {
  const DueTodayBundle({
    this.unpaid = const [],
    this.paid = const [],
    this.overduePaid = const [],
  });

  final List<DueClient> unpaid;
  final List<DueClient> paid;
  final List<DueClient> overduePaid;
}

class FieldRepayment {
  const FieldRepayment({
    required this.id,
    this.loanId = '',
    required this.clientName,
    required this.phone,
    required this.amount,
    required this.amountPaid,
    required this.loanAmount,
    required this.recordedAt,
    required this.synced,
    required this.dueToday,
    this.recordedByUserId,
    this.recordedByName,
    this.recordedByPublicId,
    this.branchId,
    this.branchName,
  });

  final String id;

  /// Active loan this repayment was recorded against.
  final String loanId;
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
  final String? recordedByUserId;
  final String? recordedByName;
  final String? recordedByPublicId;
  final String? branchId;
  final String? branchName;

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
    this.officerUserId,
    this.officerName,
    this.officerPublicId,
    this.branchId,
  });

  final String id;
  final String clientName;
  final String phone;
  final int amountRequested;

  /// Annual / product interest rate shown as e.g. 20.
  final int interestRatePercent;
  final DateTime registeredAt;
  final bool synced;
  final String? officerUserId;
  final String? officerName;
  final String? officerPublicId;
  final String? branchId;

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
    return parts.first
        .substring(0, parts.first.length.clamp(0, 2))
        .toUpperCase();
  }
  return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
}
