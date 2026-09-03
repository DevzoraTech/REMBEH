class SalaryCycle {
  const SalaryCycle({
    required this.start,
    required this.end,
    required this.label,
    required this.paymentWindowStart,
    required this.paymentWindowEnd,
    required this.nextStart,
    required this.nextEnd,
  });

  final DateTime? start;
  final DateTime? end;
  final String label;
  final DateTime? paymentWindowStart;
  final DateTime? paymentWindowEnd;
  final DateTime? nextStart;
  final DateTime? nextEnd;
}

class SalaryOpenCashDay {
  const SalaryOpenCashDay({
    required this.operationDate,
    required this.branchCashRemaining,
  });

  final DateTime? operationDate;
  final num branchCashRemaining;
}

class PayrollSummary {
  const PayrollSummary({
    required this.totalPayrollDue,
    required this.employeeCount,
    required this.paid,
    required this.outstanding,
    required this.paidPercent,
    required this.outstandingPercent,
    required this.employeeShortages,
    required this.shortageEmployeeCount,
    required this.unpaidCount,
    required this.partialCount,
    required this.paidCount,
  });

  final num totalPayrollDue;
  final int employeeCount;
  final num paid;
  final num outstanding;
  final int paidPercent;
  final int outstandingPercent;
  final num employeeShortages;
  final int shortageEmployeeCount;
  final int unpaidCount;
  final int partialCount;
  final int paidCount;
}

class SalaryPayment {
  const SalaryPayment({
    required this.id,
    required this.amount,
    required this.method,
    required this.paidAt,
    required this.recordedByName,
    this.operationDate,
    this.paidFromCash = false,
    this.canReverse = false,
    this.referenceNote,
    this.reversedAt,
  });

  final String id;
  final num amount;
  final String method;
  final DateTime? paidAt;
  final DateTime? operationDate;
  final bool paidFromCash;
  final bool canReverse;
  final String recordedByName;
  final String? referenceNote;
  final DateTime? reversedAt;

  bool get isReversed => reversedAt != null;
}

class SalaryEmployee {
  const SalaryEmployee({
    required this.id,
    required this.fullName,
    required this.status,
    required this.monthlySalary,
    required this.salaryDue,
    required this.paid,
    required this.outstanding,
    required this.shortageOutstanding,
    required this.paymentStatus,
    required this.isProrated,
    required this.cycleDays,
    required this.eligibleDays,
    required this.dateJoined,
    required this.payments,
    this.userId,
    this.branchId,
    this.phone,
    this.email,
    this.ninNumber,
    this.roleName,
    this.photoUrl,
    this.paymentMethod,
    this.paymentProvider,
    this.paymentAccountName,
    this.paymentAccountNumber,
    this.notes,
  });

  final String id;
  final String? userId;
  final String? branchId;
  final String fullName;
  final String? phone;
  final String? email;
  final String? ninNumber;
  final String? roleName;
  final String status;
  final String? photoUrl;
  final num monthlySalary;
  final num salaryDue;
  final num paid;
  final num outstanding;
  final num shortageOutstanding;
  final String paymentStatus;
  final bool isProrated;
  final int cycleDays;
  final int eligibleDays;
  final DateTime? dateJoined;
  final String? paymentMethod;
  final String? paymentProvider;
  final String? paymentAccountName;
  final String? paymentAccountNumber;
  final String? notes;
  final List<SalaryPayment> payments;

  bool get isPaid => paymentStatus == 'PAID';

  bool get isPartial => paymentStatus == 'PARTIAL';

  bool get isUnpaid => paymentStatus == 'UNPAID';

  bool get hasShortage => shortageOutstanding > 0;
}

class SalaryAgentCandidate {
  const SalaryAgentCandidate({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.roleName,
    this.branchId,
    this.photoUrl,
  });

  final String id;
  final String name;
  final String? phone;
  final String? email;
  final String? roleName;
  final String? branchId;
  final String? photoUrl;
}

class SalariesDashboard {
  const SalariesDashboard({
    required this.cycle,
    required this.summary,
    required this.employees,
    this.openCashDay,
  });

  final SalaryCycle cycle;
  final PayrollSummary summary;
  final List<SalaryEmployee> employees;
  final SalaryOpenCashDay? openCashDay;
}

class SalaryHistoryCycle {
  const SalaryHistoryCycle({
    required this.start,
    required this.end,
    required this.label,
    required this.salaryDue,
    required this.paid,
    required this.outstanding,
    required this.paymentStatus,
    required this.payments,
  });

  final DateTime? start;
  final DateTime? end;
  final String label;
  final num salaryDue;
  final num paid;
  final num outstanding;
  final String paymentStatus;
  final List<SalaryPayment> payments;
}

class SalaryHistory {
  const SalaryHistory({
    required this.employee,
    required this.cycles,
    required this.totalCycles,
    required this.totalPaid,
    required this.totalDue,
  });

  final SalaryEmployee employee;
  final List<SalaryHistoryCycle> cycles;
  final int totalCycles;
  final num totalPaid;
  final num totalDue;
}
