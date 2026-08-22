import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../../../../utils/friendly_errors.dart';
import '../../application/load_salary_history.dart';
import '../../data/repositories/salaries_repository_impl.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';
import '../widgets/salary_status_chip.dart';

class SalaryHistoryScreen extends StatefulWidget {
  const SalaryHistoryScreen({
    super.key,
    required this.session,
    required this.employee,
  });

  final RembehSession session;
  final SalaryEmployee employee;

  @override
  State<SalaryHistoryScreen> createState() => _SalaryHistoryScreenState();
}

class _SalaryHistoryScreenState extends State<SalaryHistoryScreen> {
  late final LoadSalaryHistory _loadSalaryHistory;
  SalaryHistory? _history;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final repository = SalariesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );
    _loadSalaryHistory = LoadSalaryHistory(repository);
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
      final history = await _loadSalaryHistory(
        session: widget.session,
        employeeId: widget.employee.id,
      );
      if (mounted) setState(() => _history = history);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  SalaryEmployee get _employee => _history?.employee ?? widget.employee;

  @override
  Widget build(BuildContext context) {
    final history = _history;
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
          'Salary History',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
          children: [
            LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 390;

                return Row(
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
                              const SizedBox(width: 8),
                              const _ActiveChip(),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_employee.roleName ?? 'Employee'} - '
                            '${_employee.phone ?? '-'} - '
                            'NIN: ${_employee.ninNumber ?? '-'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (compact)
                      SizedBox(
                        width: 40,
                        height: 38,
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(context).maybePop(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF1359C8),
                            side: const BorderSide(color: Color(0xFFD6E1F5)),
                            padding: EdgeInsets.zero,
                          ),
                          child: const Icon(
                            Icons.person_outline_rounded,
                            size: 18,
                          ),
                        ),
                      )
                    else
                      OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: const Icon(
                          Icons.person_outline_rounded,
                          size: 18,
                        ),
                        label: const Text('Employee profile'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF1359C8),
                          side: const BorderSide(color: Color(0xFFD6E1F5)),
                          minimumSize: const Size(0, 38),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                        ),
                      ),
                  ],
                );
              },
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF3F6FF),
                border: Border.all(color: const Color(0xFFDDE6FF)),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: Color(0xFF1359C8)),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Below is the salary history for all completed payroll cycles.',
                      style: TextStyle(
                        color: Color(0xFF15438C),
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_error != null) ...[
              _ErrorBox(message: _error!),
              const SizedBox(height: 12),
            ],
            _HistorySummary(history: history),
            const SizedBox(height: 18),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Completed payroll cycles',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.filter_alt_outlined, size: 18),
                  label: const Text('Filter'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 38),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (_loading && history == null)
              const Padding(
                padding: EdgeInsets.only(top: 70),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if ((history?.cycles ?? const []).isEmpty)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Text(
                  'No completed payroll cycles yet.',
                  style: TextStyle(
                    color: slateText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else
              Column(
                children: [
                  for (final cycle in history!.cycles) ...[
                    _HistoryCycleCard(cycle: cycle),
                    const SizedBox(height: 8),
                  ],
                  Text(
                    'Showing 1 - ${history.cycles.length} of ${history.cycles.length} cycles',
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 28),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF3F6FF),
                border: Border.all(color: const Color(0xFFDDE6FF)),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final compact = constraints.maxWidth < 340;

                  return Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE5EDFF),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.folder_outlined,
                          color: Color(0xFF1359C8),
                        ),
                      ),

                      const SizedBox(width: 12),

                      const Expanded(
                        child: Text(
                          'Need older records?\nContact your administrator to export salary records older than 12 months.',
                          style: TextStyle(
                            color: slateText,
                            height: 1.35,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),

                      const SizedBox(width: 8),

                      if (compact)
                        SizedBox(
                          width: 40,
                          height: 38,
                          child: OutlinedButton(
                            onPressed: () {},
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF1359C8),
                              side: const BorderSide(color: Color(0xFFD6E1F5)),
                              padding: EdgeInsets.zero,
                            ),
                            child: const Icon(
                              Icons.download_outlined,
                              size: 18,
                            ),
                          ),
                        )
                      else
                        OutlinedButton(
                          onPressed: () {},
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF1359C8),
                            side: const BorderSide(color: Color(0xFFD6E1F5)),
                            minimumSize: const Size(0, 38),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                          ),
                          child: const Text('Request export'),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistorySummary extends StatelessWidget {
  const _HistorySummary({required this.history});

  final SalaryHistory? history;

  @override
  Widget build(BuildContext context) {
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
            'Summary (All completed cycles)',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _SummaryMetric(
                label: 'Total cycles',
                value: '${history?.totalCycles ?? 0}',
                icon: Icons.calendar_today_outlined,
                color: const Color(0xFF1359C8),
              ),
              _SummaryDivider(),
              _SummaryMetric(
                label: 'Total paid',
                value: salaryMoney(history?.totalPaid ?? 0),
                icon: Icons.payments_outlined,
                color: forestEmerald,
              ),
              _SummaryDivider(),
              _SummaryMetric(
                label: 'Total due',
                value: salaryMoney(history?.totalDue ?? 0),
                icon: Icons.receipt_long_outlined,
                color: midnightNavy,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HistoryCycleCard extends StatelessWidget {
  const _HistoryCycleCard({required this.cycle});

  final SalaryHistoryCycle cycle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cycle.label,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${cycle.payments.length} payment${cycle.payments.length == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _TinyValue(
              label: 'Due',
              value: salaryMoney(cycle.salaryDue),
            ),
          ),
          Expanded(
            child: _TinyValue(
              label: 'Paid',
              value: salaryMoney(cycle.paid),
              color: cycle.paymentStatus == 'PAID'
                  ? forestEmerald
                  : const Color(0xFFC05A00),
            ),
          ),
          SalaryStatusChip(status: cycle.paymentStatus),
          const SizedBox(width: 6),
          const Icon(Icons.chevron_right_rounded, color: slateText),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
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
          const SizedBox(height: 7),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
        ],
      ),
    );
  }
}

class _SummaryDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 70, color: line);
  }
}

class _TinyValue extends StatelessWidget {
  const _TinyValue({
    required this.label,
    required this.value,
    this.color = midnightNavy,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _ActiveChip extends StatelessWidget {
  const _ActiveChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: forestEmerald.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        'Active',
        style: TextStyle(
          color: forestEmerald,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});

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
