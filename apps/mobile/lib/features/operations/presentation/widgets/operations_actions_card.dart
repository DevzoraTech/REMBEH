import 'package:flutter/material.dart';

import '../../../../theme.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class OperationsActionsCard extends StatelessWidget {
  const OperationsActionsCard({
    super.key,
    required this.canReceiveCapital,
    required this.canAllocateFloat,
    required this.canRecordExpense,
    required this.canRecordBanking,
    required this.onReceiveCapital,
    required this.onAllocateFloat,
    required this.onRecordExpense,
    required this.onRecordBanking,
    this.canOpenShortages = false,
    this.onOpenShortages,
  });

  final bool canReceiveCapital;
  final bool canAllocateFloat;
  final bool canRecordExpense;
  final bool canRecordBanking;
  final bool canOpenShortages;

  final VoidCallback onReceiveCapital;
  final VoidCallback onAllocateFloat;
  final VoidCallback onRecordExpense;
  final VoidCallback onRecordBanking;
  final VoidCallback? onOpenShortages;

  @override
  Widget build(BuildContext context) {
    final actions = <Widget>[
      _Action(
        icon: Icons.account_balance_wallet_outlined,
        label: 'Receive\ncapital',
        enabled: canReceiveCapital,
        onTap: onReceiveCapital,
      ),
      _Action(
        icon: Icons.outbox_outlined,
        label: 'Allocate\nfloat',
        enabled: canAllocateFloat,
        onTap: onAllocateFloat,
      ),
      _Action(
        icon: Icons.receipt_long_outlined,
        label: 'Expenses',
        enabled: canRecordExpense,
        onTap: onRecordExpense,
      ),
      if (onOpenShortages != null)
        _Action(
          icon: Icons.warning_amber_rounded,
          label: 'Shortage',
          enabled: canOpenShortages,
          onTap: onOpenShortages,
        ),
    ];

    return OpsSurface(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              OpsIcon(icon: Icons.bolt_rounded),
              SizedBox(width: 10),
              Text(
                'Actions',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Row(
            children: [
              for (var index = 0; index < actions.length; index++) ...[
                if (index > 0) const SizedBox(width: 7),
                Expanded(child: actions[index]),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(9),
            child: InkWell(
              onTap: canRecordBanking ? onRecordBanking : null,
              borderRadius: BorderRadius.circular(9),
              child: Container(
                constraints: const BoxConstraints(minHeight: 60),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFEDF0EE)),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Opacity(
                  opacity: canRecordBanking ? 1 : 0.38,
                  child: const Row(
                    children: [
                      Icon(
                        Icons.account_balance_outlined,
                        color: forestEmerald,
                        size: 28,
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Banking',
                              style: TextStyle(
                                color: midnightNavy,
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Record and view banking records',
                              style: TextStyle(
                                color: slateText,
                                fontSize: 10.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, color: midnightNavy),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.enabled,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(9),
        child: Container(
          height: 70,
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 7),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFEDF0EE)),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Opacity(
            opacity: enabled ? 1 : 0.38,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 21, color: forestEmerald),
                const SizedBox(height: 5),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    height: 1.05,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
