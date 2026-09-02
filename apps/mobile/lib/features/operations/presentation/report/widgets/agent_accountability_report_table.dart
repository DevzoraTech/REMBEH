import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_agent_return.dart';
import 'report_section.dart';
import 'report_table.dart';

class AgentAccountabilityReportTable extends StatelessWidget {
  const AgentAccountabilityReportTable({super.key, required this.agentReturns});

  final List<DailyReportAgentReturn> agentReturns;

  @override
  Widget build(BuildContext context) {
    final totalIssued = agentReturns.fold<num>(
      0,
      (sum, row) => sum + row.amountGiven,
    );

    final totalLoans = agentReturns.fold<num>(
      0,
      (sum, row) => sum + row.amountDisbursed,
    );

    final totalCollections = agentReturns.fold<num>(
      0,
      (sum, row) => sum + row.amountCollected,
    );

    final totalExpenses = agentReturns.fold<num>(
      0,
      (sum, row) => sum + row.expensesTotal,
    );

    final totalReturned = agentReturns.fold<num>(
      0,
      (sum, row) => sum + (row.amountReturned ?? 0),
    );

    final totalVariance = agentReturns.fold<num>(
      0,
      (sum, row) => sum + (row.variance ?? 0),
    );

    return ReportSection(
      title: 'FIELD OFFICER ACCOUNTABILITY',
      child: ReportTable(
        emptyMessage:
            'No field officer float was issued during this business day.',
        columns: const [
          ReportTableColumn(label: 'Field officer', flex: 22),
          ReportTableColumn(
            label: 'Float\nissued',
            flex: 14,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Loans\nissued',
            flex: 13,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Collections',
            flex: 14,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Expenses',
            flex: 13,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Returned',
            flex: 12,
            alignment: Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Variance',
            flex: 12,
            alignment: Alignment.centerRight,
          ),
        ],
        rows: agentReturns.map(_buildRow).toList(),
        footer: agentReturns.isEmpty
            ? null
            : _TotalsRow(
                issued: totalIssued,
                loans: totalLoans,
                collections: totalCollections,
                expenses: totalExpenses,
                returned: totalReturned,
                variance: totalVariance,
              ),
      ),
    );
  }

  List<Widget> _buildRow(DailyReportAgentReturn row) {
    final variance = row.variance ?? 0;

    return [
      ReportTableStackedText(
        primary: row.agentName,
        secondary: row.agentPublicId,
      ),
      ReportTableMoney(formatMoney(row.amountGiven)),
      ReportTableMoney(formatMoney(row.amountDisbursed)),
      ReportTableMoney(formatMoney(row.amountCollected)),
      ReportTableMoney(formatMoney(row.expensesTotal)),
      row.amountReturned == null
          ? const ReportTableText('Pending', textAlign: TextAlign.right)
          : ReportTableMoney(formatMoney(row.amountReturned!)),
      ReportTableStackedText(
        primary: _signedAmount(variance),
        secondary: _status(row),
        primaryColor: variance < 0
            ? const Color(0xFFB42318)
            : variance > 0
            ? const Color(0xFFB54708)
            : forestEmerald,
        alignment: CrossAxisAlignment.end,
      ),
    ];
  }

  String _status(DailyReportAgentReturn row) {
    if (!row.hasReturned) {
      return 'Pending';
    }

    if (row.isShort) {
      return 'Shortage';
    }

    if (row.isOver) {
      return 'Excess';
    }

    return 'Balanced';
  }
}

class _TotalsRow extends StatelessWidget {
  const _TotalsRow({
    required this.issued,
    required this.loans,
    required this.collections,
    required this.expenses,
    required this.returned,
    required this.variance,
  });

  final num issued;
  final num loans;
  final num collections;
  final num expenses;
  final num returned;
  final num variance;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      child: Row(
        children: [
          const Expanded(
            flex: 22,
            child: ReportTableText('Total', strong: true),
          ),
          Expanded(
            flex: 14,
            child: ReportTableMoney(formatMoney(issued), strong: true),
          ),
          Expanded(
            flex: 13,
            child: ReportTableMoney(formatMoney(loans), strong: true),
          ),
          Expanded(
            flex: 14,
            child: ReportTableMoney(formatMoney(collections), strong: true),
          ),
          Expanded(
            flex: 13,
            child: ReportTableMoney(formatMoney(expenses), strong: true),
          ),
          Expanded(
            flex: 12,
            child: ReportTableMoney(formatMoney(returned), strong: true),
          ),
          Expanded(
            flex: 12,
            child: ReportTableMoney(
              _signedAmount(variance),
              strong: true,
              color: variance < 0 ? const Color(0xFFB42318) : forestEmerald,
            ),
          ),
        ],
      ),
    );
  }
}

String _signedAmount(num value) {
  if (value == 0) {
    return '0';
  }

  return '${value < 0 ? '-' : '+'}${formatMoney(value.abs())}';
}
