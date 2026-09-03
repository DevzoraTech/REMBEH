import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../../../../utils/friendly_errors.dart';
import '../../application/get_salary_employee.dart';
import '../../application/record_salary_payment.dart';
import '../../application/reverse_salary_payment.dart';
import '../../application/save_salary_employee.dart';
import '../../data/repositories/salaries_repository_impl.dart';
import '../../domain/models/salary_models.dart';
import '../sheets/record_employee_sheet.dart';
import '../sheets/record_salary_payment_sheet.dart';
import '../sheets/salary_payment_details_sheet.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';
import '../widgets/salary_status_chip.dart';
import 'salary_history_screen.dart';

const _salaryBlue = Color(0xFF175CD3);
const _salaryOrange = Color(0xFFE86A13);
const _salaryRed = Color(0xFFD92D20);
const _salaryOrangeSoft = Color(0xFFFFF8F2);
const _salaryGreenSoft = Color(0xFFF3FAF4);

class SalaryDetailsScreen extends StatefulWidget {
  const SalaryDetailsScreen({
    super.key,
    required this.session,
    required this.employee,
    this.cycle,
  });

  final RembehSession session;
  final SalaryEmployee employee;
  final SalaryCycle? cycle;

  @override
  State<SalaryDetailsScreen> createState() => _SalaryDetailsScreenState();
}

class _SalaryDetailsScreenState extends State<SalaryDetailsScreen> {
  late final GetSalaryEmployee _getEmployee;
  late final SaveSalaryEmployee _saveEmployee;
  late final RecordSalaryPayment _recordPayment;
  late final ReverseSalaryPayment _reversePayment;

  late SalaryEmployee _employee;
  SalaryCycle? _cycle;
  SalaryOpenCashDay? _openCashDay;

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();

    final repository = SalariesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );

    _getEmployee = GetSalaryEmployee(repository);
    _saveEmployee = SaveSalaryEmployee(repository);
    _recordPayment = RecordSalaryPayment(repository);
    _reversePayment = ReverseSalaryPayment(repository);

    _employee = widget.employee;
    _cycle = widget.cycle;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      unawaited(_load());
    });
  }

  // ===========================================================================
  // DATA
  // ===========================================================================

  String? get _cycleStart {
    final start = _cycle?.start;

    if (start == null) {
      return null;
    }

    return start.toIso8601String().substring(0, 10);
  }

  Future<void> _refreshEmployee() async {
    final result = await _getEmployee(
      session: widget.session,
      employeeId: _employee.id,
      cycleStart: _cycleStart,
    );

    if (!mounted) {
      return;
    }

    setState(() {
      _employee = result.employee;
      _openCashDay = result.openCashDay;
    });
  }

  Future<void> _load() async {
    if (_loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _getEmployee(
        session: widget.session,
        employeeId: _employee.id,
        cycleStart: _cycleStart,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _employee = result.employee;
        _openCashDay = result.openCashDay;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  // ===========================================================================
  // EMPLOYEE
  // ===========================================================================

  Future<void> _editEmployee() async {
    final input = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) {
          return RecordEmployeeSheet(
            agentCandidates: const [],
            initialEmployee: _employee,
            branchId: _employee.branchId,
          );
        },
      ),
    );

    if (input == null || !mounted) {
      return;
    }

    try {
      final updated = await _saveEmployee.update(
        session: widget.session,
        employeeId: _employee.id,
        input: input,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _employee = updated;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Employee details updated.')),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  // ===========================================================================
  // PAYMENTS
  // ===========================================================================

  Future<void> _recordSalaryPayment() async {
    final input = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) {
        return RecordSalaryPaymentSheet(
          employee: _employee,
          cycleLabel: _cycle?.label ?? 'Current cycle',
          openCashDay: _openCashDay,
        );
      },
    );

    if (input == null || !mounted) {
      return;
    }

    try {
      final result = await _recordPayment(
        session: widget.session,
        employeeId: _employee.id,
        input: input,
        cycleStart: _cycleStart,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _employee = result.employee;
      });

      await _refreshEmployee();

      if (!mounted) {
        return;
      }

      await _showPaymentDetails(result.payment);
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _showPaymentDetails(SalaryPayment payment) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) {
        return SalaryPaymentDetailsSheet(
          employee: _employee,
          payment: payment,
          cycleLabel: _cycle?.label,
          onReverse: () {
            unawaited(_reverseSalaryPayment(payment));
          },
        );
      },
    );
  }

  Future<void> _reverseSalaryPayment(SalaryPayment payment) async {
    Navigator.of(context).maybePop();

    try {
      final updated = await _reversePayment(
        session: widget.session,
        paymentId: payment.id,
        reason: 'Correcting salary payment entry',
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _employee = updated;
      });

      await _refreshEmployee();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Payment reversed.')));
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _openHistory() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) {
          return SalaryHistoryScreen(
            session: widget.session,
            employee: _employee,
          );
        },
      ),
    );

    if (!mounted) {
      return;
    }

    unawaited(_load());
  }

  // ===========================================================================
  // MORE MENU
  // ===========================================================================

  void _showMoreMenu() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),

              const SizedBox(height: 12),

              ListTile(
                leading: const Icon(
                  Icons.person_outline_rounded,
                  color: _salaryBlue,
                ),
                title: const Text('Edit employee profile'),
                onTap: () {
                  Navigator.of(sheetContext).pop();

                  unawaited(_editEmployee());
                },
              ),

              ListTile(
                leading: const Icon(Icons.history_rounded, color: _salaryBlue),
                title: const Text('Salary history'),
                onTap: () {
                  Navigator.of(sheetContext).pop();

                  unawaited(_openHistory());
                },
              ),
            ],
          ),
        );
      },
    );
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final postedPayments = _employee.payments
        .where((payment) => !payment.isReversed)
        .toList();
    final reversedPayments = _employee.payments
        .where((payment) => payment.isReversed)
        .toList();

    return Scaffold(
      backgroundColor: Colors.white,

      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 68,

        leading: IconButton(
          onPressed: () {
            Navigator.of(context).maybePop();
          },
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: midnightNavy,
            size: 24,
          ),
        ),

        titleSpacing: 2,

        title: const Text(
          'Salary Details',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),

        actions: [
          IconButton(
            onPressed: _showMoreMenu,
            icon: const Icon(
              Icons.more_horiz_rounded,
              color: midnightNavy,
              size: 25,
            ),
          ),

          const SizedBox(width: 5),
        ],
      ),

      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 30),
          children: [
            if (_error != null) ...[
              _InlineError(message: _error!),

              const SizedBox(height: 12),
            ],

            _EmployeeHeader(
              employee: _employee,
              onProfileTap: () {
                unawaited(_editEmployee());
              },
            ),

            const SizedBox(height: 18),

            _CycleCard(
              employee: _employee,
              cycle: _cycle,
              onRecordPayment: _employee.outstanding > 0
                  ? () {
                      unawaited(_recordSalaryPayment());
                    }
                  : null,
            ),

            const SizedBox(height: 12),

            _DetailsCard(employee: _employee, cycle: _cycle),

            const SizedBox(height: 12),

            _ShortageCard(employee: _employee),

            const SizedBox(height: 18),

            _PaymentHistoryHeader(
              onViewAll: () {
                unawaited(_openHistory());
              },
            ),

            const SizedBox(height: 8),

            if (postedPayments.isEmpty)
              const _EmptyPayments()
            else
              _PaymentList(
                payments: postedPayments,
                onTap: (payment) {
                  unawaited(_showPaymentDetails(payment));
                },
              ),

            if (reversedPayments.isNotEmpty) ...[
              const SizedBox(height: 12),

              const Text(
                'Corrections (reversed payments)',
                style: TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 7),

              _PaymentList(
                payments: reversedPayments,
                onTap: (payment) {
                  unawaited(_showPaymentDetails(payment));
                },
              ),
            ],

            const SizedBox(height: 12),

            if (_cycle != null) _NextCycleCard(cycle: _cycle!),

            if (_loading) ...[
              const SizedBox(height: 18),

              const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: forestEmerald,
                    strokeWidth: 2,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// EMPLOYEE HEADER
// =============================================================================

class _EmployeeHeader extends StatelessWidget {
  const _EmployeeHeader({required this.employee, required this.onProfileTap});

  final SalaryEmployee employee;
  final VoidCallback onProfileTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SalaryAvatar(
          name: employee.fullName,
          photoUrl: employee.photoUrl,
          radius: 31,
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 7,
                runSpacing: 5,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    employee.fullName,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 16,
                      height: 1.1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),

                  _EmployeeStateChip(status: employee.status),
                ],
              ),

              const SizedBox(height: 5),

              Text(
                salaryRoleLabel(employee.roleName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(width: 8),

        OutlinedButton.icon(
          onPressed: onProfileTap,
          style: OutlinedButton.styleFrom(
            foregroundColor: _salaryBlue,
            side: const BorderSide(color: Color(0xFFD6E1F5)),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            minimumSize: const Size(0, 38),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          icon: const Icon(Icons.person_outline_rounded, size: 16),
          label: const Text(
            'Employee profile',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// CURRENT CYCLE
// =============================================================================

class _CycleCard extends StatelessWidget {
  const _CycleCard({
    required this.employee,
    required this.cycle,
    required this.onRecordPayment,
  });

  final SalaryEmployee employee;
  final SalaryCycle? cycle;
  final VoidCallback? onRecordPayment;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Text(
                'Current payroll cycle',
                style: TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),

              SizedBox(width: 6),

              Icon(Icons.calendar_today_outlined, color: slateText, size: 13),
            ],
          ),

          const SizedBox(height: 6),

          Text(
            cycle?.label ?? '—',
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 18,
              height: 1.1,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 18),

          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                _AmountCell(
                  label: 'Monthly salary',
                  value: employee.monthlySalary,
                ),

                const _VerticalDivider(),

                _AmountCell(
                  label: 'Salary due',
                  value: employee.salaryDue,
                  caption:
                      '${employee.eligibleDays} of ${employee.cycleDays} days',
                ),

                const _VerticalDivider(),

                _AmountCell(
                  label: 'Paid',
                  value: employee.paid,
                  color: forestEmerald,
                ),

                const _VerticalDivider(),

                _AmountCell(
                  label: 'Outstanding',
                  value: employee.outstanding,
                  color: _salaryOrange,
                ),
              ],
            ),
          ),

          const SizedBox(height: 9),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: _salaryOrangeSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Status',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 5),

                      SalaryStatusChip(status: employee.paymentStatus),
                    ],
                  ),
                ),

                Container(width: 1, height: 46, color: const Color(0xFFF1DFD0)),

                const SizedBox(width: 18),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Outstanding balance',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 5),

                      Text(
                        salaryMoney(employee.outstanding),
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          SizedBox(
            height: 42,
            child: FilledButton.icon(
              onPressed: onRecordPayment,
              style: FilledButton.styleFrom(
                backgroundColor: _salaryBlue,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(7),
                ),
              ),
              icon: const Icon(Icons.account_balance_wallet_outlined, size: 17),
              label: Text(
                employee.outstanding > 0
                    ? 'Record payment'
                    : 'Salary fully paid',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// CYCLE DETAILS
// =============================================================================

class _DetailsCard extends StatelessWidget {
  const _DetailsCard({required this.employee, required this.cycle});

  final SalaryEmployee employee;
  final SalaryCycle? cycle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 13),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Cycle details',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 8),

          _InfoRow(
            label: 'Salary rate',
            value: '${salaryMoney(employee.monthlySalary)} per month',
          ),

          _InfoRow(
            label: 'Employment start date',
            value: salaryDate(employee.dateJoined),
          ),

          _InfoRow(
            label: 'Cycle type',
            value: employee.isProrated
                ? 'Prorated employee'
                : 'Full cycle employee',
          ),

          const _InfoRow(label: 'Cycle length', value: '22nd → 21st (Monthly)'),

          _InfoRow(
            label: 'Total days in cycle',
            value: '${employee.cycleDays} days',
          ),

          _InfoRow(
            label: 'Eligible days',
            value: '${employee.eligibleDays} days',
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHORTAGES
// =============================================================================

class _ShortageCard extends StatelessWidget {
  const _ShortageCard({required this.employee});

  final SalaryEmployee employee;

  @override
  Widget build(BuildContext context) {
    final hasShortage = employee.shortageOutstanding > 0;

    final color = hasShortage ? _salaryOrange : forestEmerald;

    final background = hasShortage ? _salaryOrangeSoft : _salaryGreenSoft;

    return Container(
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(
                Icons.report_gmailerrorred_outlined,
                color: _salaryOrange,
                size: 18,
              ),

              SizedBox(width: 8),

              Text(
                'Employee shortages',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Container(
                  width: 35,
                  height: 35,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.10),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    hasShortage
                        ? Icons.warning_amber_rounded
                        : Icons.check_rounded,
                    color: color,
                    size: 19,
                  ),
                ),

                const SizedBox(width: 11),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hasShortage
                            ? 'Outstanding shortage'
                            : 'No outstanding shortages',
                        style: TextStyle(
                          color: hasShortage ? midnightNavy : forestEmerald,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),

                      if (hasShortage) ...[
                        const SizedBox(height: 3),

                        const Text(
                          'This amount is tracked separately and is not automatically deducted from salary.',
                          style: TextStyle(
                            color: slateText,
                            fontSize: 7.8,
                            height: 1.3,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                if (hasShortage)
                  Text(
                    salaryMoney(employee.shortageOutstanding),
                    style: const TextStyle(
                      color: _salaryOrange,
                      fontSize: 13,
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

// =============================================================================
// PAYMENT HISTORY
// =============================================================================

class _PaymentHistoryHeader extends StatelessWidget {
  const _PaymentHistoryHeader({required this.onViewAll});

  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(
          child: Text(
            'Payment history (This cycle)',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),

        InkWell(
          onTap: onViewAll,
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Text(
                  'View all payments',
                  style: TextStyle(
                    color: _salaryBlue,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                SizedBox(width: 2),

                Icon(Icons.chevron_right_rounded, color: _salaryBlue, size: 18),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PaymentList extends StatelessWidget {
  const _PaymentList({required this.payments, required this.onTap});

  final List<SalaryPayment> payments;
  final ValueChanged<SalaryPayment> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var index = 0; index < payments.length; index++) ...[
            _PaymentRow(
              index: index,
              payment: payments[index],
              onTap: () {
                onTap(payments[index]);
              },
            ),

            if (index < payments.length - 1)
              const Divider(height: 1, color: line, indent: 56),
          ],
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.index,
    required this.payment,
    required this.onTap,
  });

  final int index;
  final SalaryPayment payment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final reversed = payment.isReversed;

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: reversed ? const Color(0xFFFFF5F5) : _salaryGreenSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  reversed
                      ? Icons.undo_rounded
                      : Icons.account_balance_wallet_outlined,
                  color: reversed ? _salaryRed : forestEmerald,
                  size: 20,
                ),
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reversed ? 'Reversed payment' : 'Payment #${index + 1}',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    const SizedBox(height: 2),

                    Text(
                      reversed
                          ? '${paymentMethodLabel(payment.method)} - not counted'
                          : paymentMethodLabel(payment.method),
                      style: TextStyle(
                        color: reversed ? _salaryRed : slateText,
                        fontSize: 8,
                        fontWeight: FontWeight.w600,
                      ),
                    ),

                    const SizedBox(height: 2),

                    Text(
                      payment.recordedByName.isEmpty
                          ? 'Recorded by branch staff'
                          : 'Recorded by: ${payment.recordedByName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 7.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),

              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    salaryMoney(payment.amount),
                    style: TextStyle(
                      color: payment.isReversed ? _salaryRed : forestEmerald,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),

                  const SizedBox(height: 3),

                  Text(
                    '${salaryDate(payment.paidAt)}, ${salaryTime(payment.paidAt)}',
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 7,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),

              const SizedBox(width: 4),

              const Icon(
                Icons.chevron_right_rounded,
                color: slateText,
                size: 19,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyPayments extends StatelessWidget {
  const _EmptyPayments();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Text(
        'No posted salary payments for this cycle.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: slateText,
          fontSize: 9,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// =============================================================================
// NEXT CYCLE
// =============================================================================

class _NextCycleCard extends StatelessWidget {
  const _NextCycleCard({required this.cycle});

  final SalaryCycle cycle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: _salaryGreenSoft,
        border: Border.all(color: forestEmerald.withValues(alpha: 0.12)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            width: 37,
            height: 37,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(9),
            ),
            child: const Icon(
              Icons.calendar_today_outlined,
              color: forestEmerald,
              size: 20,
            ),
          ),

          const SizedBox(width: 11),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Next payroll cycle',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 8.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 2),

                Text(
                  '${salaryDateShort(cycle.nextStart)} – ${salaryDate(cycle.nextEnd)}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: 2),

                Text(
                  'Paid from the open branch day’s cash, same as expenses.',
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 8,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(7),
            ),
            child: const Text(
              'Upcoming',
              style: TextStyle(
                color: forestEmerald,
                fontSize: 8,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHARED
// =============================================================================

class _AmountCell extends StatelessWidget {
  const _AmountCell({
    required this.label,
    required this.value,
    this.caption,
    this.color = midnightNavy,
  });

  final String label;
  final num value;
  final String? caption;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: slateText,
                fontSize: 8,
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 5),

            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                salaryMoney(value),
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),

            if (caption != null) ...[
              const SizedBox(height: 3),

              Text(
                caption!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 7,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _VerticalDivider extends StatelessWidget {
  const _VerticalDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 48, color: line);
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(width: 10),

                const Expanded(child: Divider(height: 1, color: line)),
              ],
            ),
          ),

          const SizedBox(width: 10),

          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmployeeStateChip extends StatelessWidget {
  const _EmployeeStateChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final active = status.trim().toUpperCase() == 'ACTIVE';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: active
            ? forestEmerald.withValues(alpha: 0.08)
            : _salaryRed.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        active ? 'Active' : _titleCase(status),
        style: TextStyle(
          color: active ? forestEmerald : _salaryRed,
          fontSize: 8,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: _salaryRed.withValues(alpha: 0.07),
        border: Border.all(color: _salaryRed.withValues(alpha: 0.14)),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: _salaryRed,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _titleCase(String value) {
  final cleaned = value.trim().toLowerCase();

  if (cleaned.isEmpty) {
    return 'Unknown';
  }

  return cleaned
      .split('_')
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
