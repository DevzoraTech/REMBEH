import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../../utils/money.dart';
import '../../domain/models/operation_dashboard_data.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class CashPositionCard extends StatelessWidget {
  const CashPositionCard({super.key, required this.operation});

  final OperationDashboardData operation;

  @override
  Widget build(BuildContext context) {
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
            'Expected cash currently',
            style: TextStyle(
              color: slateText,
              fontSize: 10.5,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 10),
          _CashLine(label: 'Opening cash', amount: operation.openingCash),
          _CashLine(
            label: 'Capital received',
            amount: operation.capitalReceived,
          ),
          _CashLine(
            label: 'Collections',
            amount: operation.collections,
            positive: true,
          ),
          _CashLine(
            label: 'Processing fees',
            amount: operation.processingFees,
            positive: true,
          ),
          _CashLine(
            label: 'Loans disbursed',
            amount: operation.loansDisbursed,
            negative: true,
          ),
          _CashLine(
            label: 'Expenses',
            amount: operation.expenses,
            negative: true,
          ),
          const SizedBox(height: 4),
          const Divider(height: 1, color: Color(0xFFE8ECE9)),
          const SizedBox(height: 9),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Expected closing cash',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 10.5,
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
                    fontSize: 12.5,
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
    var prefix = '';

    if (positive && amount != 0) {
      valueColor = forestEmerald;
      prefix = '+ ';
    }

    if (negative && amount != 0) {
      valueColor = const Color(0xFFC62828);
      prefix = '− ';
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
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            '${prefix}UGX ${formatMoney(amount)}',
            style: TextStyle(
              color: valueColor,
              fontSize: 10.5,
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
