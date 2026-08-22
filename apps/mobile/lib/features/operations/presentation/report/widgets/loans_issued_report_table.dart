import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_loan.dart';
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
        emptyMessage:
            'No loans were issued during this business day.',
        columns: const [
          ReportTableColumn(
            label: 'Loan ID',
            flex: 19,
          ),
          ReportTableColumn(
            label: 'Borrower',
            flex: 25,
          ),
          ReportTableColumn(
            label: 'Principal\n(UGX)',
            flex: 20,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Duration',
            flex: 14,
            alignment: Alignment.center,
          ),
          ReportTableColumn(
            label: 'Issued By',
            flex: 17,
          ),
          ReportTableColumn(
            label: 'Time',
            flex: 13,
            alignment: Alignment.centerRight,
          ),
        ],
        rows: loans.map(_buildRow).toList(),
        footer: loans.isEmpty
            ? null
            : _LoanTotal(
                principal: principalTotal,
              ),
      ),
    );
  }

  List<Widget> _buildRow(
    DailyReportLoan loan,
  ) {
    return [
      ReportTableText(
        loan.loanId ?? '—',
        strong: true,
      ),
      ReportTableText(
        loan.borrowerName,
      ),
      ReportTableMoney(
        formatMoney(
          loan.principalAmount,
        ),
        strong: true,
      ),
      ReportTableText(
        loan.durationDays == null
            ? '—'
            : '${loan.durationDays} days',
        textAlign: TextAlign.center,
      ),
      ReportTableText(
        loan.officerName,
      ),
      ReportTableText(
        _displayTime(
          loan.issuedAt,
        ),
        textAlign: TextAlign.right,
        maxLines: 1,
      ),
    ];
  }
}

class _LoanTotal extends StatelessWidget {
  const _LoanTotal({
    required this.principal,
  });

  final num principal;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 8,
      ),
      child: Row(
        children: [
          const Expanded(
            flex: 44,
            child: ReportTableText(
              'Total',
              strong: true,
            ),
          ),
          Expanded(
            flex: 20,
            child: ReportTableMoney(
              formatMoney(principal),
              strong: true,
            ),
          ),
          const Expanded(
            flex: 44,
            child: SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

String _displayTime(DateTime? value) {
  if (value == null) {
    return '—';
  }

  final local = value.toLocal();

  final hour = local.hour == 0
      ? 12
      : local.hour > 12
          ? local.hour - 12
          : local.hour;

  final minute =
      local.minute.toString().padLeft(2, '0');

  return '$hour:$minute '
      '${local.hour >= 12 ? 'PM' : 'AM'}';
}