import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_processing_fee.dart';
import 'report_section.dart';
import 'report_table.dart';

class ProcessingFeesReportTable extends StatelessWidget {
  const ProcessingFeesReportTable({
    super.key,
    required this.fees,
  });

  final List<DailyReportProcessingFee> fees;

  @override
  Widget build(BuildContext context) {
    final total = fees.fold<num>(
      0,
      (sum, row) => sum + row.amount,
    );

    return ReportSection(
      title: 'PROCESSING FEES',
      child: ReportTable(
        emptyMessage:
            'No processing fees were recorded during this business day.',
        columns: const [
          ReportTableColumn(
            label: 'Borrower',
            flex: 28,
          ),
          ReportTableColumn(
            label: 'Loan ID',
            flex: 24,
          ),
          ReportTableColumn(
            label: 'Amount',
            flex: 20,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Officer',
            flex: 22,
          ),
          ReportTableColumn(
            label: 'Time',
            flex: 16,
            alignment: Alignment.centerRight,
          ),
        ],
        rows: fees.map(_buildRow).toList(),
        footer: fees.isEmpty
            ? null
            : _FeeTotal(
                total: total,
              ),
      ),
    );
  }

  List<Widget> _buildRow(
    DailyReportProcessingFee row,
  ) {
    return [
      ReportTableText(
        row.borrowerName,
      ),
      ReportTableText(
        row.loanId ?? '—',
      ),
      ReportTableMoney(
        formatMoney(row.amount),
        strong: true,
      ),
      ReportTableText(
        row.officerName,
      ),
      ReportTableText(
        _displayTime(
          row.receivedAt,
        ),
        textAlign: TextAlign.right,
      ),
    ];
  }
}

class _FeeTotal extends StatelessWidget {
  const _FeeTotal({
    required this.total,
  });

  final num total;

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
            flex: 52,
            child: ReportTableText(
              'Total',
              strong: true,
            ),
          ),
          Expanded(
            flex: 20,
            child: ReportTableMoney(
              formatMoney(total),
              strong: true,
            ),
          ),
          const Expanded(
            flex: 38,
            child: SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

String _displayTime(DateTime? value) {
  if (value == null) return '—';

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