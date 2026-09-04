import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_cash_position.dart';
import 'report_typography.dart';

class CashMovementReportTable extends StatelessWidget {
  const CashMovementReportTable({super.key, required this.cash});

  final DailyReportCashPosition cash;

  @override
  Widget build(BuildContext context) {
    final totalAdditions =
        cash.openingCash +
        cash.capitalReceived +
        cash.repaymentsCollected +
        cash.processingFees +
        cash.shortageRecoveries;
    final totalCashouts =
        cash.expenses + cash.salaries + cash.loansIssued;
    final stack = MediaQuery.sizeOf(context).width < 640;

    final additions = _MovementBlock(
      title: 'ADDITIONS',
      icon: Icons.arrow_upward_rounded,
      accent: forestEmerald,
      fill: const Color(0xFFEFF8F2),
      totalLabel: 'TOTAL',
      totalAmount: totalAdditions,
      children: [
        _CashLine(label: 'Opening Balance', value: cash.openingCash),
        _CashLine(label: 'Capital received', value: cash.capitalReceived),
        _CashLine(
          label: 'Cash in',
          value: cash.repaymentsCollected,
          positive: true,
        ),
        _CashLine(
          label: 'Processing fees',
          value: cash.processingFees,
          positive: true,
        ),
        _CashLine(
          label: 'Shortage cleared',
          value: cash.shortageRecoveries,
          positive: true,
        ),
      ],
    );

    final cashouts = _MovementBlock(
      title: 'CASHOUTS',
      icon: Icons.arrow_downward_rounded,
      accent: const Color(0xFFB42318),
      fill: const Color(0xFFFFF0EC),
      totalLabel: 'TOTAL',
      totalAmount: totalCashouts,
      children: [
        _CashLine(
          label: 'Total Expenses',
          value: cash.expenses,
          negative: true,
        ),
        _CashLine(label: 'Salary', value: cash.salaries, negative: true),
        _CashLine(
          label: 'Loans issued',
          value: cash.loansIssued,
          negative: true,
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionTitle(number: '1.', title: 'CASH POSITION SUMMARY'),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: line),
          ),
          child: stack
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    additions,
                    Container(height: 1, color: line),
                    cashouts,
                  ],
                )
              : IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: additions),
                      Container(width: 1, color: line),
                      Expanded(child: cashouts),
                    ],
                  ),
                ),
        ),
        Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(
              left: BorderSide(color: line),
              right: BorderSide(color: line),
              bottom: BorderSide(color: line),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _ClosingMetric(
                  label: 'Expected closing balance',
                  value: cash.expectedClosingCash,
                  color: forestEmerald,
                ),
              ),
              const _MetricDivider(),
              Expanded(
                child: _ClosingMetric(
                  label: 'Counted closing balance',
                  value: cash.countedCash,
                ),
              ),
              const _MetricDivider(),
              Expanded(child: _VarianceMetric(variance: cash.variance)),
            ],
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'Counted and confirmed by the manager.',
          style: TextStyle(
            color: slateText,
            fontSize: ReportType.caption(context),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.number, required this.title});

  final String number;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          number,
          style: TextStyle(
            color: forestEmerald,
            fontSize: ReportType.section(context),
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          title,
          style: TextStyle(
            color: forestEmerald,
            fontSize: ReportType.section(context),
            fontWeight: FontWeight.w900,
            letterSpacing: 0.1,
          ),
        ),
      ],
    );
  }
}

class _MovementBlock extends StatelessWidget {
  const _MovementBlock({
    required this.title,
    required this.icon,
    required this.accent,
    required this.fill,
    required this.totalLabel,
    required this.totalAmount,
    required this.children,
  });

  final String title;
  final IconData icon;
  final Color accent;
  final Color fill;
  final String totalLabel;
  final num totalAmount;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 9, 10, 4),
          child: Row(
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 13, color: accent),
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: TextStyle(
                  color: accent,
                  fontSize: ReportType.body(context),
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
          child: Column(children: children),
        ),
        Container(
          color: fill,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  totalLabel,
                  style: TextStyle(
                    color: accent,
                    fontSize: ReportType.body(context),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                'UGX ${formatMoney(totalAmount)}',
                style: TextStyle(
                  color: accent,
                  fontSize: ReportType.body(context),
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CashLine extends StatelessWidget {
  const _CashLine({
    required this.label,
    required this.value,
    this.positive = false,
    this.negative = false,
  });

  final String label;
  final num value;

  final bool positive;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    final valueColor = positive
        ? forestEmerald
        : negative
        ? const Color(0xFFB42318)
        : midnightNavy;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3.3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: midnightNavy,
                fontSize: ReportType.body(context),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'UGX ${formatMoney(value)}',
            textAlign: TextAlign.right,
            style: TextStyle(
              color: valueColor,
              fontSize: ReportType.body(context),
              fontWeight: positive || negative
                  ? FontWeight.w800
                  : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClosingMetric extends StatelessWidget {
  const _ClosingMetric({
    required this.label,
    required this.value,
    this.color = midnightNavy,
  });

  final String label;
  final num? value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: slateText,
              fontSize: ReportType.caption(context),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value == null ? '—' : 'UGX ${formatMoney(value!)}',
              style: TextStyle(
                color: color,
                fontSize: ReportType.money(context),
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VarianceMetric extends StatelessWidget {
  const _VarianceMetric({required this.variance});

  final num? variance;

  @override
  Widget build(BuildContext context) {
    final value = variance;

    if (value == null) {
      return const _ClosingMetric(label: 'Variance', value: null);
    }

    final isShortage = value < 0;
    final isExcess = value > 0;
    final color = isShortage
        ? const Color(0xFFB42318)
        : isExcess
        ? const Color(0xFFB54708)
        : forestEmerald;
    final label = isShortage
        ? 'Variance (Shortage)'
        : isExcess
        ? 'Variance (Excess)'
        : 'Variance';
    final prefix = value < 0
        ? '- '
        : value > 0
        ? '+ '
        : '';

    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      color: isShortage ? const Color(0xFFFFF8F7) : null,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: color,
              fontSize: ReportType.caption(context),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              '${prefix}UGX ${formatMoney(value.abs())}',
              style: TextStyle(
                color: color,
                fontSize: ReportType.money(context),
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricDivider extends StatelessWidget {
  const _MetricDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 56, color: line);
  }
}
