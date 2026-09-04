import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../../utils/money.dart';
import '../../domain/models/operation_dashboard_data.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class CashPositionCard extends StatelessWidget {
  const CashPositionCard({
    super.key,
    required this.operation,
  });

  final OperationDashboardData operation;

  @override
  Widget build(BuildContext context) {
    final shortageCleared = operation.shortageRecoveries;
    final additionsTotal =
        operation.openingCash +
        operation.capitalReceived +
        operation.collections +
        operation.processingFees +
        shortageCleared;
    final cashoutsTotal =
        operation.expenses + operation.salaries + operation.loansDisbursed;

    return OpsSurface(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        children: [
          const Row(
            children: [
              OpsIcon(icon: Icons.account_balance_wallet_outlined),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Cash position',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Icon(Icons.info_outline_rounded, size: 16, color: slateText),
            ],
          ),
          const SizedBox(height: 9),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              'UGX ${formatMoney(operation.expectedClosingCash)}',
              style: const TextStyle(
                color: forestEmerald,
                fontSize: 27,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.4,
                height: 1,
              ),
            ),
          ),
          const SizedBox(height: 3),
          const Text(
            'Expected closing balance',
            style: TextStyle(
              color: slateText,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          _MovementBlock(
            title: 'ADDITIONS',
            icon: Icons.arrow_upward_rounded,
            accent: forestEmerald,
            fill: const Color(0xFFEFF8F2),
            totalLabel: 'TOTAL',
            totalAmount: additionsTotal,
            children: [
              _CashLine(label: 'Opening Balance', amount: operation.openingCash),
              _CashLine(
                label: 'Capital received',
                amount: operation.capitalReceived,
              ),
              _CashLine(
                label: 'Cash in',
                amount: operation.collections,
                positive: true,
              ),
              _CashLine(
                label: 'Processing fees',
                amount: operation.processingFees,
                positive: true,
              ),
              if (shortageCleared != 0)
                _CashLine(
                  label: 'Shortage cleared',
                  amount: shortageCleared,
                  positive: true,
                ),
            ],
          ),
          const SizedBox(height: 10),
          _MovementBlock(
            title: 'CASHOUTS',
            icon: Icons.arrow_downward_rounded,
            accent: const Color(0xFFC62828),
            fill: const Color(0xFFFFF0EC),
            totalLabel: 'TOTAL',
            totalAmount: cashoutsTotal,
            children: [
              _CashLine(
                label: 'Total Expenses',
                amount: operation.expenses,
                negative: true,
              ),
              _CashLine(
                label: 'Salary',
                amount: operation.salaries,
                negative: true,
              ),
              _CashLine(
                label: 'Loans issued',
                amount: operation.loansDisbursed,
                negative: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(height: 1, color: Color(0xFFE8ECE9)),
          const SizedBox(height: 9),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Expected closing balance',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  'UGX ${formatMoney(operation.expectedClosingCash)}',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
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
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: accent.withValues(alpha: 0.16)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
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
                    fontSize: 12,
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
            width: double.infinity,
            color: fill,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    totalLabel,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  'UGX ${formatMoney(totalAmount)}',
                  style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CashLine extends StatelessWidget {
  const _CashLine({
    required this.label,
    required this.amount,
    this.positive = false,
    this.negative = false,
  });

  final String label;
  final num amount;
  final bool positive;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    var valueColor = midnightNavy;

    if (positive && amount != 0) {
      valueColor = forestEmerald;
    }

    if (negative && amount != 0) {
      valueColor = const Color(0xFFC62828);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF4D5258),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(amount)}',
            style: TextStyle(
              color: valueColor,
              fontSize: 12,
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
