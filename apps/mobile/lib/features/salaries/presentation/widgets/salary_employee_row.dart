import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';

class SalaryEmployeeRow extends StatelessWidget {
  const SalaryEmployeeRow({
    super.key,
    required this.employee,
    required this.cycle,
    required this.onTap,
  });

  final SalaryEmployee employee;
  final SalaryCycle cycle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final details = _buildDetails(employee, cycle);

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // =========================================================
                    // EMPLOYEE NAME
                    // =========================================================
                    Text(
                      employee.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 13,
                        height: 1.1,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    const SizedBox(height: 6),

                    // =========================================================
                    // EMPLOYEE META
                    // =========================================================
                    Wrap(
                      spacing: 5,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        for (
                          var index = 0;
                          index < details.length;
                          index++
                        ) ...[
                          if (index > 0)
                            const Text(
                              '•',
                              style: TextStyle(
                                color: slateText,
                                fontSize: 7,
                                height: 1,
                                fontWeight: FontWeight.w700,
                              ),
                            ),

                          _EmployeeDetailText(detail: details[index]),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 12),

              // ===============================================================
              // SALARY
              // ===============================================================
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 94, maxWidth: 122),
                child: Text(
                  salaryMoney(employee.salaryDue),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    height: 1,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),

              const SizedBox(width: 5),

              const Icon(
                Icons.chevron_right_rounded,
                color: midnightNavy,
                size: 19,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// DETAIL MODELS
// =============================================================================

enum _DetailTone { neutral, success, warning, danger }

class _EmployeeDetail {
  const _EmployeeDetail({required this.text, this.tone = _DetailTone.neutral});

  final String text;
  final _DetailTone tone;
}

// =============================================================================
// DETAIL TEXT
// =============================================================================

class _EmployeeDetailText extends StatelessWidget {
  const _EmployeeDetailText({required this.detail});

  final _EmployeeDetail detail;

  @override
  Widget build(BuildContext context) {
    return Text(
      detail.text,
      style: TextStyle(
        color: _detailColor(detail.tone),
        fontSize: 8.4,
        height: 1.15,
        fontWeight: detail.tone == _DetailTone.neutral
            ? FontWeight.w500
            : FontWeight.w700,
      ),
    );
  }
}

// =============================================================================
// DETAIL BUILDING
// =============================================================================

List<_EmployeeDetail> _buildDetails(
  SalaryEmployee employee,
  SalaryCycle cycle,
) {
  final details = <_EmployeeDetail>[];

  final role = salaryRoleLabel(employee.roleName);

  if (role.isNotEmpty) {
    details.add(_EmployeeDetail(text: role));
  }

  if (employee.isProrated) {
    details.add(
      const _EmployeeDetail(text: 'Prorated', tone: _DetailTone.warning),
    );
  }

  if (employee.isPaid) {
    details.add(const _EmployeeDetail(text: 'Paid', tone: _DetailTone.success));

    final activePayments =
        employee.payments.where((payment) => !payment.isReversed).toList()
          ..sort((left, right) {
            final rightPaidAt =
                right.paidAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            final leftPaidAt =
                left.paidAt ?? DateTime.fromMillisecondsSinceEpoch(0);

            return rightPaidAt.compareTo(leftPaidAt);
          });

    if (activePayments.isNotEmpty) {
      details.add(
        _EmployeeDetail(
          text: 'Paid on ${salaryDateShort(activePayments.first.paidAt)}',
          tone: _DetailTone.success,
        ),
      );
    }
  } else if (employee.isPartial) {
    details.add(
      const _EmployeeDetail(text: 'Partially paid', tone: _DetailTone.warning),
    );

    if (employee.outstanding > 0) {
      details.add(
        _EmployeeDetail(
          text: 'Balance: ${salaryMoney(employee.outstanding)}',
          tone: _DetailTone.warning,
        ),
      );
    }
  } else {
    details.add(
      const _EmployeeDetail(text: 'Unpaid', tone: _DetailTone.danger),
    );

    details.add(
      _EmployeeDetail(text: _salaryDueLabel(cycle), tone: _DetailTone.danger),
    );
  }

  if (employee.hasShortage) {
    details.add(
      _EmployeeDetail(
        text: 'Shortage: ${salaryMoney(employee.shortageOutstanding)}',
        tone: _DetailTone.warning,
      ),
    );
  }

  return details;
}

// =============================================================================
// COLORS
// =============================================================================

Color _detailColor(_DetailTone tone) {
  return switch (tone) {
    _DetailTone.neutral => slateText,
    _DetailTone.success => forestEmerald,
    _DetailTone.warning => const Color(0xFFE86A13),
    _DetailTone.danger => const Color(0xFFD92D20),
  };
}

String _salaryDueLabel(SalaryCycle cycle) {
  if (cycle.start == null || cycle.end == null) {
    return 'Cycle: 22nd – 21st';
  }

  return 'Cycle: ${salaryDateShort(cycle.start)} – ${salaryDate(cycle.end)}';
}
