import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../../../utils/money.dart';
import '../../../domain/models/report/daily_report_cash_position.dart';

class CashMovementReportTable extends StatelessWidget {
  const CashMovementReportTable({super.key, required this.cash});

  final DailyReportCashPosition cash;

  @override
  Widget build(BuildContext context) {
    final totalAdditions = cash.repaymentsCollected + cash.processingFees;

    final netDeductions = cash.expenses + cash.floatIssued - cash.floatReturned;

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
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
                  child: Column(
                    children: [
                      _CashLine(label: 'Opening cash', value: cash.openingCash),
                      _CashLine(
                        label: 'Capital received',
                        value: cash.capitalReceived,
                      ),
                      _CashLine(
                        label: 'Total cash available',
                        value: cash.totalCashAvailable,
                        strong: true,
                      ),

                      const SizedBox(height: 8),

                      _CashLine(
                        label: 'Repayments collected',
                        value: cash.repaymentsCollected,
                        positive: true,
                      ),
                      _CashLine(
                        label: 'Loan processing fees',
                        value: cash.processingFees,
                        positive: true,
                      ),
                      _CashLine(
                        label: 'Total additions',
                        value: totalAdditions,
                        strong: true,
                        positive: true,
                      ),
                    ],
                  ),
                ),
              ),

              Container(width: 1, height: 136, color: line),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
                  child: Column(
                    children: [
                      _CashLine(
                        label: 'Expenses',
                        value: cash.expenses,
                        negative: true,
                      ),
                      _CashLine(
                        label: 'Float issued to field officers',
                        value: cash.floatIssued,
                        negative: true,
                      ),
                      _CashLine(
                        label: 'Float returned',
                        value: cash.floatReturned,
                        positive: true,
                      ),

                      const SizedBox(height: 8),

                      _CashLine(
                        label: 'Net deductions',
                        value: netDeductions,
                        strong: true,
                        negative: netDeductions > 0,
                      ),
                    ],
                  ),
                ),
              ),
            ],
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
                  label: 'Expected closing cash',
                  value: cash.expectedClosingCash,
                  color: forestEmerald,
                ),
              ),

              const _MetricDivider(),

              Expanded(
                child: _ClosingMetric(
                  label: 'Counted cash',
                  value: cash.countedCash,
                ),
              ),

              const _MetricDivider(),

              Expanded(child: _VarianceMetric(variance: cash.variance)),
            ],
          ),
        ),

        const SizedBox(height: 5),

        const Text(
          'Counted and confirmed by the manager.',
          style: TextStyle(
            color: slateText,
            fontSize: 7,
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
          style: const TextStyle(
            color: forestEmerald,
            fontSize: 10,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          title,
          style: const TextStyle(
            color: forestEmerald,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.1,
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
    this.strong = false,
    this.positive = false,
    this.negative = false,
  });

  final String label;
  final num value;

  final bool strong;
  final bool positive;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    final valueColor = positive
        ? forestEmerald
        : negative
        ? const Color(0xFFB42318)
        : midnightNavy;

    final prefix = positive
        ? '+ '
        : negative
        ? '- '
        : '';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3.3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: midnightNavy,
                fontSize: 7.6,
                fontWeight: strong ? FontWeight.w800 : FontWeight.w500,
              ),
            ),
          ),

          const SizedBox(width: 6),

          Text(
            '${prefix}UGX ${formatMoney(value.abs())}',
            textAlign: TextAlign.right,
            style: TextStyle(
              color: valueColor,
              fontSize: 7.6,
              fontWeight: strong || positive || negative
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
            style: const TextStyle(
              color: slateText,
              fontSize: 7.3,
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
                fontSize: 11,
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
              fontSize: 7.3,
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
                fontSize: 11,
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
