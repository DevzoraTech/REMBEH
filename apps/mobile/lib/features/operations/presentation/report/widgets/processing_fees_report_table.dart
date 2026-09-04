import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_processing_fee.dart';
import '../../../domain/utils/operation_formatters.dart';
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
            flex: 40,
          ),
          ReportTableColumn(
            label: 'Officer',
            flex: 32,
          ),
          ReportTableColumn(
            label: 'Amount',
            flex: 28,
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
        reportPersonShortName(row.officerName),
      ),
      ReportTableMoney(
        formatMoney(row.amount),
        strong: true,
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
            flex: 72,
            child: ReportTableText(
              'Total',
              strong: true,
            ),
          ),
          Expanded(
            flex: 28,
            child: ReportTableMoney(
              formatMoney(total),
              strong: true,
            ),
          ),
        ],
      ),
    );
  }
}
