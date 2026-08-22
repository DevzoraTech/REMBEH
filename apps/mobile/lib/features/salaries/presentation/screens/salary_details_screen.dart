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
      if (mounted) unawaited(_load());
    });
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final employee = await _getEmployee(
        session: widget.session,
        employeeId: _employee.id,
        cycleStart: _cycleStart,
      );
      if (mounted) {
        setState(() => _employee = employee);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = friendlyErrorMessage(error));
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  String? get _cycleStart {
    final start = _cycle?.start;
    if (start == null) return null;
    return start.toIso8601String().substring(0, 10);
  }

  Future<void> _editEmployee() async {
    final input = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) {
          return RecordEmployeeSheet(
            agentCandidates: const [],
            initialEmployee: _employee,
          );
        },
      ),
    );
    if (input == null) return;
    try {
      final updated = await _saveEmployee.update(
        session: widget.session,
        employeeId: _employee.id,
        input: input,
      );
      if (!mounted) return;
      setState(() => _employee = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Employee details updated.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _recordSalaryPayment() async {
    final input = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => RecordSalaryPaymentSheet(
        employee: _employee,
        cycleLabel: _cycle?.label ?? 'Current cycle',
      ),
    );
    if (input == null) return;

    try {
      final result = await _recordPayment(
        session: widget.session,
        employeeId: _employee.id,
        input: input,
        cycleStart: _cycleStart,
      );
      if (!mounted) return;
      setState(() => _employee = result.employee);
      await _showPaymentDetails(result.payment);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _showPaymentDetails(SalaryPayment payment) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SalaryPaymentDetailsSheet(
        employee: _employee,
        payment: payment,
        onReverse: () => unawaited(_reverseSalaryPayment(payment)),
      ),
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
      if (!mounted) return;
      setState(() => _employee = updated);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Payment reversed.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _openHistory() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            SalaryHistoryScreen(session: widget.session, employee: _employee),
      ),
    );
    if (mounted) unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final cycle = _cycle;
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: midnightNavy),
        ),
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
            tooltip: 'Edit employee',
            onPressed: _editEmployee,
            icon: const Icon(Icons.person_outline_rounded, color: midnightNavy),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_horiz_rounded, color: midnightNavy),
            onSelected: (value) {
              if (value == 'edit') unawaited(_editEmployee());
              if (value == 'history') unawaited(_openHistory());
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'edit', child: Text('Edit employee')),
              PopupMenuItem(value: 'history', child: Text('Salary history')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
          children: [
            if (_error != null) ...[
              _InlineError(message: _error!),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                SalaryAvatar(
                  name: _employee.fullName,
                  photoUrl: _employee.photoUrl,
                  radius: 34,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _employee.fullName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: midnightNavy,
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          _EmployeeStateChip(status: _employee.status),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _employee.roleName ?? 'Employee',
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _CycleCard(
              employee: _employee,
              cycle: cycle,
              onRecordPayment: _employee.outstanding > 0
                  ? () => unawaited(_recordSalaryPayment())
                  : null,
            ),
            const SizedBox(height: 12),
            _DetailsCard(employee: _employee, cycle: cycle),
            const SizedBox(height: 14),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Payment history (This cycle)',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => unawaited(_openHistory()),
                  child: const Text('View all payments'),
                ),
              ],
            ),
            if (_employee.payments.isEmpty)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Text(
                  'No salary payments recorded for this cycle.',
                  style: TextStyle(
                    color: slateText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Column(
                  children: [
                    for (
                      var index = 0;
                      index < _employee.payments.length;
                      index += 1
                    ) ...[
                      _PaymentRow(
                        payment: _employee.payments[index],
                        onTap: () => unawaited(
                          _showPaymentDetails(_employee.payments[index]),
                        ),
                      ),
                      if (index < _employee.payments.length - 1)
                        const Divider(height: 1, color: line),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: 14),
            if (cycle != null)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: forestEmerald.withValues(alpha: 0.06),
                  border: Border.all(
                    color: forestEmerald.withValues(alpha: 0.12),
                  ),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.calendar_today_outlined,
                      color: forestEmerald,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Next payroll cycle',
                            style: TextStyle(
                              color: slateText,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            '${salaryDate(cycle.nextStart)} - ${salaryDate(cycle.nextEnd)}',
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            'Payment window: ${salaryDateShort(cycle.paymentWindowStart)} - ${salaryDateShort(cycle.paymentWindowEnd)}',
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Text(
                      'Upcoming',
                      style: TextStyle(
                        color: forestEmerald,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            if (_loading) ...[
              const SizedBox(height: 20),
              const Center(
                child: CircularProgressIndicator(color: forestEmerald),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Current payroll cycle',
            style: TextStyle(
              color: slateText,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            cycle?.label ?? '-',
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 13),
            decoration: BoxDecoration(
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Row(
              children: [
                _AmountCell(
                  label: 'Monthly salary',
                  value: employee.monthlySalary,
                ),
                _Line(),
                _AmountCell(
                  label: 'Salary due',
                  value: employee.salaryDue,
                  caption:
                      '${employee.eligibleDays} of ${employee.cycleDays} days',
                ),
                _Line(),
                _AmountCell(
                  label: 'Paid',
                  value: employee.paid,
                  color: forestEmerald,
                ),
                _Line(),
                _AmountCell(
                  label: 'Outstanding',
                  value: employee.outstanding,
                  color: const Color(0xFFC05A00),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF8F0),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
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
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      SalaryStatusChip(status: employee.paymentStatus),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Outstanding balance',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        salaryMoney(employee.outstanding),
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 18,
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
          FilledButton.icon(
            onPressed: onRecordPayment,
            icon: const Icon(Icons.account_balance_wallet_outlined),
            label: const Text('Record payment'),
          ),
        ],
      ),
    );
  }
}

class _DetailsCard extends StatelessWidget {
  const _DetailsCard({required this.employee, required this.cycle});

  final SalaryEmployee employee;
  final SalaryCycle? cycle;

  @override
  Widget build(BuildContext context) {
    final activeCycle = cycle;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Cycle details',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
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
          _InfoRow(
            label: 'Cycle length',
            value: activeCycle == null
                ? '-'
                : '${salaryDateShort(activeCycle.start)} - ${salaryDateShort(activeCycle.end)}',
          ),
          _InfoRow(
            label: 'Total days in cycle',
            value: '${employee.cycleDays} days',
          ),
          _InfoRow(
            label: 'Eligible days',
            value: '${employee.eligibleDays} days',
          ),
          _InfoRow(
            label: 'Payment method',
            value: paymentMethodLabel(employee.paymentMethod),
          ),
          _InfoRow(
            label: 'Payment details',
            value: [
              employee.paymentProvider,
              employee.paymentAccountName,
              employee.paymentAccountNumber,
            ].where((item) => (item ?? '').isNotEmpty).join(' - ').ifEmpty('-'),
          ),
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment, required this.onTap});

  final SalaryPayment payment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: forestEmerald.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.account_balance_wallet_outlined,
                  color: forestEmerald,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      payment.referenceNote?.isNotEmpty == true
                          ? payment.referenceNote!
                          : 'Payment',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      '${paymentMethodLabel(payment.method)} - Recorded by: ${payment.recordedByName}',
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
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    salaryMoney(payment.amount),
                    style: TextStyle(
                      color: payment.isReversed
                          ? const Color(0xFFD92D20)
                          : forestEmerald,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    '${salaryDate(payment.paidAt)}, ${salaryTime(payment.paidAt)}',
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right_rounded, color: slateText),
            ],
          ),
        ),
      ),
    );
  }
}

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
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              salaryMoney(value),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (caption != null)
              Text(
                caption!,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
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
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 12,
                fontWeight: FontWeight.w800,
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
    final active = status.toUpperCase() == 'ACTIVE';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: active
            ? forestEmerald.withValues(alpha: 0.08)
            : const Color(0xFFD92D20).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        active ? 'Active' : status.toLowerCase(),
        style: TextStyle(
          color: active ? forestEmerald : const Color(0xFFD92D20),
          fontSize: 11,
          fontWeight: FontWeight.w900,
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFD92D20).withValues(alpha: 0.08),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: Color(0xFFD92D20),
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

extension _BlankString on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
