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

const _historyBlue = Color(0xFF175CD3);
const _historyBlueSoft = Color(0xFFF3F6FF);
const _historyBlueBorder = Color(0xFFDDE6FF);

const _historyOrange = Color(0xFFE86A13);
const _historyRed = Color(0xFFD92D20);

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

  String _filter = 'ALL';

  @override
  void initState() {
    super.initState();

    final repository = SalariesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );

    _loadSalaryHistory = LoadSalaryHistory(repository);

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

  Future<void> _load() async {
    if (_loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final history = await _loadSalaryHistory(
        session: widget.session,
        employeeId: widget.employee.id,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _history = history;
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

  SalaryEmployee get _employee {
    return _history?.employee ?? widget.employee;
  }

  List<SalaryHistoryCycle> get _visibleCycles {
    final source = _history?.cycles ?? const <SalaryHistoryCycle>[];

    switch (_filter) {
      case 'PAID':
        return source
            .where(
              (cycle) => cycle.paymentStatus.trim().toUpperCase() == 'PAID',
            )
            .toList();

      case 'PARTIAL':
        return source
            .where(
              (cycle) => cycle.paymentStatus.trim().toUpperCase() == 'PARTIAL',
            )
            .toList();

      case 'UNPAID':
        return source
            .where(
              (cycle) => cycle.paymentStatus.trim().toUpperCase() == 'UNPAID',
            )
            .toList();

      default:
        return source;
    }
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  void _close() {
    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
    }
  }

  void _openEmployeeProfile() {
    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
    }
  }

  void _showFilterSheet() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Container(
          margin: const EdgeInsets.all(10),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),

              const SizedBox(height: 16),

              const Text(
                'Filter payroll cycles',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 8),

              _FilterSheetRow(
                label: 'All cycles',
                selected: _filter == 'ALL',
                onTap: () {
                  setState(() {
                    _filter = 'ALL';
                  });

                  Navigator.of(sheetContext).pop();
                },
              ),

              _FilterSheetRow(
                label: 'Paid',
                selected: _filter == 'PAID',
                onTap: () {
                  setState(() {
                    _filter = 'PAID';
                  });

                  Navigator.of(sheetContext).pop();
                },
              ),

              _FilterSheetRow(
                label: 'Partially paid',
                selected: _filter == 'PARTIAL',
                onTap: () {
                  setState(() {
                    _filter = 'PARTIAL';
                  });

                  Navigator.of(sheetContext).pop();
                },
              ),

              _FilterSheetRow(
                label: 'Unpaid',
                selected: _filter == 'UNPAID',
                onTap: () {
                  setState(() {
                    _filter = 'UNPAID';
                  });

                  Navigator.of(sheetContext).pop();
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
    final history = _history;
    final cycles = _visibleCycles;
    final sections = _cycleSections(cycles);

    return Scaffold(
      backgroundColor: const Color(0xFFFDFDFD),

      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 70,
        leadingWidth: 56,

        leading: IconButton(
          onPressed: _close,
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: midnightNavy,
            size: 24,
          ),
        ),

        titleSpacing: 0,

        title: const Text(
          'Salary History',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 20,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.3,
          ),
        ),

        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: line),
        ),
      ),

      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          children: [
            // ================================================================
            // EMPLOYEE
            // ================================================================
            _EmployeeHeader(
              employee: _employee,
              onProfileTap: _openEmployeeProfile,
            ),

            const SizedBox(height: 14),

            // ================================================================
            // INFORMATION
            // ================================================================
            const _InformationBanner(),

            if (_error != null) ...[
              const SizedBox(height: 10),

              _ErrorBox(message: _error!),
            ],

            const SizedBox(height: 12),

            // ================================================================
            // SUMMARY
            // ================================================================
            _HistorySummary(history: history),

            const SizedBox(height: 18),

            // ================================================================
            // SECTION HEADER
            // ================================================================
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Completed payroll cycles',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),

                SizedBox(
                  width: 82,
                  height: 36,
                  child: OutlinedButton.icon(
                    onPressed: _showFilterSheet,
                    icon: const Icon(Icons.filter_alt_outlined, size: 16),
                    label: const Text(
                      'Filter',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _historyBlue,
                      backgroundColor: Colors.white,
                      minimumSize: Size.zero,
                      maximumSize: const Size(82, 36),
                      fixedSize: const Size(82, 36),
                      side: const BorderSide(color: Color(0xFFD6E1F5)),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // ================================================================
            // CYCLES
            // ================================================================
            if (_loading && history == null)
              const Padding(
                padding: EdgeInsets.only(top: 60),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if (cycles.isEmpty)
              const _EmptyCycles()
            else
              _GroupedCyclesList(sections: sections),

            if (cycles.isNotEmpty) ...[
              const SizedBox(height: 10),

              Text(
                'Showing ${cycles.length} of ${history?.cycles.length ?? cycles.length} meaningful cycles',
                style: const TextStyle(
                  color: slateText,
                  fontSize: 8,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],

            const SizedBox(height: 28),

            // ================================================================
            // OLDER RECORDS
            // ================================================================
            const _OlderRecordsCard(),

            if (_loading && history != null) ...[
              const SizedBox(height: 18),

              const Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
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
    final phone = _safeText(employee.phone);
    final email = _safeText(employee.email);
    final nin = _safeText(employee.ninNumber);

    final role = salaryRoleLabel(employee.roleName);

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;

        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
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
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        employee.fullName,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 17,
                          height: 1.1,
                          fontWeight: FontWeight.w900,
                        ),
                      ),

                      _EmployeeStateChip(status: employee.status),
                    ],
                  ),

                  const SizedBox(height: 4),

                  Text(
                    role,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),

                  const SizedBox(height: 5),

                  Wrap(
                    spacing: 9,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (phone != null)
                        _IdentityDetail(
                          icon: Icons.phone_outlined,
                          text: phone,
                        ),

                      if (email != null)
                        _IdentityDetail(
                          icon: Icons.mail_outline_rounded,
                          text: email,
                        ),

                      if (nin != null)
                        _IdentityDetail(
                          icon: Icons.badge_outlined,
                          text: 'NIN $nin',
                        ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(width: 8),

            if (compact)
              SizedBox(
                width: 38,
                height: 36,
                child: OutlinedButton(
                  onPressed: onProfileTap,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _historyBlue,
                    backgroundColor: Colors.white,
                    padding: EdgeInsets.zero,

                    // Critical:
                    minimumSize: Size.zero,
                    maximumSize: const Size(38, 36),
                    fixedSize: const Size(38, 36),

                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    side: const BorderSide(color: Color(0xFFD6E1F5)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Icon(Icons.person_outline_rounded, size: 17),
                ),
              )
            else
              SizedBox(
                width: 132,
                height: 36,
                child: OutlinedButton.icon(
                  onPressed: onProfileTap,
                  icon: const Icon(Icons.person_outline_rounded, size: 16),
                  label: const Text(
                    'Employee profile',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _historyBlue,
                    backgroundColor: Colors.white,

                    // Critical:
                    minimumSize: Size.zero,
                    maximumSize: const Size(132, 36),
                    fixedSize: const Size(132, 36),

                    padding: const EdgeInsets.symmetric(horizontal: 9),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    side: const BorderSide(color: Color(0xFFD6E1F5)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _IdentityDetail extends StatelessWidget {
  const _IdentityDetail({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: slateText),

        const SizedBox(width: 4),

        Text(
          text,
          style: const TextStyle(
            color: slateText,
            fontSize: 8.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// INFORMATION
// =============================================================================

class _InformationBanner extends StatelessWidget {
  const _InformationBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: _historyBlueSoft,
        border: Border.all(color: _historyBlueBorder),
        borderRadius: BorderRadius.circular(9),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline_rounded, color: _historyBlue, size: 16),

          SizedBox(width: 8),

          Expanded(
            child: Text(
              'Only completed cycles with salary due or payment activity are shown.',
              style: TextStyle(
                color: Color(0xFF15438C),
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

// =============================================================================
// SUMMARY
// =============================================================================

class _HistorySummary extends StatelessWidget {
  const _HistorySummary({required this.history});

  final SalaryHistory? history;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Summary (All completed cycles)',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 14),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _SummaryMetric(
                  label: 'Total cycles',
                  value: '${history?.totalCycles ?? 0}',
                  icon: Icons.calendar_today_outlined,
                  color: _historyBlue,
                ),
              ),

              const _SummaryDivider(),

              Expanded(
                child: _SummaryMetric(
                  label: 'Total paid',
                  value: salaryMoney(history?.totalPaid ?? 0),
                  icon: Icons.payments_outlined,
                  color: forestEmerald,
                ),
              ),

              const _SummaryDivider(),

              Expanded(
                child: _SummaryMetric(
                  label: 'Total due',
                  value: salaryMoney(history?.totalDue ?? 0),
                  icon: Icons.receipt_long_outlined,
                  color: midnightNavy,
                ),
              ),
            ],
          ),
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
    return Padding(
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

          const SizedBox(height: 7),

          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          const SizedBox(height: 9),

          Container(
            width: 33,
            height: 33,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, color: color, size: 17),
          ),
        ],
      ),
    );
  }
}

class _SummaryDivider extends StatelessWidget {
  const _SummaryDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 70, color: line);
  }
}

// =============================================================================
// CYCLES
// =============================================================================

class _HistoryCycleSection {
  const _HistoryCycleSection({
    required this.title,
    required this.subtitle,
    required this.cycles,
  });

  final String title;
  final String subtitle;
  final List<SalaryHistoryCycle> cycles;
}

class _GroupedCyclesList extends StatelessWidget {
  const _GroupedCyclesList({required this.sections});

  final List<_HistoryCycleSection> sections;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var index = 0; index < sections.length; index++) ...[
          _HistorySectionCard(section: sections[index]),
          if (index < sections.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _HistorySectionCard extends StatelessWidget {
  const _HistorySectionCard({required this.section});

  final _HistoryCycleSection section;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(11),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 11, 12, 9),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        section.title,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        section.subtitle,
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _historyBlueSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${section.cycles.length}',
                    style: const TextStyle(
                      color: _historyBlue,
                      fontSize: 8,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: line),
          _CyclesCard(cycles: section.cycles),
        ],
      ),
    );
  }
}

class _CyclesCard extends StatelessWidget {
  const _CyclesCard({required this.cycles});

  final List<SalaryHistoryCycle> cycles;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var index = 0; index < cycles.length; index++) ...[
          _HistoryCycleRow(cycle: cycles[index]),

          if (index < cycles.length - 1) const Divider(height: 1, color: line),
        ],
      ],
    );
  }
}

class _HistoryCycleRow extends StatelessWidget {
  const _HistoryCycleRow({required this.cycle});

  final SalaryHistoryCycle cycle;

  @override
  Widget build(BuildContext context) {
    final latestPayment = _latestActivePayment(cycle.payments);

    final paidDate = _paymentDateLabel(latestPayment);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // ===============================================================
          // CYCLE
          // ===============================================================
          Expanded(
            flex: 19,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cycle.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: 5),

                Text(
                  _cycleSubtitle(cycle),
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 7.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 6),

          // ===============================================================
          // DUE
          // ===============================================================
          Expanded(
            flex: 14,
            child: _HistoryValue(
              label: 'Due',
              value: salaryMoney(cycle.salaryDue),
            ),
          ),

          const SizedBox(width: 6),

          // ===============================================================
          // PAID
          // ===============================================================
          Expanded(
            flex: 17,
            child: _HistoryValue(
              label: 'Paid',
              value: salaryMoney(cycle.paid),
              color: _paidAmountColor(cycle.paymentStatus),
              caption: paidDate,
            ),
          ),

          const SizedBox(width: 6),

          // ===============================================================
          // STATUS
          // ===============================================================
          Expanded(
            flex: 15,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Status',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 7,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 5),

                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: SalaryStatusChip(status: cycle.paymentStatus),
                ),
              ],
            ),
          ),

          const SizedBox(width: 2),

          const Icon(Icons.chevron_right_rounded, color: slateText, size: 18),
        ],
      ),
    );
  }
}

class _HistoryValue extends StatelessWidget {
  const _HistoryValue({
    required this.label,
    required this.value,
    this.color = midnightNavy,
    this.caption,
  });

  final String label;
  final String value;
  final Color color;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    final safeCaption = _safeText(caption);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 7,
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 5),

        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),

        if (safeCaption != null) ...[
          const SizedBox(height: 3),

          Text(
            safeCaption,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: slateText,
              fontSize: 6.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ],
    );
  }
}

// =============================================================================
// OLDER RECORDS
// =============================================================================

class _OlderRecordsCard extends StatelessWidget {
  const _OlderRecordsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 12, 12, 12),
      decoration: BoxDecoration(
        color: _historyBlueSoft,
        border: Border.all(color: _historyBlueBorder),
        borderRadius: BorderRadius.circular(10),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 350;

          return Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFE5EDFF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.folder_outlined,
                  color: _historyBlue,
                  size: 19,
                ),
              ),

              const SizedBox(width: 11),

              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Need older records?',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    SizedBox(height: 2),

                    Text(
                      'Contact your administrator to export salary records older than 12 months.',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 7.5,
                        height: 1.35,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),

              if (compact)
                Container(
                  width: 36,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFD6E1F5)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.download_outlined,
                    size: 16,
                    color: _historyBlue,
                  ),
                )
              else
                Container(
                  height: 35,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFD6E1F5)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Request export',
                    style: TextStyle(
                      color: _historyBlue,
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// =============================================================================
// FILTER SHEET
// =============================================================================

class _FilterSheetRow extends StatelessWidget {
  const _FilterSheetRow({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        label,
        style: const TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w700,
        ),
      ),
      trailing: selected
          ? const Icon(Icons.check_circle_rounded, color: forestEmerald)
          : null,
      onTap: onTap,
    );
  }
}

// =============================================================================
// STATES
// =============================================================================

class _EmptyCycles extends StatelessWidget {
  const _EmptyCycles();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(11),
      ),
      child: const Column(
        children: [
          Icon(Icons.calendar_month_outlined, color: slateText, size: 26),

          SizedBox(height: 8),

          Text(
            'No meaningful salary history yet.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: slateText,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
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
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: _historyRed.withValues(alpha: 0.07),
        border: Border.all(color: _historyRed.withValues(alpha: 0.16)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: _historyRed,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _EmployeeStateChip extends StatelessWidget {
  const _EmployeeStateChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.trim().toUpperCase();

    final active = normalized == 'ACTIVE';

    final color = active ? forestEmerald : _historyRed;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        active ? 'Active' : _humanStatus(status),
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
// HELPERS
// =============================================================================

List<_HistoryCycleSection> _cycleSections(List<SalaryHistoryCycle> cycles) {
  List<SalaryHistoryCycle> byStatus(String status) {
    return cycles
        .where((cycle) => cycle.paymentStatus.trim().toUpperCase() == status)
        .toList();
  }

  final unpaid = byStatus('UNPAID');
  final partial = byStatus('PARTIAL');
  final paid = byStatus('PAID');

  return [
    if (unpaid.isNotEmpty)
      _HistoryCycleSection(
        title: 'Needs payment',
        subtitle: 'Completed cycles with salary still unpaid.',
        cycles: unpaid,
      ),
    if (partial.isNotEmpty)
      _HistoryCycleSection(
        title: 'Partially paid',
        subtitle: 'Cycles with some salary posted and a balance remaining.',
        cycles: partial,
      ),
    if (paid.isNotEmpty)
      _HistoryCycleSection(
        title: 'Paid',
        subtitle: 'Completed cycles fully covered by posted payments.',
        cycles: paid,
      ),
  ];
}

SalaryPayment? _latestActivePayment(List<SalaryPayment> payments) {
  final active = payments.where((payment) => !payment.isReversed).toList();

  if (active.isEmpty) {
    return null;
  }

  active.sort((left, right) {
    final leftDate = left.paidAt;

    final rightDate = right.paidAt;

    if (leftDate == null && rightDate == null) {
      return 0;
    }

    if (leftDate == null) {
      return 1;
    }

    if (rightDate == null) {
      return -1;
    }

    return rightDate.compareTo(leftDate);
  });

  return active.first;
}

String? _paymentDateLabel(SalaryPayment? payment) {
  final paidAt = payment?.paidAt;

  if (paidAt == null) {
    return null;
  }

  return 'Paid on ${salaryDateShort(paidAt)}';
}

String _cycleSubtitle(SalaryHistoryCycle cycle) {
  final days = _cycleDays(cycle);

  final activePayments = cycle.payments.where((payment) => !payment.isReversed);
  final reversedPayments = cycle.payments.where(
    (payment) => payment.isReversed,
  );

  final paymentCount = activePayments.length;
  final reversedCount = reversedPayments.length;

  final daysLabel = days > 0 ? '$days days' : 'Completed cycle';
  final parts = <String>[daysLabel];

  if (paymentCount == 0) {
    parts.add('No posted payments');
  } else if (paymentCount == 1) {
    parts.add('1 posted payment');
  } else {
    parts.add('$paymentCount posted payments');
  }

  if (reversedCount == 1) {
    parts.add('1 reversed');
  } else if (reversedCount > 1) {
    parts.add('$reversedCount reversed');
  }

  return parts.join(' • ');
}

int _cycleDays(SalaryHistoryCycle cycle) {
  final start = cycle.start;

  final end = cycle.end;

  if (start == null || end == null) {
    return 0;
  }

  final startDate = DateTime(start.year, start.month, start.day);

  final endDate = DateTime(end.year, end.month, end.day);

  final difference = endDate.difference(startDate).inDays;

  if (difference < 0) {
    return 0;
  }

  return difference + 1;
}

Color _paidAmountColor(String paymentStatus) {
  return switch (paymentStatus.trim().toUpperCase()) {
    'PAID' => forestEmerald,
    'PARTIAL' => _historyOrange,
    _ => midnightNavy,
  };
}

String? _safeText(String? value) {
  final clean = value?.trim();

  if (clean == null || clean.isEmpty) {
    return null;
  }

  return clean;
}

String _humanStatus(String value) {
  final clean = value.trim().toLowerCase();

  if (clean.isEmpty) {
    return 'Unknown';
  }

  return clean
      .split('_')
      .where((word) => word.isNotEmpty)
      .map((word) {
        if (word.length == 1) {
          return word.toUpperCase();
        }

        return '${word[0].toUpperCase()}'
            '${word.substring(1)}';
      })
      .join(' ');
}
