import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../core/network/realtime_client.dart';
import '../core/sync/sync_service.dart';
import '../features/applications_list/data/applications_live_store.dart';
import '../features/more/presentation/screens/more_tab.dart';
import '../features/operations/domain/models/agent_float_position.dart';
import '../features/operations/domain/models/operation_activity.dart';
import '../features/operations/domain/models/operation_dashboard_data.dart';
import '../features/operations/domain/utils/operation_formatters.dart';
import '../features/operations/presentation/screens/agent_positions_screen.dart';
import '../features/operations/presentation/screens/banking_screen.dart';
import '../features/operations/presentation/screens/day_reconciliation_screen.dart';
import '../features/operations/presentation/screens/expenses_screen.dart';
import '../features/operations/presentation/screens/operations_tab.dart';
import '../features/operations/presentation/report/screens/daily_report_screen.dart';
import '../features/operations/presentation/report/screens/returned_report_screen.dart';
import '../features/operations/presentation/report/pdf/daily_report_pdf_cache.dart';
import '../features/marketing/data/mobile_marketing_campaign_store.dart';
import '../features/marketing/domain/models/mobile_marketing_campaign.dart';
import '../features/marketing/presentation/marketing_campaign_actions.dart';
import '../features/marketing/presentation/sheets/mobile_marketing_campaign_sheet.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../features/salaries/presentation/screens/salaries_screen.dart';
import '../features/shortages/data/mappers/cash_shortage_mapper.dart';
import '../features/shortages/data/shortages_list_cache.dart';
import '../features/shortages/presentation/screens/shortages_screen.dart';
import '../features/workspace/presentation/widgets/branch_header.dart';
import '../features/workspace/presentation/widgets/sign_out_confirm_dialog.dart';
import '../features/workspace/presentation/widgets/workspace_bottom_navigation.dart';
import '../features/agents/presentation/screens/agents_screen.dart';
import '../models/field_records.dart';
import '../models/pending_disbursement.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/network_status_store.dart';
import '../services/offline_cache_store.dart';
import '../services/session_activity.dart';
import '../services/session_cleanup.dart';
import '../services/session_store.dart';
import '../services/app_update_watcher.dart';
import '../services/billing_payment_celebration_watcher.dart';
import '../services/update_prompt.dart';
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
import 'pending_disbursements_screen.dart';
import 'repayment_corrections_screen.dart';
import 'records/records_tab.dart';
import 'search/search_tab.dart';
import 'profile/agent_profile_screen.dart';
import 'subscription/subscription_screen.dart';
import 'voided_clients_screen.dart';
import 'edit_records_screen.dart';

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
  late final MobileMarketingCampaignStore _marketingStore =
      MobileMarketingCampaignStore(api: _api);
  late final SyncService _syncService = SyncService(
    AuthService(sessionStore: _store),
    rembehApiBaseUrl,
  );

  late final SessionActivityController _activity;

  Map<String, dynamic>? _data;
  Map<String, dynamic>? _collectionSummary;
  MobileMarketingCampaign? _marketingCampaign;

  List<Map<String, dynamic>> _agents = const [];
  List<Map<String, dynamic>> _customers = const [];
  List<Map<String, dynamic>> _loans = const [];
  List<Map<String, dynamic>> _repayments = const [];
  List<Map<String, dynamic>> _reports = const [];
  List<Map<String, dynamic>> _shortages = const [];
  List<PendingDisbursement> _pendingDisbursements = const [];

  bool _loading = true;
  bool _saving = false;
  bool _showingCachedData = false;
  bool _backgroundRefreshing = false;
  bool _listeningOperationEvents = false;
  bool _openingReports = false;
  bool _openingShortages = false;
  String? _activeReturnedCorrectionReportId;
  String? _submittedReportId;
  String? _submittedReportDate;
  bool _submittedReportWasReturned = false;

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
      onResumed: () async {
        if (!mounted) return;
        await _refreshWorkspacePermissions();
        if (!mounted) return;
        await promptAppUpdateIfNeeded(context);
        unawaited(_loadMarketingCampaign());
      },
    );

    _activity.start();
    AppUpdateWatcher.instance.start(
      session: widget.session,
      contextFinder: () => context,
    );
    BillingPaymentCelebrationWatcher.instance.start(
      session: widget.session,
      contextFinder: () => context,
    );
    _network.addListener(_onNetworkChanged);

    unawaited(_network.start());
    unawaited(_refreshWorkspacePermissions());
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
    _stopOperationLiveEvents();
    AppUpdateWatcher.instance.stop();
    BillingPaymentCelebrationWatcher.instance.stop();
    _activity.dispose();
    _syncService.dispose();
    super.dispose();
  }

  void _onNetworkChanged() {
    if (_network.isOnline) {
      unawaited(_refreshFreshDataInBackground());
    }
  }

  Future<void> _refreshWorkspacePermissions() async {
    if (!await _network.checkNow()) return;
    try {
      final refreshed = await _api.refreshCurrentProfile(widget.session);
      if (!mounted) return;
      final current = widget.session.permissions;
      if (_sameStringSet(current, refreshed.permissions)) return;
      setState(() {
        current
          ..clear()
          ..addAll(refreshed.permissions);
      });
    } catch (_) {
      // Permission refresh must not block cached/offline workspace access.
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

  bool get _loadedReportReturned {
    if ((_string(_report?['status']) ?? '').toUpperCase() ==
        'RETURNED_TO_MANAGER') {
      return true;
    }
    return _reports.any(
      (report) =>
          (_string(report['status']) ?? '').toUpperCase() ==
              'RETURNED_TO_MANAGER' &&
          _dateKey(
                DateTime.tryParse(_string(report['operationDate']) ?? '') ??
                    DateTime(1900),
              ) ==
              _loadedOperationDateKey,
    );
  }

  bool get _loadedReportEditable {
    final status = (_string(_report?['status']) ?? '').toUpperCase();
    if (status == 'RETURNED_TO_MANAGER' || status == 'MANAGER_REVIEW') {
      return true;
    }
    return _reports.any((report) {
      final reportStatus = (_string(report['status']) ?? '').toUpperCase();
      return (reportStatus == 'RETURNED_TO_MANAGER' ||
              reportStatus == 'MANAGER_REVIEW') &&
          _string(report['id']) == _activeReturnedCorrectionReportId;
    });
  }

  bool get _dayWritable => _dayOpen || _returnedReportCorrectionMode;

  bool get _returnedReportCorrectionMode =>
      _index == 1 &&
      _activeReturnedCorrectionReportId != null &&
      _loadedReportEditable;

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

      unawaited(_loadMarketingCampaign());
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

        unawaited(_loadMarketingCampaign(onlineOnly: false));
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
      await RealtimeClient.instance.connect(widget.session);
      _startOperationLiveEvents();
    } catch (_) {
      // Management data continues
      // loading independently.
    }
  }

  void _startOperationLiveEvents() {
    if (_listeningOperationEvents) {
      return;
    }
    _listeningOperationEvents = true;
    final client = RealtimeClient.instance;
    client
      ..on('operation.expense_recorded', _onOperationLiveEvent)
      ..on('operation.expense_updated', _onOperationLiveEvent)
      ..on('operation.expense_voided', _onOperationLiveEvent)
      ..on('operation.cash_topup_recorded', _onOperationLiveEvent)
      ..on('operation.float_updated', _onOperationLiveEvent)
      ..on('operation.float_returned', _onOperationLiveEvent)
      ..on('shortage.updated', _onShortageLiveEvent);
  }

  void _stopOperationLiveEvents() {
    if (!_listeningOperationEvents) {
      return;
    }
    final client = RealtimeClient.instance;
    client
      ..off('operation.expense_recorded', _onOperationLiveEvent)
      ..off('operation.expense_updated', _onOperationLiveEvent)
      ..off('operation.expense_voided', _onOperationLiveEvent)
      ..off('operation.cash_topup_recorded', _onOperationLiveEvent)
      ..off('operation.float_updated', _onOperationLiveEvent)
      ..off('operation.float_returned', _onOperationLiveEvent)
      ..off('shortage.updated', _onShortageLiveEvent);
    _listeningOperationEvents = false;
  }

  void _onShortageLiveEvent(Map<String, dynamic> payload) {
    final payloadTenant = payload['tenantId'] as String?;
    final payloadBranch = payload['branchId'] as String?;
    if (payloadTenant != null && payloadTenant != widget.session.tenantId) {
      return;
    }
    if (payloadBranch != null &&
        widget.session.branchId != null &&
        payloadBranch != widget.session.branchId) {
      return;
    }
    unawaited(_refreshShortagesQuietly());
  }

  void _onOperationLiveEvent(Map<String, dynamic> payload) {
    final payloadTenant = payload['tenantId'] as String?;
    final payloadBranch = payload['branchId'] as String?;
    final payloadDate = payload['operationDate'] as String?;
    if (payloadTenant != null && payloadTenant != widget.session.tenantId) {
      return;
    }
    if (payloadBranch != null &&
        widget.session.branchId != null &&
        payloadBranch != widget.session.branchId) {
      return;
    }
    if (payloadDate != null && payloadDate != _date) {
      return;
    }
    unawaited(
      _load(date: _date, showLoading: false, allowCacheFallback: false),
    );
  }

  Future<void> _loadManagementData() async {
    final session = widget.session;
    final cached = await _readManagementCache();

    var customers = cached.customers ?? _customers;
    var loans = cached.loans ?? _loans;
    var repayments = cached.repayments ?? _repayments;
    var reports = cached.reports ?? _reports;
    var shortages = cached.shortages ?? _shortages;
    var pendingDisbursements =
        cached.pendingDisbursements ?? _pendingDisbursements;
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

      if (session.hasPermission('loan.read'))
        optional(() => _api.listPendingDisbursements(session))
      else
        Future<Object?>.value(null),
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
      reports = _reportListSummaries(results[4] as List);
    }

    if (results[5] is List) {
      shortages = (results[5] as List)
          .whereType<Map<String, dynamic>>()
          .toList();
    }

    if (results[6] is PendingDisbursementsResponse) {
      pendingDisbursements = (results[6] as PendingDisbursementsResponse).items;
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
        pendingDisbursements: pendingDisbursements,
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
      _pendingDisbursements = pendingDisbursements;
    });
  }

  Future<void> _loadMarketingCampaign({bool onlineOnly = true}) async {
    final cached = await _marketingStore.readCached(widget.session);
    if (!onlineOnly && cached != null && mounted) {
      setState(() {
        _marketingCampaign = cached;
      });
    }

    try {
      final campaign = await _marketingStore.fetchLatest(widget.session);
      if (!mounted) return;
      setState(() {
        _marketingCampaign = campaign;
      });
    } catch (_) {
      if (cached != null && mounted) {
        setState(() {
          _marketingCampaign = cached;
        });
      }
    }
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
    required List<PendingDisbursement> pendingDisbursements,
    required Map<String, dynamic>? summary,
  }) async {
    try {
      await _offlineCache.putJson(_managerCacheKey('customers'), customers);
      await _offlineCache.putJson(_managerCacheKey('loans'), loans);
      await _offlineCache.putJson(_managerCacheKey('repayments'), repayments);
      await _offlineCache.putJson(_managerCacheKey('reports'), reports);
      await _offlineCache.putJson(_managerCacheKey('shortages'), shortages);
      await ShortagesListCache.instance.write(
        ShortagesListCache.key(
          tenantId: (widget.session.tenantId ?? 'tenant').trim(),
          branchId: (widget.session.branchId ?? '').trim(),
        ),
        shortages,
      );
      await _offlineCache.putJson(
        _managerCacheKey('pendingDisbursements'),
        pendingDisbursements.map(_pendingDisbursementToJson).toList(),
      );
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
      _offlineCache.getPayload(_managerCacheKey('pendingDisbursements')),
      _offlineCache.getPayload(_managerCacheKey('summary')),
    ]);

    return _ManagementSnapshot(
      customers: _mapListPayload(payloads[0]),
      loans: _mapListPayload(payloads[1]),
      repayments: _mapListPayload(payloads[2]),
      reports: _reportListSummaries(_mapListPayload(payloads[3])),
      shortages: _mapListPayload(payloads[4]),
      pendingDisbursements: (_mapListPayload(payloads[5]) ?? const [])
          .map(PendingDisbursement.fromJson)
          .toList(growable: false),
      summary: _mapPayload(payloads[6]),
    );
  }

  void _openMarketingCampaign() {
    final campaign = _marketingCampaign;
    if (campaign == null) return;
    unawaited(
      showMobileMarketingCampaignSheet(
        context,
        campaign,
        onInternalRoute: _navigateMarketingRoute,
      ),
    );
  }

  Future<void> _dismissMarketingCampaign() async {
    final campaign = _marketingCampaign;
    if (campaign == null) return;
    await _marketingStore.dismiss(campaign);
    if (!mounted) return;
    setState(() {
      _marketingCampaign = null;
    });
  }

  void _handleMarketingCta() {
    final campaign = _marketingCampaign;
    if (campaign == null) return;
    unawaited(
      handleMarketingCampaignCta(
        context: context,
        campaign: campaign,
        onInternalRoute: _navigateMarketingRoute,
      ),
    );
  }

  void _navigateMarketingRoute(String routeKey) {
    switch (routeKey) {
      case 'home':
        _openTab(0);
        break;
      case 'ops':
        _openTab(1);
        break;
      case 'records':
        _openTab(2);
        break;
      case 'clients':
        _openTab(3);
        break;
      case 'more':
        _openTab(4);
        break;
      case 'subscription':
        _openSubscription();
        break;
      case 'subscription_sms':
        _openSubscription(SubscriptionTab.sms);
        break;
      case 'subscription_plan':
        _openSubscription(SubscriptionTab.plan);
        break;
      case 'corrections':
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => RepaymentCorrectionsScreen(session: widget.session),
          ),
        );
        break;
      case 'reports':
        unawaited(_openReportsList());
        break;
      case 'profile':
      case 'settings':
        _openProfile();
        break;
    }
  }

  void _openSubscription([SubscriptionTab initialTab = SubscriptionTab.plan]) {
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        settings: const RouteSettings(name: SubscriptionScreen.routeName),
        builder: (_) =>
            SubscriptionScreen(session: widget.session, initialTab: initialTab),
      ),
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
    final confirmed = await showSignOutConfirmDialog(context);
    if (!confirmed || !mounted) return;

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

  void _openProfile() {
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => AgentProfileScreen(session: widget.session),
      ),
    );
  }

  // ===========================================================================
  // FEATURE NAVIGATION
  // ===========================================================================

  Future<String?> _chooseOperationTarget(String _) async {
    // The selected Operations workspace is the accounting context. In
    // returned-report correction mode this is the returned business date;
    // otherwise it is the currently loaded business day.
    return _date;
  }

  Future<void> _openExpenses() async {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    final targetDate = await _chooseOperationTarget('expense');
    if (targetDate == null || !mounted) return;

    Map<String, dynamic>? targetData;
    try {
      targetData = targetDate == _date
          ? _data
          : await _api.getBranchOperation(
              session: widget.session,
              branchId: widget.session.branchId,
              date: targetDate,
            );
    } catch (error) {
      _setError(friendlyErrorMessage(error));
      return;
    }
    final operation = targetData?['operation'] as Map<String, dynamic>?;

    if (operation == null) {
      setState(() {
        _error = 'Today’s branch operation is not available.';
      });

      return;
    }
    if (!mounted) return;

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ExpensesScreen(
          session: widget.session,
          branchId: widget.session.branchId,
          date: targetDate,
          operation: operation,
          dayOpen:
              (_string(operation['status']) ?? '').toUpperCase() == 'OPEN' ||
              (_string(
                            (targetData?['report']
                                as Map<String, dynamic>?)?['status'],
                          ) ??
                          '')
                      .toUpperCase() ==
                  'RETURNED_TO_MANAGER',
        ),
      ),
    );

    if (changed == true && mounted) {
      await _load();
    }
  }

  Future<void> _openAgentPositions() async {
    if (_showingCachedData) {
      setState(() {
        _error =
            'Connect to the internet and refresh before balancing staff. Cached figures can disagree with the server.';
      });
      return;
    }

    // Always load live branch day figures before balancing.
    await _load(date: _date, showLoading: true, allowCacheFallback: false);
    if (!mounted) return;

    final operation = _operation;

    if (operation == null) {
      setState(() {
        _error =
            _error ??
            'Today’s branch operation is not available. Check your connection and try again.';
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
      await _load(date: _date, allowCacheFallback: false);
    }
  }

  Future<void> _openAgentPosition(AgentFloatPosition position) async {
    if (_showingCachedData) {
      setState(() {
        _error =
            'Connect to the internet and refresh before balancing staff. Cached figures can disagree with the server.';
      });
      return;
    }

    await _load(date: _date, showLoading: true, allowCacheFallback: false);
    if (!mounted) return;

    final operation = _operation;

    if (operation == null) {
      setState(() {
        _error =
            _error ??
            'Today’s branch operation is not available. Check your connection and try again.';
      });

      return;
    }

    final agent = _agentMapForPosition(position);
    final agentPosition = _positionForAgent(position.id);

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AgentPositionDetailScreen(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          operation: operation,
          agent: agent,
          position: agentPosition,
          dayOpen: _dayOpen,
          onAllocateFloat: agentPosition == null && _dayOpen
              ? () =>
                    _showFloatSheet(addMore: false, initialAgentId: position.id)
              : null,
          onAddFloat:
              agentPosition != null &&
                  agentPosition['amountReturned'] == null &&
                  _dayOpen
              ? () =>
                    _showFloatSheet(addMore: true, initialAgentId: position.id)
              : null,
        ),
      ),
    );

    if (changed == true) {
      await _load(date: _date, allowCacheFallback: false);
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
    if (_showingCachedData) {
      setState(() {
        _error =
            'Connect to the internet and refresh before closing the day. Cached figures can disagree with the server.';
      });
      return;
    }

    await _load(date: _date, showLoading: true, allowCacheFallback: false);
    if (!mounted) return;

    final operation = _operation;

    if (operation == null) {
      setState(() {
        _error =
            _error ??
            'Today’s branch operation is not available. Check your connection and try again.';
      });
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

      await _load(date: nextDate, allowCacheFallback: false);
    } else {
      // The manager may have updated
      // the count and saved the draft.
      await _load(date: operationDate, allowCacheFallback: false);
    }
  }

  Future<void> _openReturnedReport(Map<String, dynamic> report) async {
    final reportId = _string(report['id']);
    final operationDate = _string(report['operationDate']);
    if (reportId == null || operationDate == null) return;

    await const DailyReportPdfCache().invalidate(reportId);

    if (!mounted) return;

    if (_loadedOperationDateKey != operationDate || !_loadedReportReturned) {
      await _load(date: operationDate, allowCacheFallback: false);
      if (!mounted) return;
    }

    if (!mounted) return;
    setState(() {
      _activeReturnedCorrectionReportId = reportId;
      _index = 1;
      _notice = null;
      _error = null;
    });
  }

  Future<void> _confirmReturnedReportCorrection(
    Map<String, dynamic> report,
  ) async {
    final operationDate = _string(report['operationDate']);
    if (operationDate == null || !mounted) return;

    final isToday =
        _dateKey(DateTime.tryParse(operationDate) ?? DateTime(1900)) ==
        _dateKey(DateTime.now());
    final dateLabel = _dateLabel(operationDate);

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        const gold = Color(0xFFC98A00);
        return Container(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD4D9E2),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 28),
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  color: Color(0xFFFFF3D8),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.assignment_return_outlined,
                  color: gold,
                  size: 38,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                isToday ? 'Update returned report' : 'Review returned report',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                dateLabel,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 30),
              if (isToday)
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'This report is for today.\nNew activity since submission will be included, along with your changes.',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 16,
                      height: 1.55,
                    ),
                  ),
                )
              else ...[
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'You’re opening an earlier day for correction.',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 16,
                      height: 1.45,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 13,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E8),
                    border: Border.all(color: const Color(0xFFF2D58B)),
                    borderRadius: rembehBorderRadius(rembehRadiusMd),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, color: gold, size: 22),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Changes apply to $dateLabel only',
                          style: const TextStyle(
                            color: Color(0xFF8A5B00),
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Today’s operations stay separate.\nOriginal kept in history.',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 15,
                      height: 1.65,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 28),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(sheetContext).pop(false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.of(sheetContext).pop(true),
                      style: FilledButton.styleFrom(
                        backgroundColor: gold,
                        minimumSize: const Size.fromHeight(50),
                      ),
                      child: Text(
                        isToday ? 'Review updated report' : 'Open report',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );

    if (confirmed == true) {
      await _openReturnedReport(report);
    }
  }

  Future<void> _reviewCorrectedReturnedReport() async {
    final report = _reports.cast<Map<String, dynamic>?>().firstWhere(
      (item) =>
          item != null &&
          (_string(item['status']) ?? '').toUpperCase() ==
              'RETURNED_TO_MANAGER' &&
          _dateKey(
                DateTime.tryParse(_string(item['operationDate']) ?? '') ??
                    DateTime(1900),
              ) ==
              _loadedOperationDateKey,
      orElse: () => _report,
    );
    final reportId = _string(report?['id']);
    if (reportId == null || !mounted) {
      _setError('The returned report could not be loaded. Refresh and retry.');
      return;
    }

    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ReturnedReportScreen(
          session: widget.session,
          reportId: reportId,
          listPayload: report!,
          previewOnly: true,
        ),
      ),
    );
  }

  Future<void> _sendCorrectedReturnedReport() async {
    final reportId = _activeReturnedCorrectionReportId;
    if (reportId == null || _saving || !mounted) return;
    final confirmed = await _confirmReportSubmission();
    if (confirmed != true || !mounted) return;

    // Let the modal route and its semantics tree detach completely before the
    // correction workspace changes its bottom action state. Rebuilding both
    // trees during the reverse transition triggers Flutter's parentDataDirty
    // assertion on some Android and iOS versions.
    await Future<void>.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;

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

      final submission = response['reportSubmission'];
      final operationDate = submission is Map
          ? _string(submission['operationDate'])
          : _loadedOperationDateKey;
      setState(() {
        _activeReturnedCorrectionReportId = null;
        _submittedReportId = reportId;
        _submittedReportDate = operationDate;
        _submittedReportWasReturned = true;
        _index = 1;
      });
      await _load(date: _todayLabel(), allowCacheFallback: false);
      if (!mounted) return;
      _showReportUndo(reportId, wasReturned: true);
      unawaited(_refreshReportsQuietly());
    } catch (error) {
      if (!mounted) return;
      _setError(friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool?> _confirmReportSubmission() {
    const gold = Color(0xFFB97800);
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD3D7DD),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: const BoxDecoration(
                      color: Color(0xFFFFE9C8),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.send_rounded,
                      color: gold,
                      size: 30,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Submit report?',
                          style: TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
                            color: midnightNavy,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _dateLabel(_loadedOperationDateKey),
                          style: const TextStyle(
                            fontSize: 15,
                            color: slateText,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              const Padding(
                padding: EdgeInsets.only(left: 74),
                child: Text(
                  'No more transactions can be recorded once the report is submitted.',
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.45,
                    color: slateText,
                  ),
                ),
              ),
              const SizedBox(height: 26),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(sheetContext, false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => Navigator.pop(sheetContext, true),
                      style: FilledButton.styleFrom(
                        backgroundColor: forestEmerald,
                      ),
                      icon: const Icon(Icons.send_rounded),
                      label: const Text('Send report'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showReportUndo(String reportId, {required bool wasReturned}) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(36, 0, 36, 78),
        backgroundColor: const Color(0xFF075B31),
        content: Text(wasReturned ? 'Report resubmitted' : 'Report sent'),
        action: SnackBarAction(
          label: 'UNDO',
          textColor: const Color(0xFFB9F6D2),
          onPressed: () => unawaited(_undoReportSubmission(reportId)),
        ),
      ),
    );
  }

  Future<void> _undoReportSubmission(String reportId) async {
    try {
      final response = await _api.undoManagerConfirmOperationReport(
        session: widget.session,
        reportId: reportId,
      );
      if (!mounted) return;
      setState(() {
        _submittedReportId = null;
        _submittedReportDate = null;
        _submittedReportWasReturned = false;
        _activeReturnedCorrectionReportId = reportId;
        _index = 1;
      });
      final date = _string(response['date']) ?? _loadedOperationDateKey;
      await _load(date: date, allowCacheFallback: false);
      _setNotice('Report submission undone. You can continue editing.');
    } catch (error) {
      if (mounted) _setError(friendlyErrorMessage(error));
    }
  }

  Future<void> _exitReturnedReportCorrection() async {
    setState(() {
      _activeReturnedCorrectionReportId = null;
      _index = 1;
    });
    await _load(date: _todayLabel(), allowCacheFallback: false);
  }

  Future<void> _viewSubmittedReport() async {
    final reportId = _submittedReportId;
    if (reportId == null || !mounted) return;
    final payload = _reports.cast<Map<String, dynamic>?>().firstWhere(
      (item) => _string(item?['id']) == reportId,
      orElse: () => null,
    );
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ReturnedReportScreen(
          session: widget.session,
          reportId: reportId,
          listPayload: payload,
          previewOnly: true,
        ),
      ),
    );
  }

  Future<void> _openReportsList() async {
    if (_openingReports) {
      return;
    }
    _openingReports = true;

    try {
      // Open from cache immediately so managers are not blocked on a
      // full management refresh (customers, loans, repayments, etc.).
      var reports = List<Map<String, dynamic>>.from(_reports);
      if (reports.isEmpty) {
        final cached = await _readManagementCache();
        reports = List<Map<String, dynamic>>.from(cached.reports ?? const []);
        if (reports.isNotEmpty && mounted) {
          setState(() => _reports = reports);
        }
      }

      if (!mounted) {
        return;
      }

      if (reports.isEmpty) {
        // First open with no cache: fetch reports only, not the whole bundle.
        try {
          final fresh = await _api.listOperationReports(
            session: widget.session,
            branchId: widget.session.branchId,
          );
          reports = _reportListSummaries(fresh);
          if (mounted) {
            setState(() => _reports = reports);
          }
        } catch (_) {
          // Keep empty; show notice below.
        }
      }

      if (!mounted) {
        return;
      }

      if (reports.isEmpty) {
        _setNotice('No daily reports found for this branch yet.');
        return;
      }

      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _ReportsListScreen(
            session: widget.session,
            reports: reports,
            onOpenReturnedReport: _openReturnedReport,
          ),
        ),
      );

      // Refresh quietly after returning so the list stays current.
      unawaited(_refreshReportsQuietly());
    } finally {
      _openingReports = false;
    }
  }

  Future<void> _refreshReportsQuietly() async {
    if (!widget.session.hasPermission('operation.read')) {
      return;
    }
    try {
      final fresh = await _api.listOperationReports(
        session: widget.session,
        branchId: widget.session.branchId,
      );
      if (!mounted) {
        return;
      }
      final summaries = _reportListSummaries(fresh);
      // Drop stale PDF binaries for reports whose figures/status changed.
      for (final report in summaries) {
        final id = _string(report['id']);
        if (id == null) continue;
        unawaited(const DailyReportPdfCache().invalidate(id));
      }
      setState(() {
        _reports = summaries;
      });
    } catch (_) {
      // Keep the last good list.
    }
  }

  Future<void> _openShortagesList() async {
    if (_openingShortages) {
      return;
    }
    _openingShortages = true;

    try {
      // Open immediately — never block More → Shortages on the full
      // management refresh (customers, loans, repayments, reports…).
      var rows = List<Map<String, dynamic>>.from(_shortages);
      if (rows.isEmpty) {
        final cached = await _readManagementCache();
        rows = List<Map<String, dynamic>>.from(cached.shortages ?? const []);
        if (rows.isNotEmpty && mounted) {
          setState(() => _shortages = rows);
        }
      }

      if (rows.isEmpty) {
        final cacheKey = ShortagesListCache.key(
          tenantId: (widget.session.tenantId ?? 'tenant').trim(),
          branchId: (widget.session.branchId ?? '').trim(),
        );
        final disk = await ShortagesListCache.instance.read(cacheKey);
        if (disk != null && disk.isNotEmpty) {
          rows = List<Map<String, dynamic>>.from(disk);
        }
      }

      if (!mounted) {
        return;
      }

      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => ShortagesScreen(
            session: widget.session,
            branchId: widget.session.branchId,
            initialShortages: CashShortageMapper.listFromJson(rows),
          ),
        ),
      );

      // Quietly refresh home badge data after returning — shortages only.
      unawaited(_refreshShortagesQuietly());
    } finally {
      _openingShortages = false;
    }
  }

  Future<void> _refreshShortagesQuietly() async {
    try {
      final fresh = await _api.listCashShortages(
        session: widget.session,
        branchId: widget.session.branchId,
      );
      final cacheKey = ShortagesListCache.key(
        tenantId: (widget.session.tenantId ?? 'tenant').trim(),
        branchId: (widget.session.branchId ?? '').trim(),
      );
      await ShortagesListCache.instance.write(cacheKey, fresh);
      if (!mounted) {
        return;
      }
      setState(() {
        _shortages = fresh;
      });
    } catch (_) {
      // Keep the last good list.
    }
  }

  Future<void> _openPendingDisbursements() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PendingDisbursementsScreen(
          session: widget.session,
          initialItems: _pendingDisbursements,
        ),
      ),
    );

    if (mounted && changed == true) {
      await _loadManagementData();
    }
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

    if (_pendingDisbursements.isNotEmpty) {
      items.add(
        AttentionItem(
          icon: Icons.account_balance_wallet_outlined,
          iconColor: const Color(0xFFE11D2E),
          iconBackgroundColor: const Color(0xFFFFEAED),
          backgroundColor: const Color(0xFFFFEAED),
          borderColor: const Color(0xFFFFCAD1),
          title: 'Pending disbursements',
          subtitle:
              '${_pendingDisbursements.length} borrower'
              '${_pendingDisbursements.length == 1 ? '' : 's'} '
              'have not received their full loans',
          count: '${_pendingDisbursements.length}',
          onTap: () {
            unawaited(_openPendingDisbursements());
          },
        ),
      );
    }

    final overduePaidCount = _num(
      _collectionSummary?['overduePaidCount'],
    ).round();

    if (overduePaidCount > 0) {
      items.add(
        AttentionItem(
          icon: Icons.payments_outlined,
          iconColor: forestEmerald,
          iconBackgroundColor: sage,
          title: 'Overdue paid today',
          subtitle:
              '$overduePaidCount overdue borrower'
              '${overduePaidCount == 1 ? ' paid' : 's paid'} '
              'something today — follow up on the rest',
          count: '$overduePaidCount',
          onTap: () {
            _openRecords(
              section: RecordsSection.repayments,
              filter: RecordsFilter.overduePaid,
            );
          },
        ),
      );
    }

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
              section: RecordsSection.repayments,
              filter: RecordsFilter.dueToday,
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

    final reportsToSend = _reports
        .where(_reportNeedsManagerSubmission)
        .toList();
    final returnedReports = reportsToSend
        .where((report) => _string(report['status']) == 'RETURNED_TO_MANAGER')
        .toList();
    final closeReports = reportsToSend
        .where((report) => _string(report['status']) != 'RETURNED_TO_MANAGER')
        .toList();

    if (returnedReports.isNotEmpty) {
      items.add(
        AttentionItem(
          icon: Icons.assignment_return_outlined,
          iconColor: warmGold,
          title: returnedReports.length == 1
              ? 'Returned report needs review'
              : '${returnedReports.length} returned reports need review',
          subtitle: 'Re-check figures and resubmit to the owner',
          onTap: () {
            unawaited(_confirmReturnedReportCorrection(returnedReports.first));
          },
        ),
      );
    }

    if (closeReports.isNotEmpty ||
        (_reportNeedsManagerSubmission(_report) &&
            _string(_report?['status']) != 'RETURNED_TO_MANAGER')) {
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
            initials: _getInitials(
              _string(expense['recordedByName']) ??
                  _string(expense['agentName']) ??
                  'EX',
            ),
            initialsBackgroundColor: const Color(0xFFFFF1E5),
            name:
                _string(expense['recordedByName']) ??
                _string(expense['agentName']) ??
                'Expense',
            activityType:
                _string(expense['description'])?.trim().isNotEmpty == true
                ? 'Expense · ${_string(expense['description'])}'
                : 'Expense',
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
    final explicitLoansDisbursed = _firstAvailableMoney(operation, const [
      'loansIssuedPrincipal',
      'loansDisbursed',
      'loansDisbursedTotal',
      'amountDisbursed',
      'amountDisbursedTotal',
      'amountDisbursedToday',
      'loanDisbursementsTotal',
    ]);
    final loansDisbursed = explicitLoansDisbursed > 0
        ? explicitLoansDisbursed
        : _operationRows('loansIssued').fold<num>(
            0,
            (sum, row) =>
                sum +
                _firstAvailableMoney(row, const [
                  'amountDisbursed',
                  'principalAmount',
                  'amount',
                ]),
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

      shortageRecoveries: _firstAvailableMoney(operation, const [
        'shortageRecoveriesTotal',
        'shortageRecoveries',
      ]),

      loansDisbursed: loansDisbursed,

      expenses: _firstAvailableMoney(operation, const [
        'expensesTotal',
        'branchCashExpensesTotal',
        'expenses',
      ]),

      salaries: _firstAvailableMoney(operation, const [
        'salariesTotal',
        'salaries',
      ]),

      bankings: _firstAvailableMoney(operation, const [
        'bankingsTotal',
        'bankingTotal',
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
    final agentsById = <String, Map<String, dynamic>>{
      for (final agent in _agents)
        if ((_string(agent['id']) ?? '').isNotEmpty)
          _string(agent['id'])!: agent,
    };

    final positions = _operationRows('agentReturns')
        .map((position) {
          final id = _string(position['agentId']) ?? '';
          final agent = agentsById[id];

          return AgentFloatPosition(
            id: id,
            name:
                _string(position['agentName']) ??
                _string(agent?['name']) ??
                'Field Officer',
            phone: _string(position['agentPhone']) ?? _string(agent?['phone']),
            roleName:
                _string(position['agentRoleName']) ??
                _string(agent?['roleName']),
            photoUrl:
                _string(position['agentPhotoUrl']) ??
                _string(agent?['photoUrl']),
            publicId:
                _string(position['agentPublicId']) ??
                _string(agent?['publicId']),
            remainingFloat: _firstAvailableMoney(position, const [
              'unusedFloat',
              'remainingFloat',
            ]),
            floatAllocated: _firstAvailableMoney(position, const [
              'amountGiven',
              'floatRemaining',
            ]),
            loansIssued: _firstAvailableMoney(position, const [
              'amountDisbursed',
            ]),
            repaymentsCollected: _firstAvailableMoney(position, const [
              'amountCollected',
            ]),
            processingFees: _firstAvailableMoney(position, const [
              'processingFees',
            ]),
            expectedHandover: _firstAvailableMoney(position, const [
              'expectedReturn',
            ]),
            expensesTotal: _firstAvailableMoney(position, const [
              'expensesTotal',
            ]),
          );
        })
        .where((position) => position.id.isNotEmpty && position.isActiveToday);

    final fallback = _fieldOfficerAgents
        .where((agent) {
          final id = _string(agent['id']) ?? '';
          return id.isNotEmpty &&
              !_operationRows(
                'agentReturns',
              ).any((position) => _string(position['agentId']) == id) &&
              _firstAvailableMoney(agent, const [
                    'remainingFloatToday',
                    'floatRemaining',
                    'remainingFloat',
                    'floatToday',
                  ]) >
                  0;
        })
        .map((agent) {
          final remaining = _firstAvailableMoney(agent, const [
            'remainingFloatToday',
            'floatRemaining',
            'remainingFloat',
            'floatToday',
          ]);

          return AgentFloatPosition(
            id: _string(agent['id']) ?? '',
            name: _string(agent['name']) ?? 'Field Officer',
            phone: _string(agent['phone']),
            roleName: _string(agent['roleName']),
            photoUrl: _string(agent['photoUrl']),
            publicId: _string(agent['publicId']),
            remainingFloat: remaining,
            floatAllocated: _firstAvailableMoney(agent, const ['floatToday']),
            loansIssued: _firstAvailableMoney(agent, const [
              'amountDisbursedToday',
            ]),
            repaymentsCollected: _firstAvailableMoney(agent, const [
              'amountCollectedToday',
            ]),
            processingFees: 0,
            expectedHandover: remaining,
          );
        });

    return [...positions, ...fallback].toList(growable: false);
  }

  List<Map<String, dynamic>> get _fieldOfficerAgents {
    return _agents.where(_isFieldOfficerAgent).toList(growable: false);
  }

  bool _isFieldOfficerAgent(Map<String, dynamic> agent) {
    final role = (_string(agent['roleName']) ?? '').toLowerCase();

    if (role.contains('field officer')) {
      return true;
    }

    if (role == 'agent' || role.contains('loan officer')) {
      return true;
    }

    return false;
  }

  Map<String, dynamic>? _positionForAgent(String agentId) {
    for (final position in _operationRows('agentReturns')) {
      if (_string(position['agentId']) == agentId) {
        return position;
      }
    }

    return null;
  }

  /// True when this officer already has a float row for the day and has not
  /// returned cash — additional cash must use the top-up endpoint.
  bool _agentHasUnreturnedFloat(String agentId) {
    final position = _positionForAgent(agentId);
    if (position == null) {
      return false;
    }

    final floatId = _string(position['floatId']);
    if (floatId == null || floatId.isEmpty) {
      return false;
    }

    return position['amountReturned'] == null;
  }

  /// Field officers who can still receive float (first issue or top-up).
  List<Map<String, dynamic>> get _floatEligibleFieldOfficers {
    return _fieldOfficerAgents
        .where((agent) {
          final id = _string(agent['id']);
          if (id == null) {
            return false;
          }

          final position = _positionForAgent(id);
          if (position == null) {
            return true;
          }

          final floatId = _string(position['floatId']);
          if (floatId == null || floatId.isEmpty) {
            return true;
          }

          return position['amountReturned'] == null;
        })
        .toList(growable: false);
  }

  Map<String, dynamic> _agentMapForPosition(AgentFloatPosition position) {
    for (final agent in _agents) {
      if (_string(agent['id']) == position.id) {
        return agent;
      }
    }

    return {
      'id': position.id,
      'name': position.name,
      'phone': position.phone,
      'roleName': position.roleName ?? 'Field Officer',
      'photoUrl': position.photoUrl,
      'publicId': position.publicId,
    };
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
                [
                      _string(expense['description']) ?? 'Expense',
                      _string(expense['recordedByName']),
                    ]
                    .whereType<String>()
                    .where((part) => part.trim().isNotEmpty)
                    .join(' · '),
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

      final submission = response['reportSubmission'];
      final submittedDate = submission is Map
          ? _string(submission['operationDate'])
          : _loadedOperationDateKey;

      final nextDate =
          _string(response['date']) ?? (returnToToday ? _todayLabel() : _date);

      await _load(date: nextDate);
      if (!mounted) return;
      setState(() {
        _submittedReportId = reportId;
        _submittedReportDate = submittedDate;
        _submittedReportWasReturned = false;
      });
      _showReportUndo(reportId, wasReturned: false);
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
        _AmountField(controller: cashAdded, label: 'Capital received'),
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

    final targetDate = await _chooseOperationTarget('capital receipt');
    if (targetDate == null || !mounted) return;

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
          date: targetDate,
          amount: value,
          description: description.text,
        );

        _setNotice('Capital received.');
      },
    );
  }

  Future<void> _openBanking() async {
    final targetDate = await _chooseOperationTarget(
      'banking or mobile money record',
    );
    if (targetDate == null || !mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => BankingScreen(
          session: widget.session,
          api: _api,
          initialDate: targetDate,
        ),
      ),
    );
    if (mounted) await _load();
  }

  // ignore: unused_element
  Future<void> _showExpenseSheet() async {
    final amount = TextEditingController();

    final name = TextEditingController();

    await _showFormSheet(
      title: 'Record expense',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _TextField(controller: name, label: 'Name of expense'),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Amount'),
      ],
      onSubmit: () async {
        final expenseName = name.text.trim();

        if (expenseName.isEmpty) {
          throw ApiException('Enter the name of the expense.');
        }

        final value = _parseAmount(amount.text);

        if (value == null || value <= 0) {
          throw ApiException('Enter the amount.');
        }

        await _api.recordBranchExpense(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          amount: value,
          description: expenseName,
        );

        _setNotice('Expense saved.');
      },
    );
  }

  Future<void> _showFloatSheet({
    bool addMore = false,
    String? initialAgentId,
  }) async {
    final blockedMessage = _operationMutationBlockedMessage;

    if (blockedMessage != null) {
      _setError(blockedMessage);

      return;
    }

    final targetDate = await _chooseOperationTarget('float allocation');
    if (targetDate == null || !mounted) return;

    // Include officers who already have float so managers can top them up
    // from the same Allocate float action (API chooses issue vs top-up).
    final eligibleAgents = _floatEligibleFieldOfficers;

    if (eligibleAgents.isEmpty) {
      setState(() {
        _error = addMore
            ? 'No field officers can receive more float right now.'
            : 'No field officers can receive float right now.';
      });

      return;
    }

    final amount = TextEditingController();

    final notes = TextEditingController();

    var agentId =
        initialAgentId != null &&
            eligibleAgents.any(
              (agent) => _string(agent['id']) == initialAgentId,
            )
        ? initialAgentId
        : _string(eligibleAgents.first['id']) ?? '';

    final opensAsTopUp = addMore || _agentHasUnreturnedFloat(agentId);

    await _showFormSheet(
      title: opensAsTopUp ? 'Add float' : 'Allocate float',
      actionLabel: 'Save',
      builder: (setModalState) {
        final toppingUp = _agentHasUnreturnedFloat(agentId);
        final currentFloat = toppingUp
            ? _num(_positionForAgent(agentId)?['amountGiven'])
            : 0;

        return [
          _AgentPicker(
            agents: eligibleAgents,
            value: agentId,
            onChanged: (value) {
              setModalState(() {
                agentId = value;
              });
            },
          ),
          if (toppingUp) ...[
            const SizedBox(height: 8),
            Text(
              currentFloat > 0
                  ? 'Already has UGX ${_moneyText(currentFloat)} — this amount will be added.'
                  : 'This officer already has float — this amount will be added.',
              style: const TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 10),
          _AmountField(controller: amount, label: 'Amount'),
          const SizedBox(height: 10),
          _TextField(controller: notes, label: 'Notes', maxLines: 3),
        ];
      },
      onSubmit: () async {
        final value = _parseAmount(amount.text);

        if (agentId.isEmpty) {
          throw ApiException('Choose a field officer.');
        }

        if (value == null || value <= 0) {
          throw ApiException('Enter amount.');
        }

        final shouldTopUp = _agentHasUnreturnedFloat(agentId);

        await _api.recordAgentFloat(
          session: widget.session,
          agentId: agentId,
          date: targetDate,
          amount: value,
          notes: notes.text,
          addMore: shouldTopUp,
        );

        _setNotice(shouldTopUp ? 'Float added.' : 'Float allocated.');
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

        if (value == null) {
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
                      style: _returnedReportCorrectionMode
                          ? FilledButton.styleFrom(
                              backgroundColor: const Color(0xFFB97800),
                              foregroundColor: Colors.white,
                            )
                          : null,
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
        backgroundColor: _returnedReportCorrectionMode
            ? const Color(0xFFFFF7E6)
            : softIvory,

        body: SafeArea(
          child: Column(
            children: [
              BranchHeader(
                session: widget.session,
                workspaceName: widget.session.workspaceName,
                branchName: _branchName,
                roleName: widget.session.roleName ?? 'Team',
                loading: _loading,
                onRefresh: _load,
                onSignOut: _signOut,
                onOpenProfile: _openProfile,
                onOpenSettings: _openProfile,
                onSmsTap: () {
                  _openSubscription(SubscriptionTab.sms);
                },
                marketingCampaign: _marketingCampaign,
                onMarketingTap: _openMarketingCampaign,
                onMarketingDismiss: () {
                  unawaited(_dismissMarketingCampaign());
                },
                onMarketingCta: _handleMarketingCta,
              ),

              if (_returnedReportCorrectionMode)
                _ReturnedReportCorrectionBanner(
                  dateLabel: _dateLabel(_loadedOperationDateKey),
                  onBack: () => unawaited(_exitReturnedReportCorrection()),
                ),

              if (!_returnedReportCorrectionMode && _submittedReportId != null)
                _ReportSubmissionAcknowledgment(
                  dateLabel: _dateLabel(_submittedReportDate ?? ''),
                  resubmitted: _submittedReportWasReturned,
                  onView: () => unawaited(_viewSubmittedReport()),
                ),

              if (_notice != null)
                _Banner(message: _notice!, tone: _BannerTone.success),

              if (_error != null)
                _Banner(message: _error!, tone: _BannerTone.error),

              Expanded(
                child: ColoredBox(
                  color: _returnedReportCorrectionMode
                      ? const Color(0xFFFFF7E6)
                      : softIvory,
                  child: _loading && _data == null
                      ? const Center(
                          child: CircularProgressIndicator(
                            color: forestEmerald,
                          ),
                        )
                      : _returnedReportCorrectionMode
                      ? _buildOperationsTab()
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
              ),
              if (_returnedReportCorrectionMode)
                _ReturnedReportCorrectionActions(
                  onView: () => unawaited(_reviewCorrectedReturnedReport()),
                  onSend: _saving
                      ? null
                      : () => unawaited(_sendCorrectedReturnedReport()),
                  onSave: () => unawaited(_exitReturnedReportCorrection()),
                ),
            ],
          ),
        ),

        bottomNavigationBar: _returnedReportCorrectionMode
            ? null
            : WorkspaceBottomNavigation(
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
        ? _num(
            _collectionSummary?['borrowersDueTodayCount'] ??
                _collectionSummary?['dueTodayCount'],
          ).round()
        : _borrowersDueForDate(loadedDate);

    return ManagerOwnerHomeTab(
      session: widget.session,

      onOpenProfile: _openProfile,

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

      salariesToday: _num(_operation?['salariesTotal']).round(),

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
    final returnedReports = _returnedReportCorrectionMode
        ? const <Map<String, dynamic>>[]
        : _reports
              .where(
                (report) => _string(report['status']) == 'RETURNED_TO_MANAGER',
              )
              .toList();
    final returnedReport = returnedReports.isEmpty
        ? null
        : returnedReports.first;

    return OperationsTab(
      session: widget.session,

      operation: _buildOperationDashboardData(),

      agents: _buildAgentFloatPositions(),

      activities: _buildOperationActivities(),

      dayOpen: _dayWritable,

      dayActive: _dayActive || _returnedReportCorrectionMode,
      correctionMode: _returnedReportCorrectionMode,

      canOpenDay: _canOpenDay,

      canRecordCashMovements: _operationMutationBlockedMessage == null,

      onRefresh: _load,

      onOpenDay: _showOpenDaySheet,

      onReceiveCapital: _showTopUpSheet,

      onRecordExpense: () {
        unawaited(_openExpenses());
      },

      onRecordBanking: () {
        unawaited(_openBanking());
      },

      onRecordShortagePaid: () {
        unawaited(_openShortagesList());
      },

      onAllocateFloat: () {
        unawaited(_showFloatSheet(addMore: false));
      },

      onCloseDay: () => unawaited(
        _returnedReportCorrectionMode
            ? _reviewCorrectedReturnedReport()
            : _openDayReconciliation(),
      ),

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

      returnedReportMessage: _returnedReportCorrectionMode
          ? null
          : () {
              if (returnedReports.isEmpty) return null;
              final first = returnedReports.first;
              final date = _dateLabel(first['operationDate']);
              if (returnedReports.length == 1) {
                return '$date was returned. Re-check figures and resubmit.';
              }
              return '$date and ${returnedReports.length - 1} more returned. Re-check and resubmit.';
            }(),

      returnedReportDate: returnedReport == null
          ? null
          : _dateLabel(returnedReport['operationDate']),

      returnedReportBy: returnedReport == null
          ? null
          : _returnedByLabel(returnedReport['returnedByName']),

      returnedReportAt: returnedReport == null
          ? null
          : _returnedAtLabel(returnedReport['returnedAt']),

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

      onOpenReturnedReport: () {
        if (returnedReports.isEmpty) {
          unawaited(_openReportsList());
          return;
        }
        unawaited(_confirmReturnedReportCorrection(returnedReports.first));
      },

      onOpenAgentPositions:
          widget.session.hasPermission('operation.float.manage')
          ? () {
              unawaited(_openAgentPositions());
            }
          : null,

      onOpenAgentPosition:
          widget.session.hasPermission('operation.float.manage')
          ? (position) {
              unawaited(_openAgentPosition(position));
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

      onRepaymentCorrectionsTap: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => RepaymentCorrectionsScreen(session: widget.session),
          ),
        );
      },

      onReportsTap: () {
        unawaited(_openReportsList());
      },

      onBranchTap: () {
        _openBranchDetails();
      },

      onVoidedClientsTap: widget.session.hasPermission('branch.create')
          ? () {
              Navigator.of(context).push<void>(
                MaterialPageRoute(
                  builder: (_) => VoidedClientsScreen(session: widget.session),
                ),
              );
            }
          : null,

      onEditRecordsTap: widget.session.isOrganisationOwner
          ? () {
              Navigator.of(context).push<void>(
                MaterialPageRoute(
                  builder: (_) => EditRecordsScreen(session: widget.session),
                ),
              );
            }
          : null,

      onSubscriptionTap: () {
        _openSubscription(SubscriptionTab.plan);
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

class _ReportsListScreen extends StatefulWidget {
  const _ReportsListScreen({
    required this.session,
    required this.reports,
    required this.onOpenReturnedReport,
  });

  final RembehSession session;
  final List<Map<String, dynamic>> reports;
  final Future<void> Function(Map<String, dynamic> report) onOpenReturnedReport;

  @override
  State<_ReportsListScreen> createState() => _ReportsListScreenState();
}

class _ReportsListScreenState extends State<_ReportsListScreen> {
  bool _openingReport = false;

  Future<void> _openReport(Map<String, dynamic> report) async {
    if (_openingReport) {
      return;
    }
    final reportId = _string(report['id']);
    if (reportId == null) {
      return;
    }
    _openingReport = true;
    try {
      final status = (_string(report['status']) ?? '').toUpperCase();
      if (status == 'RETURNED_TO_MANAGER') {
        await widget.onOpenReturnedReport(report);
        return;
      }
      await const DailyReportPdfCache().invalidate(reportId);
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => DailyReportScreen(
            session: widget.session,
            reportId: reportId,
            // Fresh detail is always fetched; list meta is a hint only.
            reportPayload: report,
          ),
        ),
      );
    } finally {
      _openingReport = false;
    }
  }

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
        itemCount: widget.reports.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final report = widget.reports[index];
          final reportId = _string(report['id']);
          final status = _string(report['status']) ?? 'MANAGER_REVIEW';
          final dateLabel = _dateLabel(report['operationDate']);

          return _MoreDataTile(
            icon: Icons.picture_as_pdf_outlined,
            title: dateLabel,
            subtitle: _label(status),
            trailing: _moneyOrDash(
              report['closingBalance'] ?? report['expectedClosingBalance'],
            ),
            tone: _reportStatusColor(status),
            onTap: reportId == null || _openingReport
                ? null
                : () {
                    unawaited(_openReport(report));
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
                  label: 'Expected closing balance',
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

      decoration: const InputDecoration(labelText: 'Field officer'),
    );
  }
}

// =============================================================================
// BANNERS
// =============================================================================

enum _BannerTone { success, error }

class _ReturnedReportCorrectionBanner extends StatelessWidget {
  const _ReturnedReportCorrectionBanner({
    required this.dateLabel,
    required this.onBack,
  });

  final String dateLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFFFE9BD),
        border: const Border(bottom: BorderSide(color: Color(0xFFE4B75D))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              color: Color(0xFFFFD98A),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.history_rounded,
              color: Color(0xFF8A5A00),
              size: 21,
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
                        'Returned report · $dateLabel',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFD98A),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'REVISION',
                        style: TextStyle(
                          color: Color(0xFF8A5A00),
                          fontSize: 8,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                const Text(
                  'Editing returned report',
                  style: TextStyle(
                    color: Color(0xFF76551A),
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            onPressed: onBack,
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF6D4700),
              side: const BorderSide(color: Color(0xFF9B6A0A)),
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 9),
            ),
            icon: const Icon(Icons.arrow_back_rounded, size: 16),
            label: const Text(
              'Back to current Ops',
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReportSubmissionAcknowledgment extends StatelessWidget {
  const _ReportSubmissionAcknowledgment({
    required this.dateLabel,
    required this.resubmitted,
    required this.onView,
  });

  final String dateLabel;
  final bool resubmitted;
  final VoidCallback onView;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 2),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF8EF),
        border: Border.all(color: const Color(0xFFC7E9D2)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: const BoxDecoration(
              color: forestEmerald,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  resubmitted ? 'Report resubmitted' : 'Report submitted',
                  style: const TextStyle(
                    color: Color(0xFF14532D),
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$dateLabel · Awaiting owner review',
                  style: const TextStyle(color: slateText, fontSize: 11),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onView,
            iconAlignment: IconAlignment.end,
            icon: const Icon(Icons.chevron_right_rounded, size: 18),
            label: const Text('View report'),
          ),
        ],
      ),
    );
  }
}

class _ReturnedReportCorrectionActions extends StatelessWidget {
  const _ReturnedReportCorrectionActions({
    required this.onView,
    required this.onSend,
    required this.onSave,
  });

  final VoidCallback onView;
  final VoidCallback? onSend;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFB97800);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        decoration: const BoxDecoration(
          color: Color(0xFFFFF9ED),
          border: Border(top: BorderSide(color: Color(0xFFE7D5B0))),
        ),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onView,
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF765000),
                  side: const BorderSide(color: gold),
                  minimumSize: const Size.fromHeight(48),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: const Icon(Icons.description_outlined, size: 18),
                label: const _RevisionActionLabel(
                  title: 'View report',
                  subtitle: 'Preview daily report',
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: onSend,
                style: FilledButton.styleFrom(
                  backgroundColor: gold,
                  minimumSize: const Size.fromHeight(48),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: const Icon(Icons.send_outlined, size: 18),
                label: const _RevisionActionLabel(
                  title: 'Send report',
                  subtitle: 'To owner for review',
                  light: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onSave,
                style: OutlinedButton.styleFrom(
                  foregroundColor: slateText,
                  backgroundColor: const Color(0xFFF4F1EB),
                  side: const BorderSide(color: Color(0xFFD8D2C7)),
                  minimumSize: const Size.fromHeight(48),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: const Icon(Icons.save_outlined, size: 18),
                label: const _RevisionActionLabel(
                  title: 'Save for later',
                  subtitle: 'Continue later',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevisionActionLabel extends StatelessWidget {
  const _RevisionActionLabel({
    required this.title,
    required this.subtitle,
    this.light = false,
  });

  final String title;
  final String subtitle;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: light ? Colors.white : null,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
          ),
        ),
        Text(
          subtitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: light ? Colors.white70 : slateText,
            fontSize: 7.5,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

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
    this.pendingDisbursements,
    this.summary,
  });

  final List<Map<String, dynamic>>? customers;
  final List<Map<String, dynamic>>? loans;
  final List<Map<String, dynamic>>? repayments;
  final List<Map<String, dynamic>>? reports;
  final List<Map<String, dynamic>>? shortages;
  final List<PendingDisbursement>? pendingDisbursements;
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

/// Keep report history list light — drop embedded snapshots so the
/// More → Reports screen only holds names/status/balances.
List<Map<String, dynamic>> _reportListSummaries(Object? value) {
  if (value is! List) {
    return const [];
  }

  return value.whereType<Map>().map((item) {
    final map = item.map((key, entry) => MapEntry(key.toString(), entry));
    map.remove('snapshot');
    return map;
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

String _returnedAtLabel(Object? value) {
  final raw = _string(value);
  final parsed = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
  if (parsed == null) return 'Recently';

  const months = <String>[
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
  final hour = parsed.hour == 0
      ? 12
      : parsed.hour > 12
      ? parsed.hour - 12
      : parsed.hour;
  final minute = parsed.minute.toString().padLeft(2, '0');
  final period = parsed.hour >= 12 ? 'PM' : 'AM';
  return '${parsed.day} ${months[parsed.month - 1]}, $hour:$minute $period';
}

String _returnedByLabel(Object? value) {
  final label = _string(value)?.trim();
  if (label == null || label.isEmpty || label.contains('@')) return 'Owner';
  if (label.toLowerCase().contains('owner')) return 'Owner';
  return label;
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

bool _sameStringSet(List<String> left, List<String> right) {
  if (left.length != right.length) return false;
  final values = left.toSet();
  return values.length == right.length && values.containsAll(right);
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

Map<String, dynamic> _pendingDisbursementToJson(PendingDisbursement item) {
  return item.toJson();
}
