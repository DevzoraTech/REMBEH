import 'dart:async';

import 'package:flutter/material.dart';

import '../../features/applications_list/data/applications_live_store.dart';
import '../../features/more/presentation/screens/more_tab.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../features/workspace/presentation/widgets/branch_header.dart';
import '../../features/workspace/presentation/widgets/workspace_bottom_navigation.dart';
import '../../models/field_records.dart';
import '../../services/api_client.dart';
import '../../services/session_activity.dart';
import '../../services/session_cleanup.dart';
import '../../services/session_store.dart';
import '../../services/update_prompt.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';
import '../edit_records_screen.dart';
import '../home/manager_owner_home_tab.dart';
import '../home/needs_attention_section.dart';
import '../home/recent_activity_list.dart';
import '../login_screen.dart';
import '../profile/agent_profile_screen.dart';
import '../records/records_tab.dart';
import '../repayment_corrections_screen.dart';
import '../search/search_tab.dart';
import '../voided_clients_screen.dart';
import 'staff_screen.dart';

class OwnerWorkspaceScreen extends StatefulWidget {
  const OwnerWorkspaceScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<OwnerWorkspaceScreen> createState() => _OwnerWorkspaceScreenState();
}

class _OwnerOption {
  const _OwnerOption({required this.id, required this.name});

  final String id;
  final String name;
}

class _OwnerWorkspaceScreenState extends State<OwnerWorkspaceScreen> {
  final SessionStore _store = SessionStore();
  late final ApiClient _api = ApiClient(_store);
  late final SessionActivityController _activity;
  final _repayStore = RepaymentsLiveStore.instance;

  int _index = 0;
  RecordsSection _recordsSection = RecordsSection.repayments;
  RecordsFilter _recordsFilter = RecordsFilter.all;
  bool _searchAutofocus = false;
  int _searchFocusToken = 0;

  bool _loading = true;
  String? _error;
  String? _branchId;
  List<_OwnerOption> _branches = const [];
  List<Map<String, dynamic>> _customers = const [];
  List<Map<String, dynamic>> _loans = const [];

  @override
  void initState() {
    super.initState();
    _activity = SessionActivityController(
      sessionStore: _store,
      onSessionCleared: _signOut,
      onResumed: () async {
        if (!mounted) return;
        await promptAppUpdateIfNeeded(context);
      },
    );
    _activity.start();
    _repayStore.addListener(_onStoreChanged);
    unawaited(_boot());
  }

  @override
  void dispose() {
    _repayStore.removeListener(_onStoreChanged);
    _activity.dispose();
    super.dispose();
  }

  void _onStoreChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _boot() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await Future.wait([
        _repayStore.start(widget.session),
        ApplicationsLiveStore.instance.start(widget.session),
        _loadLists(),
      ]);
      if (!mounted) return;
      setState(() => _loading = false);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  Future<void> _loadLists() async {
    final branchPayload = await _api.listBranches(widget.session);
    final customers = await _api.listCustomers(widget.session);
    final loans = await _api.listLoans(widget.session);
    final rawBranches = branchPayload['branches'] as List<dynamic>? ?? const [];
    final branches = rawBranches
        .whereType<Map>()
        .map(
          (item) => _OwnerOption(
            id: item['id'] as String? ?? '',
            name: item['name'] as String? ?? 'Branch',
          ),
        )
        .where((item) => item.id.isNotEmpty)
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    if (!mounted) return;
    setState(() {
      _branches = branches;
      _customers = customers;
      _loans = loans;
    });
  }

  Future<void> _signOut() async {
    await clearTenantScopedClientState();
    await _store.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  void _openTab(int index, {bool searchAutofocus = false}) {
    setState(() {
      _index = index;
      if (searchAutofocus) {
        _searchAutofocus = true;
        _searchFocusToken += 1;
      }
    });
  }

  void _openRecords({
    RecordsSection section = RecordsSection.repayments,
    RecordsFilter filter = RecordsFilter.all,
  }) {
    setState(() {
      _index = 1;
      _recordsSection = section;
      _recordsFilter = filter;
    });
  }

  bool _matchesBranch(String? branchId) {
    final selected = _branchId;
    if (selected == null || selected.isEmpty) return true;
    return branchId == selected;
  }

  bool _isPresent(dynamic value) =>
      value is String && value.trim().isNotEmpty;

  List<Map<String, dynamic>> get _scopedCustomers => _customers
      .where(
        (row) =>
            _matchesBranch(row['branchId'] as String?) &&
            !_isPresent(row['voidedAt']),
      )
      .toList();

  List<Map<String, dynamic>> get _scopedLoans => _loans
      .where(
        (row) =>
            _matchesBranch(row['branchId'] as String?) &&
            !_isPresent(row['customerVoidedAt']) &&
            !_isPresent(row['voidedAt']),
      )
      .toList();

  List<FieldRepayment> get _scopedRepayments => _repayStore.repayments
      .where((item) => _matchesBranch(item.branchId))
      .toList();

  bool _sameDay(DateTime value, DateTime now) =>
      value.year == now.year && value.month == now.month && value.day == now.day;

  int get _collectedToday {
    final now = DateTime.now();
    return _scopedRepayments
        .where((item) => _sameDay(item.recordedAt, now))
        .fold<int>(0, (sum, item) => sum + item.amount);
  }

  int get _repaymentsTodayCount {
    final now = DateTime.now();
    return _scopedRepayments.where((item) => _sameDay(item.recordedAt, now)).length;
  }

  bool _loanIsActive(Map<String, dynamic> loan) {
    final status = (loan['status'] as String? ?? '').toUpperCase();
    final balance = ((loan['balance'] as num?) ?? 0);
    return balance > 0 &&
        status != 'CLOSED' &&
        status != 'WRITTEN_OFF' &&
        status != 'REJECTED';
  }

  String get _selectedBranchLabel {
    if (_branchId == null) return 'All branches';
    for (final branch in _branches) {
      if (branch.id == _branchId) return branch.name;
    }
    return 'All branches';
  }

  List<AttentionItem> _attentionItems() {
    final due = _repayStore.dueTodayClients
        .where((item) => _matchesBranch(item.branchId))
        .length;
    final overduePaid = _repayStore.overduePaidClients
        .where((item) => _matchesBranch(item.branchId))
        .length;
    final overdueBorrowers = _scopedCustomers
        .where((row) => row['hasOverdueLoan'] == true)
        .length;
    return [
      if (due > 0)
        AttentionItem(
          icon: Icons.event_busy,
          iconColor: warmGold,
          title: 'Still due today',
          subtitle: '$due borrower${due == 1 ? '' : 's'} have not paid yet',
          count: '$due',
          onTap: () => _openRecords(filter: RecordsFilter.dueToday),
        ),
      if (overduePaid > 0)
        AttentionItem(
          icon: Icons.warning_amber_rounded,
          iconColor: const Color(0xFFE11D2E),
          title: 'Overdue paid today',
          subtitle: '$overduePaid overdue borrower${overduePaid == 1 ? '' : 's'} paid today',
          count: '$overduePaid',
          onTap: () => _openRecords(filter: RecordsFilter.overduePaid),
        ),
      if (overdueBorrowers > 0)
        AttentionItem(
          icon: Icons.people_outline_rounded,
          iconColor: const Color(0xFFB96D15),
          title: 'Overdue borrowers',
          subtitle: '$overdueBorrowers with an overdue loan',
          count: '$overdueBorrowers',
          onTap: () => _openTab(2, searchAutofocus: true),
        ),
    ];
  }

  List<ActivityItem> _recentActivities() {
    final now = DateTime.now();
    return _scopedRepayments.take(8).map((item) {
      return ActivityItem(
        initials: item.initials,
        initialsBackgroundColor: sage,
        name: item.clientName,
        activityType: item.branchName ?? 'Repayment',
        time: formatActivityTime(item.recordedAt, now),
        amount: item.amount,
      );
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return SessionActivityListener(
      controller: _activity,
      child: Scaffold(
        backgroundColor: softIvory,
        body: SafeArea(
          child: Column(
            children: [
              BranchHeader(
                workspaceName: widget.session.workspaceName,
                branchName: _selectedBranchLabel,
                roleName: widget.session.roleName ?? 'Owner',
                loading: _loading,
                onRefresh: _boot,
                onSignOut: _signOut,
              ),
              _BranchFilterBar(
                branches: _branches,
                selectedId: _branchId,
                onChanged: (value) => setState(() => _branchId = value),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      color: Color(0xFFB42318),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              Expanded(
                child: _loading && _customers.isEmpty
                    ? const Center(
                        child: CircularProgressIndicator(color: forestEmerald),
                      )
                    : IndexedStack(
                        index: _index,
                        children: [
                          _buildHome(),
                          RecordsTab(
                            session: widget.session,
                            section: _recordsSection,
                            filter: _recordsFilter,
                            branchId: _branchId,
                            onSectionChanged: (section) {
                              setState(() => _recordsSection = section);
                            },
                            onFilterChanged: (filter) {
                              setState(() => _recordsFilter = filter);
                            },
                            onCorrectionsTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => RepaymentCorrectionsScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                          ),
                          SearchTab(
                            autofocus: _searchAutofocus,
                            focusToken: _searchFocusToken,
                            branchId: _branchId,
                          ),
                          MoreTab(
                            showBranchTools: false,
                            onAgentsTap: () {},
                            onSalariesTap: () {},
                            onShortagesTap: () {},
                            onRepaymentCorrectionsTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => RepaymentCorrectionsScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                            onReportsTap: () {},
                            onBranchTap: () {},
                            onSubscriptionTap: () {},
                            onSettingsTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => AgentProfileScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                            onSupportTap: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Contact ANTIKRA support from the web dashboard.',
                                  ),
                                ),
                              );
                            },
                            onStaffTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => OwnerStaffScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                            onVoidedClientsTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => VoidedClientsScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                            onEditRecordsTap: () {
                              Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => EditRecordsScreen(
                                    session: widget.session,
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: WorkspaceBottomNavigation(
          selectedIndex: _index,
          showOperations: false,
          onChanged: (index) {
            _openTab(index, searchAutofocus: index == 2);
          },
        ),
      ),
    );
  }

  Widget _buildHome() {
    final now = DateTime.now();
    final loansIssuedToday = _scopedLoans.where((loan) {
      final raw =
          loan['disbursedAt'] as String? ?? loan['createdAt'] as String?;
      final date = DateTime.tryParse(raw ?? '');
      return date != null && _sameDay(date.toLocal(), now);
    }).toList();
    final newBorrowers = _scopedCustomers.where((row) {
      final date = DateTime.tryParse(row['createdAt'] as String? ?? '');
      return date != null && _sameDay(date.toLocal(), now);
    }).length;
    final dueToday = _repayStore.dueTodayClients
        .where((item) => _matchesBranch(item.branchId))
        .length;
    final overdueLoans = _scopedLoans.where((loan) {
      final status = (loan['status'] as String? ?? '').toUpperCase();
      final overdueDays = ((loan['overdueDays'] as num?) ?? 0).toInt();
      final finesTotal = ((loan['finesTotal'] as num?) ?? 0);
      return status == 'IN_ARREARS' || overdueDays > 0 || finesTotal > 0;
    }).length;

    return ManagerOwnerHomeTab(
      session: widget.session,
      organisationScope: true,
      financesOverallLabel: _selectedBranchLabel,
      financesOverallValue: '${_branches.isEmpty ? 0 : (_branchId == null ? _branches.length : 1)} branch${_branchId == null && _branches.length != 1 ? 'es' : ''}',
      repaymentsTodayCount: _repaymentsTodayCount,
      onOpenProfile: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => AgentProfileScreen(session: widget.session),
          ),
        );
      },
      onOpenSearch: () => _openTab(2, searchAutofocus: true),
      onOpenRecords: ({
        RecordsSection section = RecordsSection.repayments,
        RecordsFilter filter = RecordsFilter.all,
      }) {
        _openRecords(section: section, filter: filter);
      },
      onOpenNewLoan: () {},
      onOpenDailyOps: () {},
      onOpenRecordRepayment: () => _openRecords(),
      onOpenFindClient: () => _openTab(2, searchAutofocus: true),
      onOpenEditRecords: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => EditRecordsScreen(session: widget.session),
          ),
        );
      },
      collectedToday: _collectedToday,
      borrowersDueToday: dueToday,
      loansIssuedToday: loansIssuedToday.length,
      amountIssuedToday: loansIssuedToday.fold<int>(
        0,
        (sum, loan) =>
            sum + (((loan['principal'] as num?) ?? 0).round()),
      ),
      overdueLoansCount: overdueLoans,
      activeLoansCount: _scopedLoans.where(_loanIsActive).length,
      newBorrowersToday: newBorrowers,
      overdueBorrowersCount: _scopedCustomers
          .where((row) => row['hasOverdueLoan'] == true)
          .length,
      activeBorrowersCount: _scopedCustomers
          .where((row) => ((row['activeLoanCount'] as num?) ?? 0) > 0)
          .length,
      attentionItems: _attentionItems(),
      recentActivities: _recentActivities(),
    );
  }
}

class _BranchFilterBar extends StatelessWidget {
  const _BranchFilterBar({
    required this.branches,
    required this.selectedId,
    required this.onChanged,
  });

  final List<_OwnerOption> branches;
  final String? selectedId;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    if (branches.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: line),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String?>(
            isExpanded: true,
            value: selectedId,
            hint: const Text(
              'All branches',
              style: TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w700,
              ),
            ),
            icon: const Icon(Icons.expand_more_rounded, color: forestEmerald),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('All branches'),
              ),
              ...branches.map(
                (branch) => DropdownMenuItem<String?>(
                  value: branch.id,
                  child: Text(branch.name),
                ),
              ),
            ],
            onChanged: onChanged,
          ),
        ),
      ),
    );
  }
}
