import 'package:flutter/material.dart';

import '../../../../theme.dart';

class ReconcileCloseCard extends StatelessWidget {
  const ReconcileCloseCard({
    super.key,
    required this.onTap,
  });

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFFFAEE),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: warmGold.withValues(alpha: 0.24),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Row(
            children: [
              Icon(
                Icons.balance_outlined,
                color: warmGold,
                size: 24,
              ),
              SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Reconcile & close day',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Count branch cash and reconcile today\'s operations.',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 9,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: midnightNavy,
                size: 21,
              ),
            ],
          ),
        ),
      ),
    );
  }
}