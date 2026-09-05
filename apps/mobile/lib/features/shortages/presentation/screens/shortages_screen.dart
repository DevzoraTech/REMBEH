import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/network/realtime_client.dart';
import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../salaries/application/load_salaries_dashboard.dart';
import '../../../salaries/data/repositories/salaries_repository_impl.dart';
import '../../../salaries/domain/models/salary_models.dart';
import '../../../salaries/presentation/sheets/record_opening_shortage_sheet.dart';
import '../../../salaries/presentation/sheets/record_shortage_payoff_sheet.dart';
import '../../../salaries/presentation/utils/salary_formatters.dart';
import '../../application/list_cash_shortages.dart';
import '../../application/record_opening_shortage.dart';
import '../../application/settle_employee_shortage.dart';
import '../../data/repositories/cash_shortages_repository_impl.dart';
import '../../domain/models/cash_shortage.dart';
import '../controllers/shortages_controller.dart';
import '../utils/shortage_formatters.dart';
import '../sheets/clear_employee_shortage_sheet.dart';
import '../sheets/pick_salary_employee_sheet.dart';
import '../widgets/shortage_filter_tabs.dart';
import '../widgets/shortage_list_row.dart';
import '../widgets/shortage_messages.dart';
import '../widgets/shortage_summary_card.dart';
import 'shortage_details_screen.dart';

class ShortagesScreen extends StatefulWidget {
  const ShortagesScreen({
    super.key,
    required this.session,
    this.initialShortages = const [],
    this.branchId,
    this.userId,
    this.title = 'Shortages',
    this.subtitle = 'Record prior shortages and cash payoffs',
  });

  final RembehSession session;
  final List<CashShortage> initialShortages;
  final String? branchId;
  final String? userId;
  final String title;
  final String subtitle;

  @override
  State<ShortagesScreen> createState() => _ShortagesScreenState();
}

class _ShortagesScreenState extends State<ShortagesScreen>
    with WidgetsBindingObserver {
  late final ShortagesController _controller;
  late final LoadSalariesDashboard _loadSalariesDashboard;
  late final RecordOpeningShortage _recordOpeningShortage;
  late final SettleEmployeeShortage _settleEmployeeShortage;
  late final RealtimeHandler _onShortageUpdated;
  late final RealtimeHandler _onOpsChanged;

  bool _preparingAction = false;
  Timer? _pollTimer;

  bool get _isEmployeeHistory =>
      widget.userId != null && widget.userId!.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    final apiClient = ApiClient(SessionStore());
    final repository = CashShortagesRepositoryImpl(apiClient: apiClient);

    _loadSalariesDashboard = LoadSalariesDashboard(
      SalariesRepositoryImpl(apiClient: apiClient),
    );
    _recordOpeningShortage = RecordOpeningShortage(repository);
    _settleEmployeeShortage = SettleEmployeeShortage(repository);
    _controller = ShortagesController(
      listCashShortages: ListCashShortages(repository),
    );

    if (widget.initialShortages.isNotEmpty) {
      _controller.seed(widget.initialShortages);
    }

    _onShortageUpdated = (_) {
      unawaited(_load(quiet: true));
    };
    _onOpsChanged = (_) {
      unawaited(_load(quiet: true));
    };

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(
        _controller.load(
          session: widget.session,
          branchId: widget.branchId,
          userId: widget.userId,
          quiet: widget.initialShortages.isNotEmpty,
          forceNetwork: true,
        ),
      );
      unawaited(_bindRealtime());
      _startPolling();
    });
  }

  Future<void> _bindRealtime() async {
    try {
      await RealtimeClient.instance.connect(widget.session);
      RealtimeClient.instance.on('shortage.updated', _onShortageUpdated);
      RealtimeClient.instance.on('operation.float_returned', _onOpsChanged);
      RealtimeClient.instance.on('operation.branch_closed', _onOpsChanged);
    } catch (_) {
      // Polling still covers updates when the socket is unavailable.
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (!mounted) return;
      unawaited(_load(quiet: true));
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_load(quiet: true));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    RealtimeClient.instance.off('shortage.updated', _onShortageUpdated);
    RealtimeClient.instance.off('operation.float_returned', _onOpsChanged);
    RealtimeClient.instance.off('operation.branch_closed', _onOpsChanged);
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) {
    return _controller.load(
      session: widget.session,
      branchId: widget.branchId,
      userId: widget.userId,
      quiet: quiet,
      forceNetwork: true,
    );
  }

  Future<void> _openDetails(CashShortage shortage) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ShortageDetailsScreen(
          session: widget.session,
          shortageId: shortage.id,
          initialShortage: shortage,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    await _load(quiet: true);
  }

  Future<void> _openClearByEmployee() async {
    final employees = _controller.employeesWithOpenShortages;
    if (employees.isEmpty) {
      _showSnackBar('There is no open shortage to clear.');
      return;
    }

    final recorded = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return ClearEmployeeShortageSheet(
          session: widget.session,
          employees: employees,
          settleEmployee: _settleEmployeeShortage,
        );
      },
    );

    if (!mounted || recorded != true) {
      return;
    }

    _showSnackBar('Shortage clearance recorded.');
    await _controller.invalidateActiveCache();
    await _load(quiet: true);
  }

  Future<void> _openRecordShortage() async {
    final dashboard = await _loadEmployeesDashboard();
    if (dashboard == null || !mounted) {
      return;
    }

    final employees = _branchEmployees(dashboard.employees);
    if (employees.isEmpty) {
      _showSnackBar(
        'No branch-assigned employees were found. Assign the person to a branch first.',
      );
      return;
    }

    final employee = await _pickEmployee(
      employees: employees,
      title: 'Record shortage',
      subtitle: 'Select the employee this prior shortage belongs to.',
    );
    if (employee == null || !mounted) {
      return;
    }

    final input = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) {
        return RecordOpeningShortageSheet(employee: employee);
      },
    );

    if (input == null || !mounted) {
      return;
    }

    try {
      await _recordOpeningShortage(
        session: widget.session,
        employeeId: employee.id,
        amount: input['amount'] as num,
        notes: (input['notes'] as String?)?.trim(),
      );

      if (!mounted) {
        return;
      }

      _showSnackBar('Prior shortage recorded.');
      await _controller.invalidateActiveCache();
      await _load(quiet: true);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showSnackBar(friendlyErrorMessage(error));
    }
  }

  Future<void> _openCashPayoff() async {
    final dashboard = await _loadEmployeesDashboard();
    if (dashboard == null || !mounted) {
      return;
    }

    final employees = _branchEmployees(
      dashboard.employees,
    ).where((employee) => employee.hasShortage).toList();
    if (employees.isEmpty) {
      _showSnackBar('There is no open shortage to pay off.');
      return;
    }

    final employee = await _pickEmployee(
      employees: employees,
      title: 'Record cash payoff',
      subtitle: 'Select the employee paying cash against their shortage.',
    );
    if (employee == null || !mounted) {
      return;
    }

    final input = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) {
        return RecordShortagePayoffSheet(
          employee: employee,
          openCashDayLabel: dashboard.openCashDay?.operationDate == null
              ? null
              : salaryDate(dashboard.openCashDay!.operationDate),
        );
      },
    );

    if (input == null || !mounted) {
      return;
    }

    try {
      await _settleEmployeeShortage(
        session: widget.session,
        employeeId: employee.id,
        responsibleUserId: employee.userId,
        amount: input['amount'] as num,
        notes: (input['notes'] as String?)?.trim(),
      );

      if (!mounted) {
        return;
      }

      _showSnackBar('Shortage payoff recorded as today’s cash in.');
      await _controller.invalidateActiveCache();
      await _load(quiet: true);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showSnackBar(friendlyErrorMessage(error));
    }
  }

  Future<SalariesDashboard?> _loadEmployeesDashboard() async {
    if (_preparingAction) {
      return null;
    }

    setState(() {
      _preparingAction = true;
    });

    try {
      return await _loadSalariesDashboard(
        session: widget.session,
        branchId: widget.branchId ?? widget.session.branchId,
      );
    } catch (error) {
      if (mounted) {
        _showSnackBar(friendlyErrorMessage(error));
      }
      return null;
    } finally {
      if (mounted) {
        setState(() {
          _preparingAction = false;
        });
      }
    }
  }

  Future<SalaryEmployee?> _pickEmployee({
    required List<SalaryEmployee> employees,
    required String title,
    required String subtitle,
  }) {
    return showModalBottomSheet<SalaryEmployee>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return PickSalaryEmployeeSheet(
          employees: employees,
          title: title,
          subtitle: subtitle,
        );
      },
    );
  }

  List<SalaryEmployee> _branchEmployees(List<SalaryEmployee> employees) {
    return employees
        .where((employee) => (employee.branchId ?? '').trim().isNotEmpty)
        .toList();
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _emptyMessage(ShortageListFilter filter) {
    return switch (filter) {
      ShortageListFilter.open => 'No open shortages.',
      ShortageListFilter.closed => 'No closed shortages.',
      ShortageListFilter.all => 'No shortages found.',
    };
  }

  @override
  Widget build(BuildContext context) {
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
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              widget.subtitle,
              style: const TextStyle(
                color: slateText,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          if (!_isEmployeeHistory)
            IconButton(
              tooltip: 'Record shortage',
              onPressed: _preparingAction
                  ? null
                  : () => unawaited(_openRecordShortage()),
              icon: const Icon(Icons.add_rounded, color: midnightNavy),
            ),
          IconButton(
            tooltip: 'Clear shortage',
            onPressed: () => unawaited(_openClearByEmployee()),
            icon: const Icon(
              Icons.person_search_rounded,
              color: midnightNavy,
            ),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => unawaited(_load()),
            icon: const Icon(Icons.refresh_rounded, color: midnightNavy),
          ),
          PopupMenuButton<ShortageListFilter>(
            icon: const Icon(Icons.filter_alt_outlined, color: midnightNavy),
            onSelected: _controller.setFilter,
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: ShortageListFilter.open,
                child: Text('Open'),
              ),
              PopupMenuItem(
                value: ShortageListFilter.closed,
                child: Text('Closed'),
              ),
              PopupMenuItem(value: ShortageListFilter.all, child: Text('All')),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return RefreshIndicator(
            color: forestEmerald,
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ShortageSummaryCard(
                        icon: Icons.report_gmailerrorred_outlined,
                        label: 'Open shortages',
                        value: '${_controller.openCount}',
                        tone: const Color(0xFFD92D20),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ShortageSummaryCard(
                        icon: Icons.inventory_2_outlined,
                        label: 'Outstanding amount',
                        value: shortageMoney(_controller.openAmount),
                        tone: const Color(0xFFC05A00),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (!_isEmployeeHistory) ...[
                  FilledButton.icon(
                    onPressed: _preparingAction
                        ? null
                        : () => unawaited(_openRecordShortage()),
                    style: FilledButton.styleFrom(
                      backgroundColor: forestEmerald,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(46),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    icon: _preparingAction
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.add_rounded, size: 18),
                    label: const Text(
                      'Record shortage',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _preparingAction
                        ? null
                        : () => unawaited(_openCashPayoff()),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: midnightNavy,
                      minimumSize: const Size.fromHeight(46),
                      side: const BorderSide(color: line),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    icon: const Icon(Icons.payments_outlined, size: 18),
                    label: const Text(
                      'Record cash payoff',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(height: 12),
                ] else ...[
                  FilledButton.icon(
                    onPressed: () => unawaited(_openClearByEmployee()),
                    style: FilledButton.styleFrom(
                      backgroundColor: forestEmerald,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(46),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    icon: const Icon(Icons.person_search_rounded, size: 18),
                    label: const Text(
                      'Clear shortage by employee',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                ShortageFilterTabs(
                  selected: _controller.filter,
                  onChanged: _controller.setFilter,
                ),
                if (_controller.notice != null) ...[
                  const SizedBox(height: 12),
                  ShortageInlineMessage(message: _controller.notice!),
                ],
                if (_controller.error != null) ...[
                  const SizedBox(height: 12),
                  ShortageInlineMessage(
                    message: _controller.error!,
                    error: true,
                  ),
                ],
                const SizedBox(height: 12),
                if (_controller.isRefreshing &&
                    _controller.shortages.isNotEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: LinearProgressIndicator(
                      minHeight: 2,
                      color: forestEmerald,
                      backgroundColor: Color(0xFFE8F5EF),
                    ),
                  ),
                if (_controller.isLoading && _controller.shortages.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 80),
                    child: Center(
                      child: CircularProgressIndicator(color: forestEmerald),
                    ),
                  )
                else if (_controller.visibleShortages.isEmpty)
                  ShortageEmptyState(message: _emptyMessage(_controller.filter))
                else
                  for (final shortage in _controller.visibleShortages) ...[
                    ShortageListRow(
                      shortage: shortage,
                      onTap: () => _openDetails(shortage),
                    ),
                    const SizedBox(height: 8),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }
}
