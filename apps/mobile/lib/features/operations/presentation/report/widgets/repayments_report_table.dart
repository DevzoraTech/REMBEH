import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_repayment.dart';
import '../../../domain/utils/operation_formatters.dart';
import 'report_section.dart';
import 'report_table.dart';

class RepaymentsReportTable extends StatelessWidget {
  const RepaymentsReportTable({super.key, required this.repayments});

  final List<DailyReportRepayment> repayments;

  @override
  Widget build(BuildContext context) {
    final total = repayments.fold<num>(0, (sum, row) => sum + row.amount);

    return ReportSection(
      title: 'REPAYMENTS COLLECTED',
      child: ReportTable(
        emptyMessage: 'No repayments were recorded during this business day.',
        columns: const [
          ReportTableColumn(label: 'Borrower', flex: 28),
          ReportTableColumn(label: 'Collected by', flex: 22),
          ReportTableColumn(label: 'Role', flex: 16),
          ReportTableColumn(label: 'Method', flex: 14),
          ReportTableColumn(
            label: 'Amount',
            flex: 20,
            alignment: Alignment.centerRight,
          ),
        ],
        rows: repayments.map(_buildRow).toList(),
        footer: repayments.isEmpty ? null : _RepaymentTotal(total: total),
      ),
    );
  }

  List<Widget> _buildRow(DailyReportRepayment row) {
    return [
      ReportTableText(row.borrowerName),
      ReportTableText(reportPersonShortName(row.recordedByName)),
      const ReportTableText('Field Officer'),
      ReportTableText(_methodLabel(row.method)),
      ReportTableMoney(formatMoney(row.amount)),
    ];
  }
}

class _RepaymentTotal extends StatelessWidget {
  const _RepaymentTotal({required this.total});

  final num total;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          const Expanded(
            flex: 80,
            child: ReportTableText('Total', strong: true),
          ),
          Expanded(
            flex: 20,
            child: ReportTableMoney(formatMoney(total), strong: true),
          ),
        ],
      ),
    );
  }
}

String _methodLabel(String? raw) {
  if (raw == null || raw.trim().isEmpty) {
    return 'Cash';
  }

  return raw
      .trim()
      .toLowerCase()
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');
}
