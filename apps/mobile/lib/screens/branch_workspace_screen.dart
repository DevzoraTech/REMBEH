import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../core/constants/expense_categories.dart';
import '../core/sync/sync_service.dart';
import '../features/applications_list/data/applications_live_store.dart';
import '../features/more/presentation/screens/more_tab.dart';
import '../features/operations/domain/models/agent_float_position.dart';
import '../features/operations/domain/models/operation_activity.dart';
import '../features/operations/domain/models/operation_dashboard_data.dart';
import '../features/operations/domain/utils/operation_formatters.dart';
import '../features/operations/presentation/screens/agent_positions_screen.dart';
import '../features/operations/presentation/screens/day_reconciliation_screen.dart';
import '../features/operations/presentation/screens/expenses_screen.dart';
import '../features/operations/presentation/screens/operations_tab.dart';
import '../features/operations/presentation/report/screens/daily_report_screen.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../features/salaries/presentation/screens/salaries_screen.dart';
import '../features/shortages/presentation/screens/shortages_screen.dart';
import '../features/workspace/presentation/widgets/branch_header.dart';
import '../features/workspace/presentation/widgets/workspace_bottom_navigation.dart';
import '../features/agents/presentation/screens/agents_screen.dart';
import '../models/field_records.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/network_status_store.dart';
import '../services/offline_cache_store.dart';
import '../services/session_activity.dart';
import '../services/session_cleanup.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/account_access.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';
import '../widgets/day_start_sync_dialog.dart';
import 'account_locked_screen.dart';
import 'agent_shell.dart';
import 'home/manager_owner_home_tab.dart';
import 'home/needs_attention_section.dart';
import 'home/recent_activity_list.dart';
import 'loan_application/new_loan_application_screen.dart';
import 'login_screen.dart';
import 'records/records_tab.dart';
import 'register_customer_screen.dart';
import 'search/search_tab.dart';
import 'profile/agent_profile_screen.dart';

class BranchWorkspaceScreen extends StatefulWidget {
  const BranchWorkspaceScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<BranchWorkspaceScreen> createState() => _BranchWorkspaceScreenState();
}

class _BranchWorkspaceScreenState extends State<BranchWorkspaceScreen> {
  final SessionStore _store = SessionStore();
  final OfflineCacheStore _offlineCache = OfflineCacheStore.instance;
  final NetworkStatusStore _network = NetworkStatusStore.instance;

  late final ApiClient _api = ApiClient(_store);
  late final SyncService _syncService = SyncService(
    AuthService(sessionStore: _store),
    rembehApiBaseUrl,
  );

  late final SessionActivityController _activity;

  Map<String, dynamic>? _data;
  Map<String, dynamic>? _collectionSummary;

  List<Map<String, dynamic>> _agents = const [];
  List<Map<String, dynamic>> _customers = const [];
  List<Map<String, dynamic>> _loans = const [];
  List<Map<String, dynamic>> _repayments = const [];
  List<Map<String, dynamic>> _reports = const [];
  List<Map<String, dynamic>> _shortages = const [];

  bool _loading = true;
  bool _saving = false;
  bool _showingCachedData = false;
  bool _backgroundRefreshing = false;

  String? _error;
  String? _notice;

  int _index = 0;

  RecordsSection _recordsSection = RecordsSection.repayments;

  RecordsFilter _recordsFilter = RecordsFilter.all;

  bool _searchAutofocus = false;
  int _searchFocusToken = 0;
  bool _syncPromptScheduled = false;
  Timer? _cacheRecoveryTimer;

  String _date = _todayLabel();

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  @override
  void initState() {
    super.initState();

    _activity = SessionActivityController(
      sessionStore: _store,
      onSessionCleared: _handleSessionCleared,
      onAccountBlocked: _handleAccountBlocked,
    );

    _activity.start();
    _network.addListener(_onNetworkChanged);

    unawaited(_network.start());
    unawaited(_initialiseOfflineSync());
    unawaited(_startLiveStores());
    unawaited(_load());
    _cacheRecoveryTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_showingCachedData || _error != null) {
        unawaited(_refreshFreshDataInBackground());
      }
    });
  }

  @override
  void dispose() {
    _cacheRecoveryTimer?.cancel();
    _network.removeListener(_onNetworkChanged);
    _activity.dispose();
    _syncService.dispose();
    super.dispose();
  }

  void _onNetworkChanged() {
    if (_network.isOnline) {
      unawaited(_refreshFreshDataInBackground());
    }
  }

  Future<void> _refreshFreshDataInBackground() async {
    if (_backgroundRefreshing || !mounted) {
      return;
    }

    _backgroundRefreshing = true;
    try {
      if (!await _network.checkNow()) {
        return;
      }

      final syncResult = await _syncService.performFullSync(isAutoSync: true);
      if (!syncResult.success) {
        return;
      }

      await _load(date: _date, showLoading: false, allowCacheFallback: false);
    } finally {
      _backgroundRefreshing = false;
    }
  }

  Future<void> _initialiseOfflineSync() async {
    try {
      await _syncService.initialize();
    } catch (_) {
      // The workspace still works from the last cached snapshot.
    }

    if (!mounted) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(_showDayStartSyncIfNeeded());
    });
  }

  Future<void> _showDayStartSyncIfNeeded() async {
    if (_syncPromptScheduled || !mounted) {
      return;
    }

    _syncPromptScheduled = true;
    final prefs = await SharedPreferences.getInstance();
    final key =
        'rembeh.manager_day_start_sync.$_cacheTenantId.$_cacheBranchId.${_todayLabel()}';
    if (prefs.getBool(key) == true || !mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => DayStartSyncDialog(
        syncService: _syncService,
        onSyncComplete: () {
          unawaited(prefs.setBool(key, true));
          Navigator.of(dialogContext).pop();
          unawaited(_load());
        },
        onSkip: () {
          unawaited(prefs.setBool(key, true));
          Navigator.of(dialogContext).pop();
        },
      ),
    );
  }

  // ===========================================================================
  // DERIVED DATA
  // ===========================================================================

  Map<String, dynamic>? get _operation =>
      _data?['operation'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _branch =>
      _data?['branch'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _branchAccess =>
      _data?['branchAccess'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _pendingClosure =>
      _data?['pendingClosureOperation'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _awaitingReport =>
      _data?['awaitingReportOperation'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _report =>
      _data?['report'] as Map<String, dynamic>?;

  String get _cacheTenantId => widget.session.tenantId ?? 'tenant';

  String get _cacheBranchId => widget.session.branchId ?? 'all';

  String get _branchName =>
      _string(_branch?['name']) ?? widget.session.branchName ?? 'Branch';

  String get _operationStatus =>
      (_string(_operation?['status']) ?? '').toUpperCase();

  bool get _dayOpen => _operationStatus == 'OPEN';

  bool get _dayClosing => _operationStatus == 'CLOSING';

  bool get _dayActive => _dayOpen || _dayClosing;

  DateTime get _loadedOperationDate {
    return DateTime.tryParse(
          _string(_operation?['operationDate']) ??
              _string(_data?['date']) ??
              _date,
        )?.toLocal() ??
        DateTime.now();
  }

  String get _loadedOperationDateKey => _dateKey(_loadedOperationDate);

  bool get _loadedOperationDateIsToday =>
      _loadedOperationDateKey == _todayLabel();

  String get _homeSummaryPeriodLabel {
    if (_showingCachedData) {
      return 'Cached ${_shortDateLabel(_loadedOperationDate)}';
    }

    return _loadedOperationDateIsToday
        ? 'Today'
        : _shortDateLabel(_loadedOperationDate);
  }

  String get _homeMetricSuffix {
    if (_loadedOperationDateIsToday && !_showingCachedData) {
      return 'today';
    }

    return 'on ${_shortDateLabel(_loadedOperationDate)}';
  }

  bool get _branchCanOperate {
    final value = _branchAccess?['canOperate'];

    return value is bool ? value : true;
  }

  bool get _branchAccessLocked {
    final locked = _branchAccess?['locked'];

    if (locked is bool) {
      return locked;
    }

    return (_string(_branchAccess?['subscriptionStatus']) ?? '')
            .toUpperCase() ==
        'LOCKED';
  }

  String? get _branchAccessMessage => _string(_branchAccess?['message']);

  String? get _operationMutationBlockedMessage {
    if (_showingCachedData) {
      return 'You are viewing cached branch data. Connect to the internet and refresh before changing operations.';
    }

    if (_branchAccessLocked || !_branchCanOperate) {
      return _branchAccessMessage ??
          'This branch is paused. Renew on Subscription to continue.';
    }

    return null;
  }

  String? get _openDayBlockedMessage {
    if (!widget.session.hasPermission('operation.open')) {
      return 'You do not have permission to open branch operations.';
    }

    final mutationBlock = _operationMutationBlockedMessage;

    if (mutationBlock != null) {
      return mutationBlock;
    }

    if (!_isOperationOpenableDate(_loadedOperationDateKey)) {
      return 'Only today or the next business day can be opened.';
    }

    return null;
  }

  bool get _canOpenDay => _openDayBlockedMessage == null;

  // ===========================================================================
  // INITIAL DATA LOADING
  // ===========================================================================

  Future<void> _load({
    String? date,
    bool showLoading = true,
    bool allowCacheFallback = true,
  }) async {
    final targetDate = date ?? _date;

    if (showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final data = await _api.getBranchOperation(
        session: widget.session,
        branchId: widget.session.branchId,
        date: targetDate,
      );

      var agents = <Map<String, dynamic>>[];

      if (widget.session.hasPermission('operation.float.manage') ||
          widget.session.hasPermission('operation.float.return') ||
          widget.session.hasPermission('operation.close')) {
        try {
          agents = await _api.listBranchAgents(
            session: widget.session,
            date: targetDate,
          );
        } catch (_) {
          agents = const [];
        }
      }

      if (!mounted) {
        return;
      }

      unawaited(_cacheBranchOperationSnapshot(targetDate, data, agents));

      setState(() {
        _date = targetDate;
        _data = data;
        _agents = agents;
        _error = null;
        _notice = null;
        _loading = false;
        _showingCachedData = false;
      });

      unawaited(_loadManagementData());
    } catch (error) {
      final message = friendlyErrorMessage(error);

      if (isAccountAccessBlockedMessage(message)) {
        await _handleAccountBlocked(message);

        return;
      }

      final cached = allowCacheFallback
          ? await _readCachedBranchOperation(targetDate)
          : null;
      if (cached != null) {
        if (!mounted) {
          return;
        }

        setState(() {
          _date = targetDate;
          _data = cached.data;
          _agents = cached.agents;
          _loading = false;
          _error = null;
          _showingCachedData = true;
          _notice =
              'Could not refresh online data. Showing last synced branch data.';
        });

        unawaited(_loadManagementData());
        unawaited(_refreshFreshDataInBackground());
        return;
      }

      if (!mounted) {
        return;
      }

      if (showLoading) {
        setState(() {
          _error = message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _startLiveStores() async {
    try {
      await Future.wait([
        ApplicationsLiveStore.instance.start(widget.session),
        RepaymentsLiveStore.instance.start(widget.session),
      ]);
    } catch (_) {
      // Management data continues
      // loading independently.
    }
  }

  Future<void> _loadManagementData() async {
    final session = widget.session;
    final cached = await _readManagementCache();

    var customers = cached.customers ?? _customers;
    var loans = cached.loans ?? _loans;
    var repayments = cached.repayments ?? _repayments;
    var reports = cached.reports ?? _reports;
    var shortages = cached.shortages ?? _shortages;
    var summary = cached.summary ?? _collectionSummary;

    Future<T?> optional<T>(Future<T> Function() loader) async {
      try {
        return await loader();
      } catch (_) {
        return null;
      }
    }

    final results = await Future.wait<Object?>([
      if (session.hasPermission('customer.read'))
        optional(() => _api.listCustomers(session))
      else
        Future<Object?>.value(null),

      if (session.hasPermission('loan.read'))
        optional(() => _api.listLoans(session))
      else
        Future<Object?>.value(null),

      if (session.hasPermission('collection.read'))
        optional(() => _api.listRepayments(session))
      else
        Future<Object?>.value(null),

      if (session.hasPermission('collection.read'))
        optional(() => _api.getCollectionSummary(session))
      else
        Future<Object?>.value(null),

      if (session.hasPermission('operation.read'))
        optional(
          () => _api.listOperationReports(
            session: session,
            branchId: session.branchId,
          ),
        )
      else
        Future<Object?>.value(null),

      optional(
        () => _api.listCashShortages(
          session: session,
          branchId: session.branchId,
        ),
      ),
    ]);

    if (results[0] is List) {
      customers = (results[0] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    }

    if (results[1] is List) {
      loans = (results[1] as List).whereType<Map<String, dynamic>>().toList();
    }

    if (results[2] is List) {
      repayments = (results[2] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    }

    if (results[3] is Map<String, dynamic>) {
      summary = results[3] as Map<String, dynamic>;
    }

    if (results[4] is List) {
      reports = (results[4] as List).whereType<Map<String, dynamic>>().toList();
    }

    if (results[5] is List) {
      shortages = (results[5] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    }

    if (!mounted) {
      return;
    }

    unawaited(
      _cacheManagementData(
        customers: customers,
        loans: loans,
        repayments: repayments,
        reports: reports,
        shortages: shortages,
        summary: summary,
      ),
    );

    setState(() {
      _customers = customers;
      _loans = loans;
      _repayments = repayments;
      _collectionSummary = summary;
      _reports = reports;
      _shortages = shortages;
    });
  }

  String _managerCacheKey(String name, {String? date}) {
    final scopeDate = date == null ? '' : '.$date';
    return 'manager.$_cacheTenantId.$_cacheBranchId$scopeDate.$name';
  }

  Future<void> _cacheBranchOperationSnapshot(
    String date,
    Map<String, dynamic> data,
    List<Map<String, dynamic>> agents,
  ) async {
    try {
      await _offlineCache.putJson(_managerCacheKey('operation', date: date), {
        'data': data,
        'agents': agents,
      });
    } catch (_) {
      // Keep the live workspace flow even if cache persistence fails.
    }
  }

  Future<_BranchOperationSnapshot?> _readCachedBranchOperation(
    String date,
  ) async {
    final payload = await _offlineCache.getPayload(
      _managerCacheKey('operation', date: date),
    );
    final map = _mapPayload(payload);
    final data = _mapPayload(map?['data']);
    if (data == null) {
      return null;
    }

    return _BranchOperationSnapshot(
      data: data,
      agents: _mapListPayload(map?['agents']) ?? const [],
    );
  }

  Future<void> _cacheManagementData({
    required List<Map<String, dynamic>> customers,
    required List<Map<String, dynamic>> loans,
    required List<Map<String, dynamic>> repayments,
    required List<Map<String, dynamic>> reports,
    required List<Map<String, dynamic>> shortages,
    required Map<String, dynamic>? summary,
  }) async {
    try {
      await _offlineCache.putJson(_managerCacheKey('customers'), customers);
      await _offlineCache.putJson(_managerCacheKey('loans'), loans);
      await _offlineCache.putJson(_managerCacheKey('repayments'), repayments);
      await _offlineCache.putJson(_managerCacheKey('reports'), reports);
      await _offlineCache.putJson(_managerCacheKey('shortages'), shortages);
      if (summary != null) {
        await _offlineCache.putJson(_managerCacheKey('summary'), summary);
      }
    } catch (_) {
      // A failed cache write must not overwrite the previously working copy.
    }
  }

  Future<_ManagementSnapshot> _readManagementCache() async {
    final payloads = await Future.wait<Object?>([
      _offlineCache.getPayload(_managerCacheKey('customers')),
      _offlineCache.getPayload(_managerCacheKey('loans')),
      _offlineCache.getPayload(_managerCacheKey('repayments')),
      _offlineCache.getPayload(_managerCacheKey('reports')),
      _offlineCache.getPayload(_managerCacheKey('shortages')),
      _offlineCache.getPayload(_managerCacheKey('summary')),
    ]);

    return _ManagementSnapshot(
      customers: _mapListPayload(payloads[0]),
      loans: _mapListPayload(payloads[1]),
      repayments: _mapListPayload(payloads[2]),
      reports: _mapListPayload(payloads[3]),
      shortages: _mapListPayload(payloads[4]),
      summary: _mapPayload(payloads[5]),
    );
  }

  // ===========================================================================
  // SESSION
  // ===========================================================================

  Future<void> _handleSessionCleared() async {
    if (!mounted) {
      return;
    }

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _handleAccountBlocked(String message) async {
    await clearTenantScopedClientState();
    await _store.clear();

    if (!mounted) {
      return;
    }

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => AccountLockedScreen(message: message)),
      (_) => false,
    );
  }

  Future<void> _signOut() async {
    await clearTenantScopedClientState();
    await _store.clear();

    if (!mounted) {
      return;
    }

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  // ===========================================================================
  // FEATURE NAVIGATION
  // ===========================================================================

  Future<void> _openExpenses() async {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    final operation = _operation;

    if (operation == null) {
      setState(() {
        _error = 'Today’s branch operation is not available.';
      });

      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ExpensesScreen(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          operation: operation,
          dayOpen: _dayOpen,
        ),
      ),
    );

    if (changed == true && mounted) {
      await _load();
    }
  }

  Future<void> _openAgentPositions() async {
    final operation = _operation;

    if (operation == null) {
      setState(() {
        _error = 'Today’s branch operation is not available.';
      });

      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AgentPositionsScreen(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          agents: _agents,
          operation: operation,
          dayOpen: _dayOpen,
        ),
      ),
    );

    if (changed == true) {
      await _load();
    }
  }

  // ===========================================================================
  // WORKSPACE NAVIGATION
  // ===========================================================================

  void _openTab(int index, {bool searchAutofocus = false}) {
    unawaited(_activity.touch());

    setState(() {
      _index = index;

      _searchAutofocus = searchAutofocus;

      if (searchAutofocus) {
        _searchFocusToken += 1;
      }
    });
  }

  void _openRecords({
    RecordsSection section = RecordsSection.repayments,
    RecordsFilter filter = RecordsFilter.all,
  }) {
    setState(() {
      _recordsSection = section;
      _recordsFilter = filter;
    });

    _openTab(2);
  }

  // ignore: unused_element
  void _openFieldTools() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AgentShell(session: widget.session)),
    );
  }

  Future<void> _openAgents() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => AgentsScreen(session: widget.session)),
    );

    if (!mounted) {
      return;
    }

    await _load();
  }

  Future<void> _openNewCustomer() async {
    final created = await Navigator.of(context, rootNavigator: true).push<bool>(
      MaterialPageRoute(
        builder: (_) => RegisterCustomerScreen(session: widget.session),
      ),
    );

    if (!mounted) {
      return;
    }

    if (created == true) {
      _setNotice('Borrower saved.');

      await _loadManagementData();
    }
  }

  Future<void> _openNewLoan() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NewLoanApplicationScreen(session: widget.session),
      ),
    );

    await _startLiveStores();
    await _loadManagementData();
  }

  Future<void> _openDayReconciliation() async {
    final operation = _operation;

    if (operation == null) {
      return;
    }

    final operationDate = _string(operation['operationDate']) ?? _date;

    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => DayReconciliationScreen(
          session: widget.session,
          branchId: widget.session.branchId,
          date: operationDate,
        ),
      ),
    );

    if (result != null) {
      final nextDate = _string(result['date']) ?? _todayLabel();

      _setNotice('Report sent. Next day is open.');

      await _load(date: nextDate);
    } else {
      // The manager may have updated
      // the count and saved the draft.
      await _load(date: operationDate);
    }
  }

  Future<void> _openReportsList() async {
    await _loadManagementData();

    if (!mounted) {
      return;
    }

    if (_reports.isEmpty) {
      _setNotice('No daily reports found for this branch yet.');

      return;
    }

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            _ReportsListScreen(session: widget.session, reports: _reports),
      ),
    );
  }

  Future<void> _openShortagesList() async {
    await _loadManagementData();

    if (!mounted) {
      return;
    }

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ShortagesScreen(
          session: widget.session,
          branchId: widget.session.branchId,
        ),
      ),
    );

    await _loadManagementData();
  }

  void _openBranchDetails() {
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => _BranchDetailsScreen(
          session: widget.session,
          branch: _branch,
          operation: _operation,
        ),
      ),
    );
  }

  // ===========================================================================
  // HOME MODELS
  // ===========================================================================

  List<AttentionItem> _buildAttentionItems() {
    final items = <AttentionItem>[];

    final overdueLoans = _loans.where(_loanNeedsAttention).length;

    if (overdueLoans > 0) {
      items.add(
        AttentionItem(
          icon: Icons.warning_outlined,
          iconColor: warmGold,
          title: 'Overdue loans',
          subtitle:
              '$overdueLoans loan'
              '${overdueLoans == 1 ? '' : 's'} '
              'need'
              '${overdueLoans == 1 ? 's' : ''} '
              'attention',
          count: '$overdueLoans',
          onTap: () {
            _openRecords(
              section: RecordsSection.applications,
              filter: RecordsFilter.all,
            );
          },
        ),
      );
    }

    final openShortages = _shortages.where(_shortageOpen).length;

    if (openShortages > 0) {
      items.add(
        AttentionItem(
          icon: Icons.report_problem_outlined,
          iconColor: const Color(0xFFB42318),
          title: 'Unreconciled shortages',
          subtitle:
              '$openShortages shortage'
              '${openShortages == 1 ? '' : 's'} '
              'pending',
          count: '$openShortages',
          onTap: () => _openTab(4),
        ),
      );
    }

    final reportsToSend = _reports.where(_reportNeedsManagerSubmission).length;

    if (reportsToSend > 0 || _reportNeedsManagerSubmission(_report)) {
      items.add(
        AttentionItem(
          icon: Icons.receipt_long_outlined,
          iconColor: warmGold,
          title: 'Close report needs sending',
          subtitle: 'Review and submit the daily report',
          onTap: () => _openTab(1),
        ),
      );
    }

    return items;
  }

  List<ActivityItem> _buildRecentActivities() {
    final entries = <_HomeActivityEntry>[];

    for (final repayment in _operationRows('repayments')) {
      final borrower =
          _string(repayment['borrowerName']) ??
          _string(repayment['clientName']) ??
          'Borrower';

      final occurredAt = _dateFromFields(repayment, const [
        'paidAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _HomeActivityEntry(
          occurredAt: occurredAt,
          item: ActivityItem(
            initials: _getInitials(borrower),
            initialsBackgroundColor: forestEmerald.withValues(alpha: 0.12),
            name: borrower,
            activityType: 'Repayment',
            time: operationTime(occurredAt),
            amount: _num(repayment['amount']).round(),
            isIncome: true,
          ),
        ),
      );
    }

    for (final loan in _operationRows('loansIssued')) {
      final borrower =
          _string(loan['borrowerName']) ??
          _string(loan['clientName']) ??
          'Borrower';

      final occurredAt = _dateFromFields(loan, const [
        'issuedAt',
        'disbursedAt',
        'submittedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _HomeActivityEntry(
          occurredAt: occurredAt,
          item: ActivityItem(
            initials: _getInitials(borrower),
            initialsBackgroundColor: const Color(0xFFEAF0FF),
            name: borrower,
            activityType: 'Loan issued',
            time: operationTime(occurredAt),
            amount: _firstAvailableMoney(loan, const [
              'principalAmount',
              'principal',
            ]).round(),
            isIncome: true,
          ),
        ),
      );
    }

    for (final expense in _operationRows('expenses')) {
      final occurredAt = _dateFromFields(expense, const [
        'incurredAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _HomeActivityEntry(
          occurredAt: occurredAt,
          item: ActivityItem(
            initials: 'EX',
            initialsBackgroundColor: const Color(0xFFFFF1E5),
            name:
                _string(expense['description']) ??
                _label(_string(expense['category']) ?? 'Expense'),
            activityType: 'Expense',
            time: operationTime(occurredAt),
            amount: _num(expense['amount']).round(),
            isIncome: false,
          ),
        ),
      );
    }

    for (final topUp in _operationRows('topUps')) {
      final occurredAt = _dateFromFields(topUp, const [
        'addedAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _HomeActivityEntry(
          occurredAt: occurredAt,
          item: ActivityItem(
            initials: 'CA',
            initialsBackgroundColor: const Color(0xFFEAF5ED),
            name: 'Branch cash',
            activityType: 'Capital received',
            time: operationTime(occurredAt),
            amount: _num(topUp['amount']).round(),
            isIncome: true,
          ),
        ),
      );
    }

    if (entries.isEmpty) {
      for (final repayment in _rowsForDay(
        _repayments,
        _loadedOperationDate,
        const ['paidAt', 'recordedAt', 'createdAt'],
      )) {
        final borrower =
            _string(repayment['borrowerName']) ??
            _string(repayment['clientName']) ??
            'Borrower';

        final occurredAt = _dateFromFields(repayment, const [
          'paidAt',
          'recordedAt',
          'createdAt',
        ]);

        if (occurredAt == null) {
          continue;
        }

        entries.add(
          _HomeActivityEntry(
            occurredAt: occurredAt,
            item: ActivityItem(
              initials: _getInitials(borrower),
              initialsBackgroundColor: forestEmerald.withValues(alpha: 0.12),
              name: borrower,
              activityType: 'Repayment',
              time: operationTime(occurredAt),
              amount: _num(repayment['amount']).round(),
              isIncome: true,
            ),
          ),
        );
      }
    }

    entries.sort((a, b) => b.occurredAt.compareTo(a.occurredAt));

    return entries.take(5).map((entry) => entry.item).toList(growable: false);
  }

  List<Map<String, dynamic>> _operationRows(String key) {
    return _mapListPayload(_operation?[key]) ?? const [];
  }

  List<Map<String, dynamic>> _rowsForDay(
    Iterable<Map<String, dynamic>> rows,
    DateTime day,
    List<String> dateKeys,
  ) {
    return rows
        .where((row) {
          final date = _dateFromFields(row, dateKeys);

          return date != null && _isSameDay(date, day);
        })
        .toList(growable: false);
  }

  int _borrowersDueForDate(DateTime day) {
    final borrowerIds = <String>{};

    for (final loan in _loans) {
      if (!_loanIsActive(loan)) {
        continue;
      }

      final nextDue = _dateFromFields(loan, const ['nextDueDate']);

      if (nextDue == null || !_isSameDay(nextDue, day)) {
        continue;
      }

      borrowerIds.add(
        _string(loan['customerId']) ??
            _string(loan['borrowerName']) ??
            _string(loan['id']) ??
            'borrower-${borrowerIds.length}',
      );
    }

    return borrowerIds.length;
  }

  String _getInitials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();

    if (parts.isEmpty) {
      return 'A';
    }

    if (parts.length == 1) {
      final value = parts.first;

      return value.substring(0, value.length.clamp(0, 2)).toUpperCase();
    }

    return '${parts.first[0]}'
            '${parts.last[0]}'
        .toUpperCase();
  }

  // ===========================================================================
  // OPERATIONS VIEW MODELS
  // ===========================================================================

  OperationDashboardData? _buildOperationDashboardData() {
    final operation = _operation;

    if (operation == null) {
      return null;
    }

    final positions = _buildAgentFloatPositions();

    final floatWithAgents = positions.fold<num>(
      0,
      (sum, position) => sum + position.remainingFloat,
    );

    return OperationDashboardData(
      status: _string(operation['status']) ?? 'OPEN',

      operationDate:
          DateTime.tryParse(_string(operation['operationDate']) ?? '') ??
          DateTime.now(),

      openingCash: _firstAvailableMoney(operation, const [
        'openingBalance',
        'openingCash',
      ]),

      capitalReceived: _firstAvailableMoney(operation, const [
        'cashAddedToday',
        'topUpsTotal',
        'capitalReceived',
        'capitalReceivedTotal',
      ]),

      collections: _firstAvailableMoney(operation, const [
        'collectionsReceived',
        'collectionsTotal',
      ]),

      processingFees: _firstAvailableMoney(operation, const [
        'processingFeesTotal',
        'processingFeesReceived',
        'applicationFeesCollected',
        'feesCollected',
      ]),

      expenses: _firstAvailableMoney(operation, const [
        'expensesTotal',
        'expenses',
      ]),

      floatWithAgents: floatWithAgents,

      expectedClosingCash: _firstAvailableMoney(operation, const [
        'expectedClosingBalance',
        'expectedClosingCash',
      ]),

      openedBy:
          _string(operation['openedByName']) ??
          _string(operation['openedByUserName']) ??
          _string(operation['openedBy']) ??
          widget.session.userName,

      openedAt: DateTime.tryParse(
        _string(operation['openedAt']) ?? _string(operation['createdAt']) ?? '',
      ),
    );
  }

  List<AgentFloatPosition> _buildAgentFloatPositions() {
    return _agents.map((agent) {
      return AgentFloatPosition(
        id: _string(agent['id']) ?? '',
        name: _string(agent['name']) ?? 'Agent',
        remainingFloat: _firstAvailableMoney(agent, const [
          'floatRemaining',
          'remainingFloat',
          'floatToday',
        ]),
      );
    }).toList();
  }

  List<OperationActivity> _buildOperationActivities() {
    final entries = <_OperationActivityEntry>[];

    for (final repayment in _operationRows('repayments')) {
      final occurredAt = _dateFromFields(repayment, const [
        'paidAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OperationActivityEntry(
          occurredAt: occurredAt,
          item: OperationActivity(
            title: 'Repayment collected',
            description:
                _string(repayment['borrowerName']) ??
                _string(repayment['clientName']) ??
                'Borrower',
            time: operationTime(occurredAt),
            amount: _num(repayment['amount']),
            isIncome: true,
          ),
        ),
      );
    }

    for (final loan in _operationRows('loansIssued')) {
      final occurredAt = _dateFromFields(loan, const [
        'issuedAt',
        'disbursedAt',
        'submittedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OperationActivityEntry(
          occurredAt: occurredAt,
          item: OperationActivity(
            title: 'Loan issued',
            description:
                _string(loan['borrowerName']) ??
                _string(loan['clientName']) ??
                'Borrower',
            time: operationTime(occurredAt),
            amount: _firstAvailableMoney(loan, const [
              'principalAmount',
              'principal',
            ]),
            isIncome: false,
          ),
        ),
      );
    }

    for (final expense in _operationRows('expenses')) {
      final occurredAt = _dateFromFields(expense, const [
        'incurredAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OperationActivityEntry(
          occurredAt: occurredAt,
          item: OperationActivity(
            title: 'Expense recorded',
            description:
                _string(expense['description']) ??
                _label(_string(expense['category']) ?? 'Expense'),
            time: operationTime(occurredAt),
            amount: _num(expense['amount']),
            isIncome: false,
          ),
        ),
      );
    }

    for (final topUp in _operationRows('topUps')) {
      final occurredAt = _dateFromFields(topUp, const [
        'addedAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OperationActivityEntry(
          occurredAt: occurredAt,
          item: OperationActivity(
            title: 'Capital received',
            description: _string(topUp['description']) ?? 'Branch cash',
            time: operationTime(occurredAt),
            amount: _num(topUp['amount']),
            isIncome: true,
          ),
        ),
      );
    }

    if (entries.isEmpty) {
      for (final repayment in _rowsForDay(
        _repayments,
        _loadedOperationDate,
        const ['paidAt', 'recordedAt', 'createdAt'],
      )) {
        final occurredAt = _dateFromFields(repayment, const [
          'paidAt',
          'recordedAt',
          'createdAt',
        ]);

        if (occurredAt == null) {
          continue;
        }

        entries.add(
          _OperationActivityEntry(
            occurredAt: occurredAt,
            item: OperationActivity(
              title: 'Repayment collected',
              description:
                  _string(repayment['borrowerName']) ??
                  _string(repayment['clientName']) ??
                  'Borrower',
              time: operationTime(occurredAt),
              amount: _num(repayment['amount']),
              isIncome: true,
            ),
          ),
        );
      }
    }

    entries.sort((a, b) => b.occurredAt.compareTo(a.occurredAt));

    return entries.take(5).map((entry) => entry.item).toList(growable: false);
  }

  // ===========================================================================
  // OPERATION COMMANDS
  // ===========================================================================

  Future<void> _runSave(Future<void> Function() action) async {
    if (_saving) {
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });

    try {
      await action();
      await _load();
    } catch (error) {
      final message = friendlyErrorMessage(error);

      if (isAccountAccessBlockedMessage(message)) {
        await _handleAccountBlocked(message);

        return;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _error = message;
      });

      throw ApiException(message);
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  void _setNotice(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _notice = message;
    });
  }

  void _setError(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _error = message;
      _notice = null;
    });
  }

  void _runIfBranchCanMutate(VoidCallback action) {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);
      return;
    }

    action();
  }

  Future<void> _reviewPendingClosure() async {
    final operationDate = _string(_pendingClosure?['operationDate']);

    if (operationDate == null) {
      return;
    }

    _setNotice(
      'Close this day and send its report. '
      'Today opens after that.',
    );

    await _load(date: operationDate);

    if (!mounted ||
        !widget.session.hasPermission('operation.close') ||
        !_dayActive) {
      return;
    }

    await _openDayReconciliation();
  }

  Future<void> _sendAwaitingReport() async {
    final operationDate = _string(_awaitingReport?['operationDate']);

    if (operationDate == null) {
      return;
    }

    await _load(date: operationDate);

    if (!mounted) {
      return;
    }

    await _submitCloseReport(returnToToday: true);
  }

  Future<void> _submitCloseReport({bool returnToToday = false}) async {
    final reportId = _string(_report?['id']);

    if (reportId == null) {
      setState(() {
        _error = 'Close report is not ready yet.';
      });

      return;
    }

    if (_saving) {
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });

    try {
      final response = await _api.managerConfirmOperationReport(
        session: widget.session,
        reportId: reportId,
      );

      final nextDate =
          _string(response['date']) ?? (returnToToday ? _todayLabel() : _date);

      _setNotice('Report sent. Next day is open.');

      await _load(date: nextDate);
    } catch (error) {
      final message = friendlyErrorMessage(error);

      if (isAccountAccessBlockedMessage(message)) {
        await _handleAccountBlocked(message);

        return;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _error = message;
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  // ===========================================================================
  // OPERATION SHEETS
  //
  // Still temporary.
  // These should later move into the operations feature.
  // ===========================================================================

  Future<void> _showOpenDaySheet() async {
    final blockedMessage = _openDayBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    final opening = TextEditingController(
      text: _moneyText(_num(_data?['openingBalance'])),
    );

    final cashAdded = TextEditingController();

    final notes = TextEditingController();

    await _showFormSheet(
      title: 'Open day',
      actionLabel: 'Open Day',
      builder: (_) => [
        _AmountField(controller: opening, label: 'Opening cash'),
        const SizedBox(height: 10),
        _AmountField(controller: cashAdded, label: 'Cash added'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final openingAmount = _parseAmount(opening.text);

        final cashAddedAmount = _parseAmount(cashAdded.text) ?? 0;

        if (openingAmount == null || openingAmount < 0) {
          throw ApiException('Enter opening cash.');
        }

        await _api.openBranchOperation(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          openingBalance: openingAmount,
          cashAddedToday: cashAddedAmount,
          notes: notes.text,
        );

        _setNotice('Day opened.');
      },
    );
  }

  Future<void> _showTopUpSheet() async {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    final amount = TextEditingController();

    final description = TextEditingController();

    await _showFormSheet(
      title: 'Receive capital',
      actionLabel: 'Save',
      builder: (_) => [
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: description, label: 'Reason', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);

        if (value == null || value <= 0) {
          throw ApiException('Enter the amount.');
        }

        await _api.recordBranchTopUp(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          amount: value,
          description: description.text,
        );

        _setNotice('Capital received.');
      },
    );
  }

  // ignore: unused_element
  Future<void> _showExpenseSheet() async {
    final amount = TextEditingController();

    final description = TextEditingController();

    var category = 'TRANSPORT';

    await _showFormSheet(
      title: 'Record expense',
      actionLabel: 'Save',
      builder: (setModalState) => [
        DropdownButtonFormField<String>(
          initialValue: category,
          items: expenseCategories.map((item) {
            return DropdownMenuItem<String>(
              value: item,
              child: Text(_label(item)),
            );
          }).toList(),
          onChanged: (value) {
            if (value == null) {
              return;
            }

            setModalState(() {
              category = value;
            });
          },
          decoration: const InputDecoration(labelText: 'Category'),
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: description, label: 'Details', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);

        if (value == null || value <= 0) {
          throw ApiException('Enter the amount.');
        }

        await _api.recordBranchExpense(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          category: category,
          amount: value,
          description: description.text,
        );

        _setNotice('Expense saved.');
      },
    );
  }

  Future<void> _showFloatSheet({required bool addMore}) async {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    if (_agents.isEmpty) {
      setState(() {
        _error = 'No agents found.';
      });

      return;
    }

    final amount = TextEditingController();

    final notes = TextEditingController();

    var agentId = _string(_agents.first['id']) ?? '';

    await _showFormSheet(
      title: addMore ? 'Add float' : 'Allocate float',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _AgentPicker(
          agents: _agents,
          value: agentId,
          onChanged: (value) {
            setModalState(() {
              agentId = value;
            });
          },
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);

        if (agentId.isEmpty) {
          throw ApiException('Choose an agent.');
        }

        if (value == null || value <= 0) {
          throw ApiException('Enter amount.');
        }

        await _api.recordAgentFloat(
          session: widget.session,
          agentId: agentId,
          date: _date,
          amount: value,
          notes: notes.text,
          addMore: addMore,
        );

        _setNotice(addMore ? 'Float added.' : 'Float allocated.');
      },
    );
  }

  // ignore: unused_element
  Future<void> _showReturnSheet() async {
    if (_agents.isEmpty) {
      setState(() {
        _error = 'No agents found.';
      });

      return;
    }

    final amount = TextEditingController();

    final notes = TextEditingController();

    var agentId = _string(_agents.first['id']) ?? '';

    await _showFormSheet(
      title: 'Agent return',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _AgentPicker(
          agents: _agents,
          value: agentId,
          onChanged: (value) {
            setModalState(() {
              agentId = value;
            });
          },
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Cash returned'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);

        if (agentId.isEmpty) {
          throw ApiException('Choose an agent.');
        }

        if (value == null || value < 0) {
          throw ApiException('Enter amount.');
        }

        await _api.recordAgentReturn(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          agentId: agentId,
          amountReturned: value,
          notes: notes.text,
        );

        _setNotice('Return saved.');
      },
    );
  }

  Future<void> _showFormSheet({
    required String title,
    required String actionLabel,
    required List<Widget> Function(StateSetter setModalState) builder,
    required Future<void> Function() onSubmit,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        var localError = '';

        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _saving
                              ? null
                              : () {
                                  Navigator.of(context).pop();
                                },
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    ...builder(setModalState),

                    if (localError.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _Banner(message: localError, tone: _BannerTone.error),
                    ],

                    const SizedBox(height: 14),

                    FilledButton(
                      onPressed: _saving
                          ? null
                          : () async {
                              setModalState(() {
                                localError = '';
                              });

                              try {
                                await _runSave(onSubmit);

                                if (context.mounted) {
                                  Navigator.of(context).pop();
                                }
                              } catch (error) {
                                setModalState(() {
                                  localError = friendlyErrorMessage(error);
                                });
                              }
                            },
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(actionLabel),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

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
                branchName: _branchName,
                roleName: widget.session.roleName ?? 'Team',
                loading: _loading,
                onRefresh: _load,
                onSignOut: _signOut,
              ),

              if (_notice != null)
                _Banner(message: _notice!, tone: _BannerTone.success),

              if (_error != null)
                _Banner(message: _error!, tone: _BannerTone.error),

              Expanded(
                child: _loading && _data == null
                    ? const Center(
                        child: CircularProgressIndicator(color: forestEmerald),
                      )
                    : IndexedStack(
                        index: _index,
                        children: [
                          _buildHomeTab(),
                          _buildOperationsTab(),
                          _buildRecordsTab(),
                          _buildClientsTab(),
                          _buildMoreTab(),
                        ],
                      ),
              ),
            ],
          ),
        ),

        bottomNavigationBar: WorkspaceBottomNavigation(
          selectedIndex: _index,
          onChanged: (index) {
            _openTab(index, searchAutofocus: index == 3);
          },
        ),
      ),
    );
  }

  // ===========================================================================
  // TAB BUILDERS
  // ===========================================================================

  Widget _buildHomeTab() {
    final operation = _operation;

    final loadedDate = _loadedOperationDate;

    final operationLoansIssued = _operationRows('loansIssued');

    final loansIssuedForDay = operationLoansIssued.isNotEmpty
        ? operationLoansIssued
        : _rowsForDay(_loans, loadedDate, const [
            'disbursedAt',
            'issuedAt',
            'submittedAt',
            'createdAt',
          ]);

    final newBorrowersForDay = _rowsForDay(_customers, loadedDate, const [
      'createdAt',
    ]);

    final operationLoansIssuedAmount = _num(operation?['loansIssuedPrincipal']);

    final collectedForDay = operation == null
        ? (_loadedOperationDateIsToday
              ? _num(_collectionSummary?['amountCollectedToday']).round()
              : 0)
        : _num(operation['collectionsReceived']).round();

    final loansIssuedCount = operation == null
        ? loansIssuedForDay.length
        : _num(operation['loansIssuedCount']).round();

    final amountIssuedForDay = operationLoansIssuedAmount > 0
        ? operationLoansIssuedAmount.round()
        : _sumMoney(
            loansIssuedForDay,
            operationLoansIssued.isNotEmpty ? 'principalAmount' : 'principal',
          ).round();

    final borrowersDueForDay = _loadedOperationDateIsToday
        ? _num(_collectionSummary?['dueTodayCount']).round()
        : _borrowersDueForDate(loadedDate);

    return ManagerOwnerHomeTab(
      session: widget.session,

      onOpenProfile: _signOut,

      onOpenSearch: () {
        _openTab(3, searchAutofocus: true);
      },

      onOpenRecords: _openRecords,

      onOpenNewLoan: widget.session.hasPermission('loan.create')
          ? () {
              _runIfBranchCanMutate(() {
                unawaited(_openNewLoan());
              });
            }
          : () {},

      onOpenNewBorrower: widget.session.hasPermission('customer.create')
          ? () {
              _runIfBranchCanMutate(() {
                unawaited(_openNewCustomer());
              });
            }
          : () {},

      onOpenDailyOps: () => _openTab(1),

      onOpenRecordRepayment: () {
        _runIfBranchCanMutate(() {
          _openRecords(
            section: RecordsSection.repayments,
            filter: RecordsFilter.all,
          );
        });
      },

      onOpenFindClient: () {
        _openTab(3, searchAutofocus: true);
      },

      summaryPeriodLabel: _homeSummaryPeriodLabel,

      collectedMetricLabel: 'Collected $_homeMetricSuffix',

      loansIssuedMetricLabel: 'Loans issued $_homeMetricSuffix',

      borrowersDueMetricLabel: 'Borrowers due $_homeMetricSuffix',

      collectedToday: collectedForDay,

      expensesToday: _num(_operation?['expensesTotal']).round(),

      shortagesAmount: _sumMoney(
        _shortages.where(_shortageOpen),
        'amountOutstanding',
      ).round(),

      expectedClosingCash: _num(_operation?['expectedClosingBalance']).round(),

      loansIssuedToday: loansIssuedCount,

      amountIssuedToday: amountIssuedForDay,

      overdueLoansCount: _loans.where(_loanNeedsAttention).length,

      activeLoansCount: _loans.where(_loanIsActive).length,

      borrowersDueToday: borrowersDueForDay,

      newBorrowersToday: newBorrowersForDay.length,

      overdueBorrowersCount: _customers
          .where((customer) => customer['hasOverdueLoan'] == true)
          .length,

      activeBorrowersCount: _customers
          .where((customer) => _num(customer['activeLoanCount']) > 0)
          .length,

      attentionItems: _buildAttentionItems(),

      recentActivities: _buildRecentActivities(),
    );
  }

  Widget _buildOperationsTab() {
    return OperationsTab(
      session: widget.session,

      operation: _buildOperationDashboardData(),

      agents: _buildAgentFloatPositions(),

      activities: _buildOperationActivities(),

      dayOpen: _dayOpen,

      dayActive: _dayActive,

      canOpenDay: _canOpenDay,

      canRecordCashMovements: _operationMutationBlockedMessage == null,

      onRefresh: _load,

      onOpenDay: _showOpenDaySheet,

      onReceiveCapital: _showTopUpSheet,

      onRecordExpense: () {
        unawaited(_openExpenses());
      },

      onAllocateFloat: () {
        unawaited(_showFloatSheet(addMore: false));
      },

      onCloseDay: () {
        unawaited(_openDayReconciliation());
      },

      onViewActivity: () {
        _openRecords(
          section: RecordsSection.repayments,
          filter: RecordsFilter.all,
        );
      },

      pendingClosureMessage: _pendingClosure == null
          ? null
          : '${_dateLabel(_pendingClosure?['operationDate'])} '
                'has activity that must be closed before today can open.',

      awaitingReportMessage: _awaitingReport == null
          ? null
          : '${_dateLabel(_awaitingReport?['operationDate'])} '
                'is closed. Send its report before today can open.',

      openDayBlockedMessage: _openDayBlockedMessage,

      operationReadOnlyMessage: _operationMutationBlockedMessage,

      onPendingClosure: _pendingClosure == null
          ? null
          : () {
              unawaited(_reviewPendingClosure());
            },

      onSendAwaitingReport: _awaitingReport == null
          ? null
          : () {
              unawaited(_sendAwaitingReport());
            },

      onOpenAgentPositions:
          widget.session.hasPermission('operation.float.manage')
          ? () {
              unawaited(_openAgentPositions());
            }
          : null,
    );
  }

  Widget _buildRecordsTab() {
    return RecordsTab(
      session: widget.session,
      section: _recordsSection,
      filter: _recordsFilter,

      onSectionChanged: (section) {
        unawaited(_activity.touch());

        setState(() {
          _recordsSection = section;
        });
      },

      onFilterChanged: (filter) {
        unawaited(_activity.touch());

        setState(() {
          _recordsFilter = filter;
        });
      },
    );
  }

  Widget _buildClientsTab() {
    return SearchTab(
      autofocus: _searchAutofocus,
      focusToken: _searchFocusToken,
    );
  }

  Widget _buildMoreTab() {
    return MoreTab(
      onAgentsTap: () {
        unawaited(_openAgents());
      },

      onSalariesTap: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => SalariesScreen(
              session: widget.session,
              branchId: widget.session.branchId,
            ),
          ),
        );
      },

      onShortagesTap: () {
        unawaited(_openShortagesList());
      },

      onReportsTap: () {
        unawaited(_openReportsList());
      },

      onBranchTap: () {
        _openBranchDetails();
      },

      onSubscriptionTap: () {
        _setNotice('Subscription management is handled on the web dashboard.');
      },

      onSettingsTap: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => AgentProfileScreen(session: widget.session),
          ),
        );
      },

      onSupportTap: () {
        _setNotice('Contact ANTIKRA support from the web dashboard.');
      },
    );
  }
}

class _ReportsListScreen extends StatelessWidget {
  const _ReportsListScreen({required this.session, required this.reports});

  final RembehSession session;
  final List<Map<String, dynamic>> reports;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Daily reports'),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        itemCount: reports.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final report = reports[index];
          final reportId = _string(report['id']);
          final status = _string(report['status']) ?? 'MANAGER_REVIEW';

          return _MoreDataTile(
            icon: Icons.description_outlined,
            title: _string(report['reportNumber']) ?? 'Report ${index + 1}',
            subtitle:
                '${_dateLabel(report['operationDate'])} • '
                '${_label(status)}',
            trailing: _moneyOrDash(
              report['closingBalance'] ?? report['expectedClosingBalance'],
            ),
            tone: _reportStatusColor(status),
            onTap: reportId == null
                ? null
                : () {
                    Navigator.of(context).push<void>(
                      MaterialPageRoute(
                        builder: (_) => DailyReportScreen(
                          session: session,
                          reportId: reportId,
                        ),
                      ),
                    );
                  },
          );
        },
      ),
    );
  }
}

class _BranchDetailsScreen extends StatelessWidget {
  const _BranchDetailsScreen({
    required this.session,
    required this.branch,
    required this.operation,
  });

  final RembehSession session;
  final Map<String, dynamic>? branch;
  final Map<String, dynamic>? operation;

  @override
  Widget build(BuildContext context) {
    final branchName =
        _string(branch?['name']) ?? session.branchName ?? 'Branch';
    final branchAddress =
        _string(branch?['address']) ?? session.branchAddress ?? 'Not set';
    final status = _string(operation?['status']) ?? 'No active day';

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Branch details'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusLg),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  branchName,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  session.workspaceName,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 14),
                _BranchInfoRow(label: 'Address', value: branchAddress),
                _BranchInfoRow(label: 'Manager', value: session.userName),
                _BranchInfoRow(
                  label: 'Role',
                  value: session.roleName ?? 'Team',
                ),
                _BranchInfoRow(label: 'Today status', value: _label(status)),
                _BranchInfoRow(
                  label: 'Expected closing cash',
                  value: _moneyOrDash(operation?['expectedClosingBalance']),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BranchInfoRow extends StatelessWidget {
  const _BranchInfoRow({required this.label, required this.value});

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
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MoreDataTile extends StatelessWidget {
  const _MoreDataTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.tone,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String trailing;
  final Color tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: rembehBorderRadius(rembehRadiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(icon, color: tone, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                trailing,
                style: TextStyle(
                  color: tone,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 5),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: slateText,
                  size: 20,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

Color _reportStatusColor(String status) {
  switch (status.toUpperCase()) {
    case 'SENT_TO_OWNER':
    case 'OWNER_APPROVED':
      return forestEmerald;
    case 'RETURNED_TO_MANAGER':
      return const Color(0xFFB42318);
    default:
      return warmGold;
  }
}

// =============================================================================
// TEMPORARY OPERATION FORM COMPONENTS
//
// These are unrelated to More.
// They remain here until the operations refactor.
// =============================================================================
// =============================================================================
// TEMPORARY OPERATION FORM COMPONENTS
//
// These are unrelated to More.
// They remain here until the operations refactor.
// =============================================================================

class _AmountField extends StatelessWidget {
  const _AmountField({required this.controller, required this.label});

  final TextEditingController controller;

  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label, prefixText: 'UGX '),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    this.maxLines = 1,
  });

  final TextEditingController controller;

  final String label;

  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      decoration: InputDecoration(labelText: label),
    );
  }
}

class _AgentPicker extends StatelessWidget {
  const _AgentPicker({
    required this.agents,
    required this.value,
    required this.onChanged,
  });

  final List<Map<String, dynamic>> agents;

  final String value;

  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value.isEmpty ? null : value,

      items: agents.map((agent) {
        return DropdownMenuItem<String>(
          value: _string(agent['id']) ?? '',
          child: Text(_string(agent['name']) ?? 'Agent'),
        );
      }).toList(),

      onChanged: (value) {
        if (value == null) {
          return;
        }

        onChanged(value);
      },

      decoration: const InputDecoration(labelText: 'Agent'),
    );
  }
}

// =============================================================================
// BANNERS
// =============================================================================

enum _BannerTone { success, error }

class _Banner extends StatelessWidget {
  const _Banner({required this.message, required this.tone});

  final String message;
  final _BannerTone tone;

  @override
  Widget build(BuildContext context) {
    final isError = tone == _BannerTone.error;

    final color = isError ? const Color(0xFFB42318) : forestEmerald;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.22)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

class _BranchOperationSnapshot {
  const _BranchOperationSnapshot({required this.data, required this.agents});

  final Map<String, dynamic> data;
  final List<Map<String, dynamic>> agents;
}

class _ManagementSnapshot {
  const _ManagementSnapshot({
    this.customers,
    this.loans,
    this.repayments,
    this.reports,
    this.shortages,
    this.summary,
  });

  final List<Map<String, dynamic>>? customers;
  final List<Map<String, dynamic>>? loans;
  final List<Map<String, dynamic>>? repayments;
  final List<Map<String, dynamic>>? reports;
  final List<Map<String, dynamic>>? shortages;
  final Map<String, dynamic>? summary;
}

class _HomeActivityEntry {
  const _HomeActivityEntry({required this.occurredAt, required this.item});

  final DateTime occurredAt;
  final ActivityItem item;
}

class _OperationActivityEntry {
  const _OperationActivityEntry({required this.occurredAt, required this.item});

  final DateTime occurredAt;
  final OperationActivity item;
}

Map<String, dynamic>? _mapPayload(Object? value) {
  if (value is! Map) {
    return null;
  }

  return value.map((key, item) => MapEntry(key.toString(), item));
}

List<Map<String, dynamic>>? _mapListPayload(Object? value) {
  if (value is! List) {
    return null;
  }

  return value.whereType<Map>().map((item) {
    return item.map((key, entry) => MapEntry(key.toString(), entry));
  }).toList();
}

String _todayLabel() {
  final now = DateTime.now();

  return _dateKey(now);
}

String _dateKey(DateTime value) {
  final local = value.toLocal();

  final month = local.month.toString().padLeft(2, '0');

  final day = local.day.toString().padLeft(2, '0');

  return '${local.year}-$month-$day';
}

String _nextDateKey(String dateKey) {
  final date = DateTime.tryParse(dateKey);

  if (date == null) {
    return dateKey;
  }

  return _dateKey(date.add(const Duration(days: 1)));
}

bool _isOperationOpenableDate(String dateKey) {
  final today = _todayLabel();

  return dateKey == today || dateKey == _nextDateKey(today);
}

String _shortDateLabel(DateTime value) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  final local = value.toLocal();

  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

DateTime? _dateFromFields(Map<String, dynamic> row, List<String> keys) {
  for (final key in keys) {
    final raw = _string(row[key]);

    if (raw == null) {
      continue;
    }

    final parsed = DateTime.tryParse(raw);

    if (parsed != null) {
      return parsed.toLocal();
    }
  }

  return null;
}

String _moneyText(num amount) {
  if (amount == 0) {
    return '';
  }

  return amount.round().toString();
}

num? _parseAmount(String value) {
  final cleaned = value.replaceAll(',', '').trim();

  if (cleaned.isEmpty) {
    return null;
  }

  return num.tryParse(cleaned);
}

num _num(Object? value) {
  if (value is num) {
    return value;
  }

  if (value is String) {
    return num.tryParse(value) ?? 0;
  }

  return 0;
}

String? _string(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return null;
}

String _label(String value) {
  final words = value.toLowerCase().split('_');

  return words
      .map((word) {
        if (word.isEmpty) {
          return word;
        }

        return '${word[0].toUpperCase()}'
            '${word.substring(1)}';
      })
      .join(' ');
}

bool _reportNeedsManagerSubmission(Map<String, dynamic>? report) {
  final status = _string(report?['status']);

  return status == 'MANAGER_REVIEW' || status == 'RETURNED_TO_MANAGER';
}

bool _loanIsActive(Map<String, dynamic> loan) {
  final status = (_string(loan['status']) ?? '').toUpperCase();

  return !{
    'CLOSED',
    'WRITTEN_OFF',
    'REJECTED',
    'DRAFT',
    'CANCELLED',
  }.contains(status);
}

bool _loanNeedsAttention(Map<String, dynamic> loan) {
  final overdueDays = _num(loan['overdueDays']);

  final nextDue = _string(loan['nextDueLabel']);

  return overdueDays > 0 || nextDue?.toLowerCase().contains('overdue') == true;
}

bool _shortageOpen(Map<String, dynamic> row) {
  final status = (_string(row['status']) ?? '').toUpperCase();

  return status != 'CLEARED';
}

num _sumMoney(Iterable<Map<String, dynamic>> rows, String key) {
  return rows.fold<num>(0, (sum, row) => sum + _num(row[key]));
}

String _dateLabel(Object? value) {
  final raw = _string(value);

  if (raw == null) {
    return 'The previous day';
  }

  final parsed = DateTime.tryParse(raw);

  if (parsed == null) {
    return raw;
  }

  return formatActivityTime(parsed, DateTime.now()).split(',').first;
}

String _moneyOrDash(Object? value) {
  if (value == null) {
    return '-';
  }

  return 'UGX ${formatMoney(_num(value))}';
}

bool _isSameDay(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

num _firstAvailableMoney(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final value = data[key];

    if (value != null) {
      return _num(value);
    }
  }

  return 0;
}
