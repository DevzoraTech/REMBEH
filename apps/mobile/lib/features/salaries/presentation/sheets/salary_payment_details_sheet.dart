import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';

class SalaryPaymentDetailsSheet extends StatelessWidget {
  const SalaryPaymentDetailsSheet({
    super.key,
    required this.employee,
    required this.payment,
    required this.onReverse,
  });

  final SalaryEmployee employee;
  final SalaryPayment payment;
  final VoidCallback onReverse;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 10,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 48,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Payment Details',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded, color: midnightNavy),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                SalaryAvatar(
                  name: employee.fullName,
                  photoUrl: employee.photoUrl,
                  radius: 26,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    employee.fullName,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: forestEmerald.withValues(alpha: 0.06),
                border: Border.all(
                  color: forestEmerald.withValues(alpha: 0.14),
                ),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.check_circle_outline_rounded,
                    color: forestEmerald,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Payment',
                          style: TextStyle(
                            color: midnightNavy,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          salaryMoney(payment.amount),
                          style: const TextStyle(
                            color: forestEmerald,
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (payment.isReversed)
                    const Text(
                      'Reversed',
                      style: TextStyle(
                        color: Color(0xFFD92D20),
                        fontWeight: FontWeight.w900,
                      ),
                    )
                  else
                    const Text(
                      'Posted',
                      style: TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _DetailRow(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Payment method',
              value: paymentMethodLabel(payment.method),
            ),
            _DetailRow(
              icon: Icons.calendar_today_outlined,
              label: 'Payment date',
              value:
                  '${salaryDate(payment.paidAt)}, ${salaryTime(payment.paidAt)}',
            ),
            _DetailRow(
              icon: Icons.description_outlined,
              label: 'Reference / Note',
              value: payment.referenceNote ?? '-',
            ),
            _DetailRow(
              icon: Icons.person_outline_rounded,
              label: 'Recorded by',
              value: payment.recordedByName.isEmpty
                  ? 'Recorded user'
                  : payment.recordedByName,
            ),
            const SizedBox(height: 12),
            if (!payment.isReversed)
              OutlinedButton.icon(
                onPressed: onReverse,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reverse this payment'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFD92D20),
                  side: const BorderSide(color: Color(0xFFEAC0C4)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, color: slateText, size: 19),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
