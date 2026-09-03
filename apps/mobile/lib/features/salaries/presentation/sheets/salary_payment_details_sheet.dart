import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';

const _salaryGreenSoft = Color(0xFFF3FAF4);
const _salaryGreenBorder = Color(0xFFDDEFE1);
const _salaryRed = Color(0xFFD92D20);
const _salaryRedSoft = Color(0xFFFFF5F5);
const _salaryRedBorder = Color(0xFFF2C7C7);
const _fieldLine = Color(0xFFE7E9ED);

class SalaryPaymentDetailsSheet extends StatelessWidget {
  const SalaryPaymentDetailsSheet({
    super.key,
    required this.employee,
    required this.payment,
    required this.onReverse,
    this.cycleLabel,
  });

  final SalaryEmployee employee;
  final SalaryPayment payment;
  final VoidCallback onReverse;

  /// Optional so existing callers do not break.
  ///
  /// Pass the current salary cycle label when available.
  final String? cycleLabel;

  void _close(BuildContext context) {
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final screenHeight = MediaQuery.sizeOf(context).height;

    final reference = payment.referenceNote?.trim();

    return Material(
      color: Colors.transparent,
      child: Container(
        constraints: BoxConstraints(maxHeight: screenHeight * 0.94),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(bottom: keyboardInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // =============================================================
                // DRAG HANDLE
                // =============================================================
                const SizedBox(height: 8),

                Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF9098A7),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),

                // =============================================================
                // HEADER
                // =============================================================
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
                  child: SizedBox(
                    height: 48,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const Center(
                          child: Text(
                            'Payment Details',
                            style: TextStyle(
                              color: midnightNavy,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),

                        Align(
                          alignment: Alignment.centerLeft,
                          child: IconButton(
                            tooltip: 'Back',
                            onPressed: () => _close(context),
                            icon: const Icon(
                              Icons.arrow_back_rounded,
                              color: midnightNavy,
                              size: 21,
                            ),
                          ),
                        ),

                        Align(
                          alignment: Alignment.centerRight,
                          child: IconButton(
                            tooltip: 'Close',
                            onPressed: () => _close(context),
                            icon: const Icon(
                              Icons.close_rounded,
                              color: slateText,
                              size: 22,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // =============================================================
                // CONTENT
                // =============================================================
                Flexible(
                  child: SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // =====================================================
                        // EMPLOYEE
                        // =====================================================
                        _EmployeeSummary(
                          employee: employee,
                          cycleLabel: cycleLabel,
                        ),

                        const SizedBox(height: 18),

                        // =====================================================
                        // PAYMENT SUMMARY
                        // =====================================================
                        _PaymentSummaryCard(
                          employee: employee,
                          payment: payment,
                        ),

                        const SizedBox(height: 18),

                        // =====================================================
                        // PAYMENT INFORMATION
                        // =====================================================
                        _DetailsCard(
                          children: [
                            _DetailRow(
                              icon: Icons.account_balance_wallet_outlined,
                              label: 'Payment method',
                              value: paymentMethodLabel(payment.method),
                            ),
                            const _DetailDivider(),
                            _DetailRow(
                              icon: Icons.event_outlined,
                              label: 'Cash day',
                              value: payment.operationDate == null
                                  ? 'Not linked to a day’s cash'
                                  : salaryDate(payment.operationDate),
                            ),
                            const _DetailDivider(),
                            _DetailRow(
                              icon: Icons.schedule_outlined,
                              label: 'Recorded at',
                              value: _paymentDateLabel(payment.paidAt),
                            ),
                            const _DetailDivider(),
                            _DetailRow(
                              icon: Icons.description_outlined,
                              label: 'Reference / Note',
                              value: reference == null || reference.isEmpty
                                  ? '—'
                                  : reference,
                            ),
                            const _DetailDivider(),
                            _DetailRow(
                              icon: Icons.person_outline_rounded,
                              label: 'Recorded by',
                              value: payment.recordedByName.trim().isEmpty
                                  ? 'Recorded user'
                                  : payment.recordedByName,
                            ),
                          ],
                        ),

                        // =====================================================
                        // REVERSAL STATUS / ACTION
                        // =====================================================
                        if (payment.isReversed) ...[
                          const SizedBox(height: 18),

                          const _ReversedNotice(),
                        ] else if (payment.canReverse) ...[
                          const SizedBox(height: 22),

                          const Text(
                            'What would you like to do?',
                            style: TextStyle(
                              color: midnightNavy,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                            ),
                          ),

                          const SizedBox(height: 12),

                          SizedBox(
                            height: 46,
                            child: OutlinedButton.icon(
                              onPressed: onReverse,
                              icon: const Icon(Icons.refresh_rounded, size: 18),
                              label: const Text(
                                'Reverse this payment',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: _salaryRed,
                                backgroundColor: Colors.white,
                                side: const BorderSide(color: _salaryRed),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(7),
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 14),

                          const _CorrectionNotice(),
                        ] else ...[
                          const SizedBox(height: 18),

                          const _ClosedDayNotice(),
                        ],
                      ],
                    ),
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

// =============================================================================
// EMPLOYEE SUMMARY
// =============================================================================

class _EmployeeSummary extends StatelessWidget {
  const _EmployeeSummary({required this.employee, required this.cycleLabel});

  final SalaryEmployee employee;
  final String? cycleLabel;

  @override
  Widget build(BuildContext context) {
    final role = salaryRoleLabel(employee.roleName);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SalaryAvatar(
          name: employee.fullName,
          photoUrl: employee.photoUrl,
          radius: 25,
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                employee.fullName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 14,
                  height: 1.1,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                role,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),

              if (cycleLabel != null && cycleLabel!.trim().isNotEmpty) ...[
                const SizedBox(height: 2),

                Text(
                  'Cycle: ${cycleLabel!.trim()}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// PAYMENT SUMMARY
// =============================================================================

class _PaymentSummaryCard extends StatelessWidget {
  const _PaymentSummaryCard({required this.employee, required this.payment});

  final SalaryEmployee employee;
  final SalaryPayment payment;

  @override
  Widget build(BuildContext context) {
    final reversed = payment.isReversed;

    final accent = reversed ? _salaryRed : forestEmerald;

    final background = reversed ? _salaryRedSoft : _salaryGreenSoft;

    final border = reversed ? _salaryRedBorder : _salaryGreenBorder;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(
              reversed ? Icons.undo_rounded : Icons.check_rounded,
              color: accent,
              size: 18,
            ),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _paymentTitle(payment),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),

                    const SizedBox(width: 8),

                    _PaymentStateChip(reversed: reversed),
                  ],
                ),

                const SizedBox(height: 6),

                Text(
                  salaryMoney(payment.amount),
                  style: TextStyle(
                    color: accent,
                    fontSize: 18,
                    height: 1,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: 7),

                Text(
                  reversed
                      ? 'This payment has been reversed.'
                      : 'Part of ${salaryMoney(employee.salaryDue)} due for this cycle',
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 9.5,
                    height: 1.25,
                    fontWeight: FontWeight.w600,
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

class _PaymentStateChip extends StatelessWidget {
  const _PaymentStateChip({required this.reversed});

  final bool reversed;

  @override
  Widget build(BuildContext context) {
    final color = reversed ? _salaryRed : forestEmerald;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        reversed ? 'Reversed' : 'Posted',
        style: TextStyle(
          color: color,
          fontSize: 8,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

// =============================================================================
// DETAILS CARD
// =============================================================================

class _DetailsCard extends StatelessWidget {
  const _DetailsCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(children: children),
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
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 25, child: Icon(icon, color: slateText, size: 17)),

          const SizedBox(width: 6),

          Expanded(
            flex: 5,
            child: Text(
              label,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            flex: 6,
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 10,
                height: 1.25,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailDivider extends StatelessWidget {
  const _DetailDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(height: 1, color: _fieldLine);
  }
}

// =============================================================================
// CORRECTION NOTICE
// =============================================================================

class _CorrectionNotice extends StatelessWidget {
  const _CorrectionNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        border: Border.all(color: const Color(0xFFFFE1C2)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.history_rounded, color: Color(0xFFD97706), size: 18),

          SizedBox(width: 9),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Correction',
                  style: TextStyle(
                    color: Color(0xFF92400E),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                SizedBox(height: 2),

                Text(
                  'Use “Reverse this payment” to correct a mistake. The amount returns to this day’s branch cash, and only while the day is still open.',
                  style: TextStyle(
                    color: Color(0xFF92400E),
                    fontSize: 8.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
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

// =============================================================================
// REVERSED NOTICE
// =============================================================================

class _ClosedDayNotice extends StatelessWidget {
  const _ClosedDayNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        border: Border.all(color: const Color(0xFFFFE1C2)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_outline_rounded, color: Color(0xFFD97706), size: 18),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'This payment can only be reversed while that branch day is still open. After close it stays in the day’s cash records.',
              style: TextStyle(
                color: Color(0xFF92400E),
                fontSize: 9,
                height: 1.3,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReversedNotice extends StatelessWidget {
  const _ReversedNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: _salaryRedSoft,
        border: Border.all(color: _salaryRedBorder),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline_rounded, color: _salaryRed, size: 18),

          SizedBox(width: 9),

          Expanded(
            child: Text(
              'This payment has already been reversed and cannot be reversed again.',
              style: TextStyle(
                color: _salaryRed,
                fontSize: 9,
                height: 1.3,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

String _paymentTitle(SalaryPayment payment) {
  final reference = payment.referenceNote?.trim();

  if (reference != null && reference.isNotEmpty) {
    return reference;
  }

  return 'Salary payment';
}

String _paymentDateLabel(DateTime? value) {
  if (value == null) {
    return '—';
  }

  return '${salaryDate(value)}, ${salaryTime(value)}';
}
