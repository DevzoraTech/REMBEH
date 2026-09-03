import 'package:flutter/material.dart';

import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_expense.dart';
import 'report_section.dart';
import 'report_table.dart';
import 'report_typography.dart';

class ExpensesReportTable extends StatelessWidget {
  const ExpensesReportTable({
    super.key,
    required this.expenses,
  });

  final List<DailyReportExpense> expenses;

  @override
  Widget build(BuildContext context) {
    final active = expenses
        .where(
          (expense) =>
              !expense.isVoided,
        )
        .toList();

    final total = active.fold<num>(
      0,
      (sum, row) => sum + row.amount,
    );

    return ReportSection(
      title: 'EXPENSES',
      trailing: active.isEmpty
          ? null
          : Text(
              'Total expenses:  UGX ${formatMoney(total)}',
              style: TextStyle(
                color: const Color(
                  0xFFB42318,
                ),
                fontSize: ReportType.secondary(context),
                fontWeight:
                    FontWeight.w800,
              ),
            ),
      child: ReportTable(
        emptyMessage:
            'No expenses were recorded during this business day.',
        columns: const [
          ReportTableColumn(
            label: 'Time',
            flex: 14,
          ),
          ReportTableColumn(
            label: 'Expense type',
            flex: 20,
          ),
          ReportTableColumn(
            label: 'Description',
            flex: 29,
          ),
          ReportTableColumn(
            label: 'Amount',
            flex: 18,
            alignment:
                Alignment.centerRight,
          ),
          ReportTableColumn(
            label: 'Paid by',
            flex: 19,
          ),
        ],
        rows: active.map(_buildRow).toList(),
        footer: active.isEmpty
            ? null
            : _ExpenseTotal(
                total: total,
              ),
      ),
    );
  }

  List<Widget> _buildRow(
    DailyReportExpense expense,
  ) {
    return [
      ReportTableText(
        _displayTime(
          expense.incurredAt,
        ),
        maxLines: 1,
      ),
      ReportTableText(
        _categoryLabel(
          expense.category,
        ),
        strong: true,
      ),
      ReportTableText(
        expense.description ?? '—',
        maxLines: 2,
      ),
      ReportTableMoney(
        formatMoney(
          expense.amount,
        ),
      ),
      ReportTableText(
        expense.recordedByName,
      ),
    ];
  }
}

class _ExpenseTotal
    extends StatelessWidget {
  const _ExpenseTotal({
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
            flex: 63,
            child: ReportTableText(
              'Total',
              strong: true,
            ),
          ),
          Expanded(
            flex: 18,
            child: ReportTableMoney(
              formatMoney(total),
              strong: true,
            ),
          ),
          const Expanded(
            flex: 19,
            child: SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

String _categoryLabel(String raw) {
  final normalized = raw.trim().toUpperCase();
  if (normalized == 'FIELD_FLOAT') {
    return 'Field float';
  }
  if (normalized == 'OTHER') {
    return 'Expense';
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