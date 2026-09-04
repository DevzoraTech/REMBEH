import '../../domain/models/report/daily_report_agent_return.dart';
import '../../domain/models/report/daily_report_cash_position.dart';
import '../../domain/models/report/daily_report_data.dart';
import '../../domain/models/report/daily_report_expense.dart';
import '../../domain/models/report/daily_report_loan.dart';
import '../../domain/models/report/daily_report_processing_fee.dart';
import '../../domain/models/report/daily_report_repayment.dart';
import '../../domain/models/report/daily_report_variance.dart';

class DailyReportMapper {
  const DailyReportMapper._();

  static DailyReportData fromReportPayload({
    required Map<String, dynamic> report,
    required String organizationName,
    String? fallbackBranchName,
    String? fallbackManagerName,
    String? fallbackBranchAddress,
  }) {
    final snapshot = _map(report['snapshot']);

    final operation = _map(snapshot['operation']);
    final summary = _map(snapshot['summary']);
    final openingCash = _map(snapshot['openingCash']);
    final cashPosition = _map(snapshot['cashPosition']);

    final reportNumber =
        _string(report['reportNumber']) ??
        _string(snapshot['reportNumber']) ??
        'Daily report';

    final operationDate =
        _string(report['operationDate']) ??
        _string(operation['operationDate']) ??
        '';

    final status =
        _string(report['status']) ?? _string(operation['status']) ?? '';

    final branchName =
        _string(report['branchName']) ??
        _string(operation['branchName']) ??
        fallbackBranchName ??
        'Branch';

    final managerName =
        _string(operation['closedByName']) ??
        _string(operation['openedByName']) ??
        _string(report['managerReviewedByName']) ??
        fallbackManagerName ??
        'Manager';

    final expectedClosingCash = _firstNum([
      cashPosition['expectedClosingBalance'],
      summary['expectedClosingBalance'],
    ]);

    final countedCash = _firstNullableNum([
      cashPosition['countedCash'],
      summary['countedCash'],
    ]);

    final variance = _firstNullableNum([
      cashPosition['variance'],
      summary['variance'],
    ]);

    return DailyReportData(
      reportNumber: reportNumber,
      operationDate: operationDate,
      status: status,
      organizationName: organizationName,
      branchName: branchName,
      branchAddress: _string(report['branchAddress']) ?? fallbackBranchAddress,
      branchPhone: _string(report['branchPhone']),
      branchEmail: _string(report['branchEmail']),
      managerName: managerName,
      generatedAt: _date(report['generatedAt'] ?? snapshot['generatedAt']),
      managerNotes:
          _string(report['managerNotes']) ?? _string(snapshot['closingNotes']),
      ownerNotes: _string(report['ownerNotes']),
      ownerApprovedByName: _string(report['ownerApprovedByName']),
      cashPosition: DailyReportCashPosition(
        openingCash: _firstNum([
          openingCash['previousClosingBalance'],
          summary['previousClosingBalance'],
        ]),
        capitalReceived: _firstNum([
          openingCash['cashAddedToday'],
          summary['topUpsAdded'],
        ]),
        totalCashAvailable: _firstNum([
          openingCash['totalOpeningBalance'],
          summary['openingCash'],
        ]),
        repaymentsCollected: _firstNum([
          cashPosition['branchRepayments'],
          summary['collectionsReceived'],
        ]),
        processingFees: _firstNum([
          cashPosition['loanProcessingFees'],
          summary['processingFees'],
        ]),
        shortageRecoveries: _firstNum([
          cashPosition['shortageRecoveries'],
          summary['shortageRecoveries'],
        ]),
        recoveryLines: _list(
          snapshot['shortageRecoveries'],
        ).map(_shortageRecovery).toList(),
        expenses: _firstNum([
          summary['expenses'],
          cashPosition['expenses'],
          // Older snapshots only stored cashier expenses here.
          cashPosition['branchExpenses'],
        ]),
        salaries: _firstNum([
          cashPosition['salaries'],
          summary['salaries'],
        ]),
        loansIssued: _firstNum([
          cashPosition['loansIssued'],
          summary['loansIssuedPrincipal'],
        ]),
        floatIssued: _firstNum([
          cashPosition['floatDistributed'],
          summary['floatDistributed'],
        ]),
        floatReturned: _firstNum([
          cashPosition['cashReturnedByAgents'],
          summary['cashReturnedByAgents'],
        ]),
        expectedClosingCash: expectedClosingCash,
        countedCash: countedCash,
        variance: variance,
      ),
      loans: _list(snapshot['loansIssued']).map(_loan).toList(),
      repayments: _list(snapshot['repayments']).map(_repayment).toList(),
      expenses: _list(snapshot['expenses']).map(_expense).toList(),
      agentReturns: _list(snapshot['agentReturns']).map(_agentReturn).toList(),
      processingFees: _list(
        snapshot['processingFees'],
      ).map(_processingFee).toList(),
      variances: _list(snapshot['variances']).map(_varianceRow).toList(),
    );
  }

  static DailyReportData fromLiveOperation({
    required Map<String, dynamic> response,
    required String organizationName,
    required String branchName,
    required String managerName,
    String? branchAddress,
  }) {
    final operation = _map(response['operation']);
    final reconciliation = _map(response['reconciliation']);

    return DailyReportData(
      reportNumber:
          _string(_map(response['report'])['reportNumber']) ?? 'Draft report',
      operationDate:
          _string(operation['operationDate']) ??
          _string(response['date']) ??
          '',
      status: _string(operation['status']) ?? 'OPEN',
      organizationName: organizationName,
      branchName: _string(operation['branchName']) ?? branchName,
      branchAddress: branchAddress,
      managerName: managerName,
      generatedAt: null,
      managerNotes:
          _string(reconciliation['notes']) ??
          _string(operation['closingNotes']),
      cashPosition: DailyReportCashPosition(
        openingCash: _num(operation['openingBalance']),
        capitalReceived: _num(operation['cashAddedToday']),
        totalCashAvailable: _num(operation['cashAvailableAtOpening']),
        repaymentsCollected: _num(operation['collectionsReceived']),
        processingFees: _num(operation['processingFeesTotal']),
        shortageRecoveries: _num(operation['shortageRecoveriesTotal']),
        recoveryLines: _list(
          operation['shortageRecoveries'],
        ).map(_shortageRecovery).toList(),
        expenses: _firstNum([
          operation['expensesTotal'],
          operation['branchCashExpensesTotal'],
        ]),
        salaries: _num(operation['salariesTotal']),
        loansIssued: _firstNum([
          operation['loansIssuedPrincipal'],
          operation['loansDisbursed'],
        ]),
        floatIssued: _num(operation['floatIssued']),
        floatReturned: _num(operation['cashReturnedByAgents']),
        expectedClosingCash: _num(operation['expectedClosingBalance']),
        countedCash: _nullableNum(
          reconciliation['countedCash'] ??
              operation['reconciliationCountedCash'],
        ),
        variance: _nullableNum(
          reconciliation['variance'] ?? operation['reconciliationVariance'],
        ),
      ),
      loans: _list(operation['loansIssued']).map(_loan).toList(),
      repayments: _list(operation['repayments']).map(_repayment).toList(),
      expenses: _list(operation['expenses']).map(_expense).toList(),
      agentReturns: _list(operation['agentReturns']).map(_agentReturn).toList(),
      processingFees: _list(
        operation['processingFees'],
      ).map(_processingFee).toList(),
      variances: _list(operation['variances']).map(_varianceRow).toList(),
    );
  }

  static DailyReportLoan _loan(Map<String, dynamic> row) {
    return DailyReportLoan(
      id: _string(row['id']) ?? '',
      loanId: _string(row['loanId']),
      borrowerName: _string(row['borrowerName']) ?? 'Borrower',
      borrowerPhone: _string(row['borrowerPhone']),
      product: _string(row['product']),
      principalAmount: _num(row['principalAmount']),
      processingFee: _num(row['processingFee']),
      recoveredToday: _num(row['recoveredToday']),
      outstandingBalance: _num(row['outstandingBalance']),
      issuedAt: _date(row['issuedAt']),
      officerName: _string(row['officerName']) ?? 'Officer',
      officerPublicId: _string(row['officerPublicId']),
      durationDays: _int(row['durationDays']),
      purpose: _string(row['purpose']),
    );
  }

  static DailyReportShortageRecovery _shortageRecovery(
    Map<String, dynamic> row,
  ) {
    return DailyReportShortageRecovery(
      employeeName: _string(row['employeeName']) ?? 'Employee',
      amount: _num(row['amount']),
    );
  }

  static DailyReportRepayment _repayment(Map<String, dynamic> row) {
    return DailyReportRepayment(
      id: _string(row['id']) ?? '',
      loanId: _string(row['loanId']),
      borrowerName: _string(row['borrowerName']) ?? 'Borrower',
      borrowerPhone: _string(row['borrowerPhone']),
      product: _string(row['product']),
      amount: _num(row['amount']),
      paidAt: _date(row['paidAt']),
      method: _string(row['method']),
      receiptNumber: _string(row['receiptNumber']),
      recordedByName: _string(row['recordedByName']) ?? 'Officer',
      recordedByPublicId: _string(row['recordedByPublicId']),
      note: _string(row['note']),
    );
  }

  static DailyReportExpense _expense(Map<String, dynamic> row) {
    return DailyReportExpense(
      id: _string(row['id']) ?? '',
      category: _string(row['paidFrom']) == 'AGENT_FLOAT'
          ? 'FIELD_FLOAT'
          : 'OTHER',
      amount: _num(row['amount']),
      description: _string(row['description']),
      incurredAt: _date(row['incurredAt']),
      recordedByName: _string(row['agentName']) ??
          _string(row['recordedByName']) ??
          'Officer',
      approvedAt: _date(row['approvedAt']),
      approvedByName: _string(row['approvedByName']),
      voidedAt: _date(row['voidedAt']),
      voidedByName: _string(row['voidedByName']),
      voidReason: _string(row['voidReason']),
    );
  }

  static DailyReportAgentReturn _agentReturn(Map<String, dynamic> row) {
    return DailyReportAgentReturn(
      floatId: _string(row['floatId']) ?? '',
      agentId: _string(row['agentId']) ?? '',
      agentName: _string(row['agentName']) ?? 'Agent',
      agentPublicId: _string(row['agentPublicId']),
      amountGiven: _num(row['amountGiven']),
      amountDisbursed: _num(row['amountDisbursed']),
      processingFees: _num(row['processingFees']),
      amountCollected: _num(row['amountCollected']),
      collectedRepaymentsAvailable: _num(row['collectedRepaymentsAvailable']),
      unusedFloat: _num(row['unusedFloat']),
      expensesTotal: _num(row['expensesTotal']),
      expectedReturn: _num(row['expectedReturn']),
      amountReturned: _nullableNum(row['amountReturned']),
      variance: _nullableNum(row['variance']),
      returnedAt: _date(row['returnedAt']),
      returnedByName: _string(row['returnedByName']),
      notes: _string(row['notes']),
      status: _string(row['status']) ?? 'PENDING',
    );
  }

  static DailyReportProcessingFee _processingFee(Map<String, dynamic> row) {
    return DailyReportProcessingFee(
      id: _string(row['id']) ?? '',
      loanId: _string(row['loanId']),
      borrowerName: _string(row['borrowerName']) ?? 'Borrower',
      product: _string(row['product']),
      amount: _num(row['amount']),
      receivedAt: _date(row['receivedAt']),
      officerName: _string(row['officerName']) ?? 'Officer',
    );
  }

  static DailyReportVariance _varianceRow(Map<String, dynamic> row) {
    return DailyReportVariance(
      id: _string(row['id']) ?? '',
      source: _string(row['source']) ?? 'Variance',
      personName: _string(row['personName']),
      personPublicId: _string(row['personPublicId']),
      expectedAmount: _nullableNum(row['expectedAmount']),
      actualAmount: _nullableNum(row['actualAmount']),
      variance: _num(row['variance']),
      shortageAmount: _nullableNum(row['shortageAmount']),
      outstandingAmount: _nullableNum(row['outstandingAmount']),
      status: _string(row['status']) ?? '',
      notes: _string(row['notes']),
      clearedByName: _string(row['clearedByName']),
      clearedAt: _date(row['clearedAt']),
      occurredAt: _date(row['occurredAt']),
    );
  }

  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) {
      return value;
    }

    if (value is Map) {
      return value.map((key, value) => MapEntry(key.toString(), value));
    }

    return const {};
  }

  static List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) {
      return const [];
    }

    return value.map(_map).where((row) => row.isNotEmpty).toList();
  }

  static String? _string(Object? value) {
    if (value == null) {
      return null;
    }

    final text = value.toString().trim();

    return text.isEmpty ? null : text;
  }

  static num _num(Object? value) {
    return _nullableNum(value) ?? 0;
  }

  static num? _nullableNum(Object? value) {
    if (value is num) {
      return value;
    }

    if (value is String) {
      return num.tryParse(value.replaceAll(',', '').trim());
    }

    return null;
  }

  static num _firstNum(List<Object?> values) {
    return _firstNullableNum(values) ?? 0;
  }

  static num? _firstNullableNum(List<Object?> values) {
    for (final value in values) {
      final number = _nullableNum(value);

      if (number != null) {
        return number;
      }
    }

    return null;
  }

  static int? _int(Object? value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    if (value is String) {
      return int.tryParse(value);
    }

    return null;
  }

  static DateTime? _date(Object? value) {
    final text = _string(value);

    if (text == null) {
      return null;
    }

    return DateTime.tryParse(text);
  }
}
