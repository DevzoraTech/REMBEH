import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_repayment.dart';
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
          ReportTableColumn(label: 'Time', flex: 13),
          ReportTableColumn(label: 'Loan ID', flex: 20),
          ReportTableColumn(label: 'Borrower', flex: 24),
          ReportTableColumn(label: 'Paid by', flex: 14),
          ReportTableColumn(
            label: 'Amount',
            flex: 17,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(label: 'Collected by', flex: 20),
          ReportTableColumn(label: 'Method', flex: 13),
        ],
        rows: repayments.map(_buildRow).toList(),
        footer: repayments.isEmpty ? null : _RepaymentTotal(total: total),
      ),
    );
  }

  List<Widget> _buildRow(DailyReportRepayment row) {
    return [
      ReportTableText(_displayTime(row.paidAt), maxLines: 1),
      ReportTableText(row.loanId ?? '—'),
      ReportTableText(row.borrowerName),
      const ReportTableText('Field Officer'),
      ReportTableMoney(formatMoney(row.amount)),
      ReportTableText(row.recordedByName),
      ReportTableText(_methodLabel(row.method)),
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
            flex: 71,
            child: ReportTableText('Total', strong: true),
          ),
          Expanded(
            flex: 17,
            child: ReportTableMoney(formatMoney(total), strong: true),
          ),
          const Expanded(flex: 33, child: SizedBox.shrink()),
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

  final minute = local.minute.toString().padLeft(2, '0');

  return '$hour:$minute '
      '${local.hour >= 12 ? 'PM' : 'AM'}';
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
