// lib/features/operations/domain/models/report/daily_report_data.dart

import 'daily_report_agent_return.dart';
import 'daily_report_cash_position.dart';
import 'daily_report_expense.dart';
import 'daily_report_loan.dart';
import 'daily_report_processing_fee.dart';
import 'daily_report_repayment.dart';
import 'daily_report_variance.dart';

class DailyReportData {
  const DailyReportData({
    required this.reportNumber,
    required this.operationDate,
    required this.status,
    required this.organizationName,
    required this.branchName,
    required this.managerName,
    required this.cashPosition,
    required this.loans,
    required this.repayments,
    required this.expenses,
    required this.agentReturns,
    required this.processingFees,
    required this.variances,
    this.branchAddress,
    this.branchPhone,
    this.branchEmail,
    this.generatedAt,
    this.managerNotes,
  });

  final String reportNumber;

  final String operationDate;

  final String status;

  final String organizationName;

  final String branchName;
  final String? branchAddress;
  final String? branchPhone;
  final String? branchEmail;

  final String managerName;

  final DateTime? generatedAt;

  final DailyReportCashPosition cashPosition;

  final List<DailyReportLoan> loans;

  final List<DailyReportRepayment> repayments;

  final List<DailyReportExpense> expenses;

  final List<DailyReportAgentReturn> agentReturns;

  final List<DailyReportProcessingFee> processingFees;

  final List<DailyReportVariance> variances;

  final String? managerNotes;

  int get loansIssuedCount => loans.length;

  num get totalLoansIssued {
    return loans.fold<num>(0, (total, loan) => total + loan.principalAmount);
  }

  num get averageLoanSize {
    if (loans.isEmpty) {
      return 0;
    }

    return totalLoansIssued / loans.length;
  }

  int get repaymentCount => repayments.length;

  num get totalRepayments {
    return repayments.fold<num>(
      0,
      (total, repayment) => total + repayment.amount,
    );
  }

  num get averageRepayment {
    if (repayments.isEmpty) {
      return 0;
    }

    return totalRepayments / repayments.length;
  }

  num get totalExpenses {
    return expenses
        .where((expense) => !expense.isVoided)
        .fold<num>(0, (total, expense) => total + expense.amount);
  }

  num get totalProcessingFees {
    return processingFees.fold<num>(0, (total, fee) => total + fee.amount);
  }
}
