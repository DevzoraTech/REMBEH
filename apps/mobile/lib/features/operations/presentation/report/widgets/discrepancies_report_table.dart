import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_variance.dart';
import 'report_section.dart';
import 'report_table.dart';

class DiscrepanciesReportTable extends StatelessWidget {
  const DiscrepanciesReportTable({
    super.key,
    required this.variances,
  });

  final List<DailyReportVariance> variances;

  @override
  Widget build(BuildContext context) {
    final totalShortages = variances.fold<num>(
      0,
      (sum, variance) {
        if (!variance.isShortage) {
          return sum;
        }

        return sum + variance.variance.abs();
      },
    );

    final totalExcess = variances.fold<num>(
      0,
      (sum, variance) {
        if (!variance.isExcess) {
          return sum;
        }

        return sum + variance.variance;
      },
    );

    return ReportSection(
      title: 'Discrepancies',
      subtitle:
          'Cash shortages, excesses and unresolved differences identified during the day.',
      child: ReportTable(
        minimumWidth: 900,
        emptyMessage:
            'No discrepancies were recorded for this business day.',
        columns: const [
          ReportTableColumn(
            label: 'Source',
            flex: 3,
          ),
          ReportTableColumn(
            label: 'Responsible',
            flex: 3,
          ),
          ReportTableColumn(
            label: 'Expected',
            flex: 2,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Actual',
            flex: 2,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Variance',
            flex: 2,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Outstanding',
            flex: 2,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Status',
            flex: 2,
          ),
          ReportTableColumn(
            label: 'Notes',
            flex: 3,
          ),
        ],
        rows: variances.map(_buildRow).toList(),
        footer: variances.isEmpty
            ? null
            : _DiscrepanciesFooter(
                count: variances.length,
                totalShortages: totalShortages,
                totalExcess: totalExcess,
              ),
      ),
    );
  }

  List<Widget> _buildRow(
    DailyReportVariance variance,
  ) {
    final status = _label(variance.status);

    return [
      ReportTableText(
        variance.source,
        strong: true,
      ),
      ReportTableStackedText(
        primary: variance.personName ?? 'Branch',
        secondary: variance.personPublicId,
      ),
      ReportTableText(
        variance.expectedAmount == null
            ? '—'
            : 'UGX ${formatMoney(variance.expectedAmount!)}',
        textAlign: TextAlign.right,
      ),
      ReportTableText(
        variance.actualAmount == null
            ? '—'
            : 'UGX ${formatMoney(variance.actualAmount!)}',
        textAlign: TextAlign.right,
      ),
      ReportTableStackedText(
        primary: _varianceMoney(
          variance.variance,
        ),
        secondary: variance.isShortage
            ? 'Shortage'
            : variance.isExcess
                ? 'Excess'
                : 'Balanced',
        primaryColor: variance.isShortage
            ? const Color(0xFFB42318)
            : variance.isExcess
                ? const Color(0xFFB54708)
                : null,
      ),
      ReportTableText(
        variance.outstandingAmount == null
            ? '—'
            : 'UGX ${formatMoney(variance.outstandingAmount!)}',
        textAlign: TextAlign.right,
      ),
      ReportTableText(
        status.isEmpty ? '—' : status,
        strong: true,
      ),
      ReportTableText(
        variance.notes?.trim().isNotEmpty == true
            ? variance.notes!
            : '—',
      ),
    ];
  }
}

class _DiscrepanciesFooter extends StatelessWidget {
  const _DiscrepanciesFooter({
    required this.count,
    required this.totalShortages,
    required this.totalExcess,
  });

  final int count;
  final num totalShortages;
  final num totalExcess;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        12,
        10,
        12,
        12,
      ),
      child: Row(
        children: [
          Expanded(
            child: ReportTableStackedText(
              primary: count == 1
                  ? '1 discrepancy'
                  : '$count discrepancies',
              secondary: 'Recorded',
            ),
          ),
          if (totalShortages > 0)
            Padding(
              padding: const EdgeInsets.only(
                right: 24,
              ),
              child: ReportTableStackedText(
                primary:
                    'UGX ${formatMoney(totalShortages)}',
                secondary: 'Total shortages',
                primaryColor:
                    const Color(0xFFB42318),
              ),
            ),
          if (totalExcess > 0)
            ReportTableStackedText(
              primary:
                  'UGX ${formatMoney(totalExcess)}',
              secondary: 'Total excess',
              primaryColor:
                  const Color(0xFFB54708),
            ),
        ],
      ),
    );
  }
}

String _varianceMoney(num value) {
  if (value == 0) {
    return 'UGX ${formatMoney(0)}';
  }

  final prefix = value < 0 ? '-' : '+';

  return '$prefix UGX ${formatMoney(value.abs())}';
}

String _label(String raw) {
  return raw
      .trim()
      .toLowerCase()
      .split('_')
      .where(
        (part) => part.isNotEmpty,
      )
      .map(
        (part) =>
            '${part[0].toUpperCase()}${part.substring(1)}',
      )
      .join(' ');
}