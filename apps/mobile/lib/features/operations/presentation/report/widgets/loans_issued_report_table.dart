import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_loan.dart';
import '../../../domain/utils/operation_formatters.dart';
import 'report_section.dart';
import 'report_table.dart';

class LoansIssuedReportTable extends StatelessWidget {
  const LoansIssuedReportTable({
    super.key,
    required this.loans,
  });

  final List<DailyReportLoan> loans;

  @override
  Widget build(BuildContext context) {
    final principalTotal = loans.fold<num>(
      0,
      (sum, loan) => sum + loan.principalAmount,
    );

    return ReportSection(
      title: 'LOANS ISSUED TODAY',
      child: ReportTable(
        emptyMessage: 'No loans were issued during this business day.',
        columns: const [
          ReportTableColumn(label: 'Borrower', flex: 34),
          ReportTableColumn(
            label: 'Duration',
            flex: 20,
            alignment: Alignment.center,
          ),
          ReportTableColumn(label: 'Issued By', flex: 28),
          ReportTableColumn(
            label: 'Principal',
            flex: 18,
            alignment: Alignment.centerRight,
          ),
        ],
        rows: loans.map(_buildRow).toList(),
        footer: loans.isEmpty
            ? null
            : _LoanTotal(principal: principalTotal),
      ),
    );
  }

  List<Widget> _buildRow(DailyReportLoan loan) {
    return [
      ReportTableText(loan.borrowerName),
      ReportTableText(
        loan.durationDays == null ? '—' : '${loan.durationDays} days',
        textAlign: TextAlign.center,
      ),
      ReportTableText(reportPersonShortName(loan.officerName)),
      ReportTableMoney(
        formatMoney(loan.principalAmount),
        strong: true,
      ),
    ];
  }
}

class _LoanTotal extends StatelessWidget {
  const _LoanTotal({required this.principal});

  final num principal;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          const Expanded(
            flex: 82,
            child: ReportTableText('Total', strong: true),
          ),
          Expanded(
            flex: 18,
            child: ReportTableMoney(
              formatMoney(principal),
              strong: true,
            ),
          ),
        ],
      ),
    );
  }
}
