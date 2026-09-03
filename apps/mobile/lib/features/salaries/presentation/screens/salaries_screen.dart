import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../application/list_salary_agent_candidates.dart';
import '../../application/load_salaries_dashboard.dart';
import '../../application/record_salary_payment.dart';
import '../../application/save_salary_employee.dart';
import '../../data/repositories/salaries_repository_impl.dart';
import '../../domain/models/salary_models.dart';
import '../../../shortages/presentation/screens/shortages_screen.dart';
import '../controllers/salaries_controller.dart';
import '../sheets/record_employee_sheet.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_employee_row.dart';
import 'salary_details_screen.dart';

const _salaryBlue = Color(0xFF175CD3);
const _salaryRed = Color(0xFFD92D20);
const _salaryOrange = Color(0xFFE86A13);
const _salaryGreenSoft = Color(0xFFF3FAF4);
const _salaryOrangeSoft = Color(0xFFFFF7ED);

class SalariesScreen extends StatefulWidget {
  const SalariesScreen({super.key, required this.session, this.branchId});

  final RembehSession session;
  final String? branchId;

  @override
  State<SalariesScreen> createState() => _SalariesScreenState();
}

class _SalariesScreenState extends State<SalariesScreen> {
  late final SalariesController _controller;
  late final TextEditingController _searchController;

  @override
  void initState() {
    super.initState();

    final repository = SalariesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );

    _controller = SalariesController(
      loadDashboard: LoadSalariesDashboard(repository),
      listAgentCandidates: ListSalaryAgentCandidates(repository),
      saveEmployee: SaveSalaryEmployee(repository),
      recordSalaryPayment: RecordSalaryPayment(repository),
    );

    _searchController = TextEditingController();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      unawaited(_load());
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _controller.dispose();

    super.dispose();
  }

  // ===========================================================================
  // DATA
  // ===========================================================================

  Future<void> _load({bool quiet = false}) {
    return _controller.load(
      session: widget.session,
      branchId: widget.branchId,
      quiet: quiet,
    );
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  Future<void> _addEmployee() async {
    await _controller.loadAgentCandidates(
      session: widget.session,
      branchId: widget.branchId,
    );

    if (!mounted) {
      return;
    }

    /*
     * RecordEmployeeSheet is a full screen-style form.
     *
     * Push it as a route instead of embedding a Scaffold inside a
     * modal bottom sheet. This is also materially safer for Flutter's
     * semantics tree.
     */
    final input = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) {
          return RecordEmployeeSheet(
            agentCandidates: _controller.agentCandidates,
            branchId: widget.branchId ?? widget.session.branchId,
          );
        },
      ),
    );

    if (!mounted || input == null) {
      return;
    }

    final saved = await _controller.createEmployee(
      session: widget.session,
      input: input,
    );

    if (!mounted) {
      return;
    }

    if (saved) {
      await _load(quiet: true);
    }
  }

  Future<void> _openDetails(SalaryEmployee employee) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) {
          return SalaryDetailsScreen(
            session: widget.session,
            employee: employee,
            cycle: _controller.cycle,
          );
        },
      ),
    );

    if (!mounted) {
      return;
    }

    await _load(quiet: true);
  }

  Future<void> _openFilters() async {
    final selected = await showModalBottomSheet<SalaryListFilter>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _FilterSheet(selected: _controller.filter);
      },
    );

    if (!mounted || selected == null) {
      return;
    }

    _controller.setFilter(selected);
  }

  void _openShortages() {
    unawaited(
      Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) {
            return ShortagesScreen(
              session: widget.session,
              branchId: widget.branchId ?? widget.session.branchId,
            );
          },
        ),
      ),
    );
  }

  int _filterCount(SalaryListFilter filter, PayrollSummary? summary) {
    return switch (filter) {
      SalaryListFilter.all => summary?.employeeCount ?? 0,
      SalaryListFilter.unpaid => summary?.unpaidCount ?? 0,
      SalaryListFilter.partial => summary?.partialCount ?? 0,
      SalaryListFilter.paid => summary?.paidCount ?? 0,
    };
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFDFDFD),

      body: SafeArea(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final dashboard = _controller.dashboard;
            final summary = _controller.summary;
            final cycle = _controller.cycle;

            if (_controller.isLoading && dashboard == null) {
              return const Center(
                child: CircularProgressIndicator(color: forestEmerald),
              );
            }

            return RefreshIndicator(
              color: forestEmerald,
              onRefresh: _load,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: _SalaryHeader(
                      cycle: cycle,
                      onAddEmployee: () {
                        unawaited(_addEmployee());
                      },
                      onFilter: () {
                        unawaited(_openFilters());
                      },
                    ),
                  ),

                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 24),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate([
                        _PayrollSummaryCard(
                          summary: summary,
                          onViewShortages: _openShortages,
                        ),

                        if (_controller.error != null) ...[
                          const SizedBox(height: 10),
                          _InlineMessage(
                            message: _controller.error!,
                            isError: true,
                          ),
                        ],

                        if (_controller.notice != null) ...[
                          const SizedBox(height: 10),
                          _InlineMessage(message: _controller.notice!),
                        ],

                        const SizedBox(height: 12),

                        _SalarySearchField(
                          controller: _searchController,
                          onChanged: _controller.setSearch,
                        ),

                        const SizedBox(height: 12),

                        _FilterTabs(
                          selected: _controller.filter,
                          countFor: (filter) {
                            return _filterCount(filter, summary);
                          },
                          onChanged: _controller.setFilter,
                        ),

                        const SizedBox(height: 12),

                        if (dashboard != null)
                          _EmployeeListCard(
                            employees: _controller.visibleEmployees,
                            cycle: dashboard.cycle,
                            onTap: (employee) {
                              unawaited(_openDetails(employee));
                            },
                          )
                        else
                          const _EmployeeListUnavailable(),

                        const SizedBox(height: 12),

                        const _PayrollInformationStrip(),
                      ]),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

// =============================================================================
// HEADER
// =============================================================================

class _SalaryHeader extends StatelessWidget {
  const _SalaryHeader({
    required this.cycle,
    required this.onAddEmployee,
    required this.onFilter,
  });

  final SalaryCycle? cycle;
  final VoidCallback onAddEmployee;
  final VoidCallback onFilter;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(14, 8, 12, 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 390;

          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  SizedBox(
                    width: 40,
                    height: 40,
                    child: IconButton(
                      tooltip: 'Back',
                      onPressed: () {
                        Navigator.of(context).maybePop();
                      },
                      padding: EdgeInsets.zero,
                      icon: const Icon(
                        Icons.arrow_back_rounded,
                        color: midnightNavy,
                        size: 25,
                      ),
                    ),
                  ),

                  const SizedBox(width: 8),

                  const Expanded(
                    child: Text(
                      'Salaries',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 21,
                        height: 1.05,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),

                  const SizedBox(width: 8),

                  if (compact)
                    SizedBox(
                      width: 40,
                      height: 40,
                      child: OutlinedButton(
                        onPressed: onAddEmployee,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: _salaryBlue,
                          backgroundColor: Colors.white,
                          side: const BorderSide(color: Color(0xFFD6E1F5)),
                          padding: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(9),
                          ),
                        ),
                        child: const Icon(Icons.add_rounded, size: 20),
                      ),
                    )
                  else
                    SizedBox(
                      height: 40,
                      child: OutlinedButton.icon(
                        onPressed: onAddEmployee,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: _salaryBlue,
                          backgroundColor: Colors.white,
                          side: const BorderSide(color: Color(0xFFD6E1F5)),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(9),
                          ),
                        ),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text(
                          'Add employee',
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),

                  const SizedBox(width: 4),

                  SizedBox(
                    width: 40,
                    height: 40,
                    child: IconButton(
                      tooltip: 'Filter',
                      onPressed: onFilter,
                      padding: EdgeInsets.zero,
                      icon: const Icon(
                        Icons.filter_alt_outlined,
                        size: 23,
                        color: midnightNavy,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 4),

              Row(
                children: [
                  const SizedBox(width: 48),

                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(text: 'Payroll cycle: '),
                          TextSpan(
                            text: cycle?.label ?? '—',
                            style: const TextStyle(
                              color: midnightNavy,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),

                  const SizedBox(width: 7),

                  const Icon(
                    Icons.calendar_today_outlined,
                    color: forestEmerald,
                    size: 14,
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EmployeeListUnavailable extends StatelessWidget {
  const _EmployeeListUnavailable();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Text(
        'Salary records could not be loaded. Pull down to refresh when online.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: slateText,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// =============================================================================
// PAYROLL SUMMARY
// =============================================================================

class _PayrollSummaryCard extends StatelessWidget {
  const _PayrollSummaryCard({
    required this.summary,
    required this.onViewShortages,
  });

  final PayrollSummary? summary;
  final VoidCallback onViewShortages;

  @override
  Widget build(BuildContext context) {
    final data =
        summary ??
        const PayrollSummary(
          totalPayrollDue: 0,
          employeeCount: 0,
          paid: 0,
          outstanding: 0,
          paidPercent: 0,
          outstandingPercent: 0,
          employeeShortages: 0,
          shortageEmployeeCount: 0,
          unpaidCount: 0,
          partialCount: 0,
          paidCount: 0,
        );

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 13, 14, 8),
            child: Text(
              'Payroll summary for this cycle',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(7, 7, 7, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _SummaryMetric(
                    label: 'Total payroll due',
                    value: salaryMoney(data.totalPayrollDue),
                    caption: 'For ${data.employeeCount} employees',
                    icon: Icons.account_balance_wallet_outlined,
                    color: forestEmerald,
                    background: const Color(0xFFECF8EF),
                  ),
                ),

                const _SummaryDivider(),

                Expanded(
                  child: _SummaryMetric(
                    label: 'Paid',
                    value: salaryMoney(data.paid),
                    caption: '${data.paidPercent}% of total',
                    icon: Icons.check_circle_outline_rounded,
                    color: forestEmerald,
                    background: const Color(0xFFECF8EF),
                  ),
                ),

                const _SummaryDivider(),

                Expanded(
                  child: _SummaryMetric(
                    label: 'Outstanding',
                    value: salaryMoney(data.outstanding),
                    caption: '${data.outstandingPercent}% of total',
                    icon: Icons.error_outline_rounded,
                    color: _salaryOrange,
                    background: const Color(0xFFFFF2E8),
                  ),
                ),

                const _SummaryDivider(),

                Expanded(
                  child: _SummaryMetric(
                    label: 'Employee shortages',
                    value: salaryMoney(data.employeeShortages),
                    caption: '${data.shortageEmployeeCount} employees affected',
                    icon: Icons.group_outlined,
                    color: _salaryOrange,
                    background: const Color(0xFFFFF2E8),
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Container(
              constraints: const BoxConstraints(minHeight: 40),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: _salaryOrangeSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.info_outline_rounded,
                    color: Color(0xFF9A4B12),
                    size: 16,
                  ),

                  const SizedBox(width: 8),

                  const Expanded(
                    child: Text(
                      'Some employees have shortages which may affect their salaries',
                      style: TextStyle(
                        color: Color(0xFF704018),
                        fontSize: 8.2,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),

                  InkWell(
                    onTap: onViewShortages,
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Text(
                            'View shortages',
                            style: TextStyle(
                              color: _salaryBlue,
                              fontSize: 8,
                              fontWeight: FontWeight.w700,
                            ),
                          ),

                          SizedBox(width: 1),

                          Icon(
                            Icons.chevron_right_rounded,
                            color: _salaryBlue,
                            size: 16,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
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
    required this.caption,
    required this.icon,
    required this.color,
    required this.background,
  });

  final String label;
  final String value;
  final String caption;
  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        children: [
          SizedBox(
            height: 28,
            child: Center(
              child: Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 7.4,
                  height: 1.15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),

          const SizedBox(height: 2),

          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 11.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          const SizedBox(height: 5),

          SizedBox(
            height: 18,
            child: Center(
              child: Text(
                caption,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 6.8,
                  height: 1.15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),

          const SizedBox(height: 6),

          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: background,
              shape: BoxShape.circle,
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
    return Container(width: 1, height: 92, color: line);
  }
}

// =============================================================================
// SEARCH
// =============================================================================

class _SalarySearchField extends StatelessWidget {
  const _SalarySearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        style: const TextStyle(
          color: midnightNavy,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
        decoration: InputDecoration(
          hintText: 'Search by employee name or phone...',
          hintStyle: const TextStyle(
            color: slateText,
            fontSize: 9,
            fontWeight: FontWeight.w500,
          ),
          prefixIcon: const Icon(
            Icons.search_rounded,
            color: slateText,
            size: 20,
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding: EdgeInsets.zero,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: forestEmerald, width: 1),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// FILTERS
// =============================================================================

class _FilterTabs extends StatelessWidget {
  const _FilterTabs({
    required this.selected,
    required this.countFor,
    required this.onChanged,
  });

  final SalaryListFilter selected;
  final int Function(SalaryListFilter filter) countFor;
  final ValueChanged<SalaryListFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final filter in SalaryListFilter.values) ...[
          Expanded(
            child: _FilterTab(
              filter: filter,
              selected: selected == filter,
              count: countFor(filter),
              onTap: () {
                onChanged(filter);
              },
            ),
          ),

          if (filter != SalaryListFilter.values.last) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

class _FilterTab extends StatelessWidget {
  const _FilterTab({
    required this.filter,
    required this.selected,
    required this.count,
    required this.onTap,
  });

  final SalaryListFilter filter;
  final bool selected;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = _filterLabel(filter);

    final countColor = switch (filter) {
      SalaryListFilter.unpaid => _salaryRed,
      SalaryListFilter.partial => _salaryOrange,
      SalaryListFilter.paid => forestEmerald,
      SalaryListFilter.all => forestEmerald,
    };

    final showBadge = filter != SalaryListFilter.all && count > 0;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected ? forestEmerald : line,
              width: selected ? 1.15 : 1,
            ),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    filter == SalaryListFilter.all ? '$label ($count)' : label,
                    style: TextStyle(
                      color: selected ? forestEmerald : midnightNavy,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),

                  if (showBadge) ...[
                    const SizedBox(width: 5),

                    Container(
                      constraints: const BoxConstraints(
                        minWidth: 19,
                        minHeight: 19,
                      ),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      decoration: BoxDecoration(
                        color: countColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '$count',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 7.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterSheet extends StatelessWidget {
  const _FilterSheet({required this.selected});

  final SalaryListFilter selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(10),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: SafeArea(
        top: false,
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
              'Filter salaries',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 8),

            for (final filter in SalaryListFilter.values)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _filterLabel(filter),
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                trailing: selected == filter
                    ? const Icon(
                        Icons.check_circle_rounded,
                        color: forestEmerald,
                      )
                    : null,
                onTap: () {
                  Navigator.of(context).pop(filter);
                },
              ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// EMPLOYEE LIST
// =============================================================================

class _EmployeeListCard extends StatelessWidget {
  const _EmployeeListCard({
    required this.employees,
    required this.cycle,
    required this.onTap,
  });

  final List<SalaryEmployee> employees;
  final SalaryCycle cycle;
  final ValueChanged<SalaryEmployee> onTap;

  @override
  Widget build(BuildContext context) {
    if (employees.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 44),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(
          child: Text(
            'No employees found.',
            style: TextStyle(
              color: slateText,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var index = 0; index < employees.length; index++) ...[
            SalaryEmployeeRow(
              employee: employees[index],
              cycle: cycle,
              onTap: () {
                onTap(employees[index]);
              },
            ),

            if (index < employees.length - 1)
              const Divider(height: 1, color: line),
          ],
        ],
      ),
    );
  }
}

// =============================================================================
// INFORMATION STRIP
// =============================================================================

class _PayrollInformationStrip extends StatelessWidget {
  const _PayrollInformationStrip();

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 34),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: _salaryGreenSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_user_outlined, color: forestEmerald, size: 15),

          SizedBox(width: 7),

          Expanded(
            child: Text(
              'Salaries are calculated on the 22nd–21st cycle and paid from that day’s open branch cash.',
              style: TextStyle(
                color: forestEmerald,
                fontSize: 7.8,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// MESSAGE
// =============================================================================

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({required this.message, this.isError = false});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color = isError ? _salaryRed : forestEmerald;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        border: Border.all(color: color.withValues(alpha: 0.15)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

String _filterLabel(SalaryListFilter filter) {
  return switch (filter) {
    SalaryListFilter.all => 'All',
    SalaryListFilter.unpaid => 'Unpaid',
    SalaryListFilter.partial => 'Partial',
    SalaryListFilter.paid => 'Paid',
  };
}
