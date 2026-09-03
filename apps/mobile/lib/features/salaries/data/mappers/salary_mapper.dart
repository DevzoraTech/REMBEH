import '../../domain/models/salary_models.dart';

class SalaryMapper {
  const SalaryMapper._();

  static SalariesDashboard dashboardFromJson(Map<String, dynamic> json) {
    final employees = json['employees'] as List<dynamic>? ?? const [];
    return SalariesDashboard(
      cycle: cycleFromJson(json['cycle'] as Map<String, dynamic>? ?? const {}),
      summary: summaryFromJson(
        json['summary'] as Map<String, dynamic>? ?? const {},
      ),
      employees: employees
          .whereType<Map<String, dynamic>>()
          .map(employeeFromJson)
          .toList(),
      openCashDay: openCashDayFromJson(json['openCashDay']),
    );
  }

  static SalaryCycle cycleFromJson(Map<String, dynamic> json) {
    return SalaryCycle(
      start: _date(json['start']),
      end: _date(json['end']),
      label: json['label'] as String? ?? '',
      paymentWindowStart: _date(json['paymentWindowStart']),
      paymentWindowEnd: _date(json['paymentWindowEnd']),
      nextStart: _date(json['nextStart']),
      nextEnd: _date(json['nextEnd']),
    );
  }

  static PayrollSummary summaryFromJson(Map<String, dynamic> json) {
    return PayrollSummary(
      totalPayrollDue: _num(json['totalPayrollDue']),
      employeeCount: _int(json['employeeCount']),
      paid: _num(json['paid']),
      outstanding: _num(json['outstanding']),
      paidPercent: _int(json['paidPercent']),
      outstandingPercent: _int(json['outstandingPercent']),
      employeeShortages: _num(json['employeeShortages']),
      shortageEmployeeCount: _int(json['shortageEmployeeCount']),
      unpaidCount: _int(json['unpaidCount']),
      partialCount: _int(json['partialCount']),
      paidCount: _int(json['paidCount']),
    );
  }

  static SalaryEmployee employeeFromJson(Map<String, dynamic> json) {
    final payments = json['payments'] as List<dynamic>? ?? const [];
    return SalaryEmployee(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String?,
      branchId: json['branchId'] as String?,
      fullName: json['fullName'] as String? ?? 'Employee',
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      ninNumber: json['ninNumber'] as String?,
      roleName: json['roleName'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      photoUrl: json['photoUrl'] as String?,
      monthlySalary: _num(json['monthlySalary']),
      salaryDue: _num(json['salaryDue']),
      paid: _num(json['paid']),
      outstanding: _num(json['outstanding']),
      shortageOutstanding: _num(json['shortageOutstanding']),
      paymentStatus: json['paymentStatus'] as String? ?? 'UNPAID',
      isProrated: json['isProrated'] as bool? ?? false,
      cycleDays: _int(json['cycleDays']),
      eligibleDays: _int(json['eligibleDays']),
      dateJoined: _date(json['dateJoined']),
      paymentMethod: json['paymentMethod'] as String?,
      paymentProvider: json['paymentProvider'] as String?,
      paymentAccountName: json['paymentAccountName'] as String?,
      paymentAccountNumber: json['paymentAccountNumber'] as String?,
      notes: json['notes'] as String?,
      payments: payments
          .whereType<Map<String, dynamic>>()
          .map(paymentFromJson)
          .toList(),
    );
  }

  static SalaryOpenCashDay? openCashDayFromJson(dynamic value) {
    if (value is! Map<String, dynamic>) {
      return null;
    }
    return SalaryOpenCashDay(
      operationDate: _date(value['operationDate']),
      branchCashRemaining: _num(value['branchCashRemaining']),
    );
  }

  static SalaryPayment paymentFromJson(Map<String, dynamic> json) {
    return SalaryPayment(
      id: json['id'] as String? ?? '',
      amount: _num(json['amount']),
      method: json['method'] as String? ?? 'CASH',
      paidAt: _dateTime(json['paidAt']),
      operationDate: _date(json['operationDate']),
      paidFromCash: json['paidFromCash'] as bool? ?? json['operationDate'] != null,
      canReverse: json['canReverse'] as bool? ?? false,
      recordedByName: json['recordedByName'] as String? ?? '',
      referenceNote: json['referenceNote'] as String?,
      reversedAt: _dateTime(json['reversedAt']),
    );
  }

  static SalaryAgentCandidate agentCandidateFromJson(
    Map<String, dynamic> json,
  ) {
    return SalaryAgentCandidate(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Field Officer',
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      roleName: json['roleName'] as String?,
      branchId: json['branchId'] as String?,
      photoUrl: json['photoUrl'] as String?,
    );
  }

  static SalaryHistory historyFromJson(Map<String, dynamic> json) {
    final cycles = json['cycles'] as List<dynamic>? ?? const [];
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return SalaryHistory(
      employee: employeeFromJson(
        json['employee'] as Map<String, dynamic>? ?? const {},
      ),
      cycles: cycles
          .whereType<Map<String, dynamic>>()
          .map(historyCycleFromJson)
          .toList(),
      totalCycles: _int(summary['totalCycles']),
      totalPaid: _num(summary['totalPaid']),
      totalDue: _num(summary['totalDue']),
    );
  }

  static SalaryHistoryCycle historyCycleFromJson(Map<String, dynamic> json) {
    final payments = json['payments'] as List<dynamic>? ?? const [];
    return SalaryHistoryCycle(
      start: _date(json['start']),
      end: _date(json['end']),
      label: json['label'] as String? ?? '',
      salaryDue: _num(json['salaryDue']),
      paid: _num(json['paid']),
      outstanding: _num(json['outstanding']),
      paymentStatus: json['paymentStatus'] as String? ?? 'UNPAID',
      payments: payments
          .whereType<Map<String, dynamic>>()
          .map(paymentFromJson)
          .toList(),
    );
  }

  static DateTime? _date(dynamic value) {
    if (value == null) return null;
    final raw = value.toString().trim();
    final dateOnly = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw);
    if (dateOnly != null) {
      return DateTime(
        int.parse(dateOnly.group(1)!),
        int.parse(dateOnly.group(2)!),
        int.parse(dateOnly.group(3)!),
      );
    }
    return DateTime.tryParse(raw)?.toLocal();
  }

  static DateTime? _dateTime(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString())?.toLocal();
  }

  static num _num(dynamic value) {
    if (value is num) return value;
    return num.tryParse(value?.toString() ?? '') ?? 0;
  }

  static int _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
