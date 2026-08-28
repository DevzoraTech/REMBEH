import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/di/repayment_locator.dart';
import '../../../core/network/realtime_client.dart';
import '../../../models/field_records.dart';
import '../../../services/api_client.dart';
import '../../../services/network_status_store.dart';
import '../../../services/offline_cache_store.dart';
import '../../../services/session_store.dart';
import '../../../utils/friendly_errors.dart';
import '../domain/entities/client_loan_detail.dart';
import 'repayment_repository_impl.dart';

/// Live collections store — replaces mock FieldRecordsStore for repayments.
class RepaymentsLiveStore extends ChangeNotifier {
  RepaymentsLiveStore._();

  static final RepaymentsLiveStore instance = RepaymentsLiveStore._();

  static const _recentKeyPrefix = 'rembeh_recent_loan_ids';

  final _locator = RepaymentLocator.instance;
  HomeSummary _summary = const HomeSummary(
    amountCollectedToday: 0,
    repaymentsTodayCount: 0,
    dueTodayCount: 0,
    newApplicationsTodayCount: 0,
    pendingSyncCount: 0,
    clientsDueToday: [],
  );
  final List<FieldRepayment> _repayments = [];
  final List<String> _recentLoanIds = [];
  final Map<String, ClientLoanDetail> _detailCache = {};
  DateTimeRange? customRange;
  bool _loading = false;
  String? _error;
  bool _listening = false;
  String? _tenantId;
  String? _recentKey;
  RembehSession? _session;

  HomeSummary get summary => _summary;
  List<FieldRepayment> get repayments => List.unmodifiable(_repayments);
  bool get loading => _loading;
  String? get error => _error;

  Future<void> start(RembehSession session) async {
    final tenantChanged = _tenantId != null && _tenantId != session.tenantId;
    if (tenantChanged) {
      await clearSessionState();
    }
    _tenantId = session.tenantId;
    _recentKey = _recentPrefsKey(session.tenantId);
    _session = session;
    await _loadRecentIds();
    await _hydrateOfflineIndex(session);
    await refresh();
    if (NetworkStatusStore.instance.isOnline) {
      try {
        await refreshOfflineIndex(session);
      } catch (_) {}
    }
    if (_listening) return;
    _listening = true;

    final client = RealtimeClient.instance;
    await client.connect(session);
    client.on('payment.made', _onPaymentRealtime);
  }

  Future<void> _hydrateOfflineIndex(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return;
    final payload = await OfflineCacheStore.instance.getPayload(
      OfflineCacheKeys.customers(tenantId, branchId),
    );
    if (payload is! List) return;
    for (final item in payload) {
      if (item is! Map) continue;
      final detail = _compactToDetail(Map<String, dynamic>.from(item));
      if (detail.loanId.isNotEmpty) {
        _detailCache[detail.loanId] = detail;
      }
    }
  }

  Future<void> clearSessionState() async {
    _summary = const HomeSummary(
      amountCollectedToday: 0,
      repaymentsTodayCount: 0,
      dueTodayCount: 0,
      newApplicationsTodayCount: 0,
      pendingSyncCount: 0,
      clientsDueToday: [],
    );
    _repayments.clear();
    _detailCache.clear();
    _recentLoanIds.clear();
    _error = null;
    _loading = false;
    _listening = false;
    _tenantId = null;
    _recentKey = null;
    _session = null;
    RealtimeClient.instance.off('payment.made', _onPaymentRealtime);
    notifyListeners();
  }

  Future<void> refresh() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        _locator.getSummary(),
        _locator.listRepayments(),
      ]);
      _summary = results[0] as HomeSummary;
      _repayments
        ..clear()
        ..addAll(results[1] as List<FieldRepayment>);
      _error = null;
    } catch (error) {
      _error = friendlyErrorMessage(error);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  List<FieldRepayment> filtered({
    RecordsFilter filter = RecordsFilter.all,
    DateTimeRange? customRange,
  }) {
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));

    bool inWeek(DateTime value) {
      final start = now.subtract(Duration(days: now.weekday - 1));
      final dayStart = DateTime(start.year, start.month, start.day);
      return !value.isBefore(dayStart);
    }

    bool inMonth(DateTime value) =>
        value.year == now.year && value.month == now.month;

    bool sameDay(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;

    final filtered = _repayments.where((item) {
      switch (filter) {
        case RecordsFilter.all:
          return true;
        case RecordsFilter.dueToday:
          return item.dueToday;
        case RecordsFilter.collectedToday:
        case RecordsFilter.today:
          return sameDay(item.recordedAt, now);
        case RecordsFilter.yesterday:
          return sameDay(item.recordedAt, yesterday);
        case RecordsFilter.thisWeek:
          return inWeek(item.recordedAt);
        case RecordsFilter.thisMonth:
          return inMonth(item.recordedAt);
        case RecordsFilter.pendingSync:
          return !item.synced;
        case RecordsFilter.uploaded:
          return item.synced;
        case RecordsFilter.custom:
          if (customRange == null) return true;
          return !item.recordedAt.isBefore(customRange.start) &&
              !item.recordedAt.isAfter(
                customRange.end.add(const Duration(days: 1)),
              );
      }
    }).toList();
    filtered.sort((a, b) => b.recordedAt.compareTo(a.recordedAt));
    return filtered;
  }

  Future<ClientLoanDetail> getLoanDetail(String loanId) async {
    try {
      final detail = await _locator.getLoanDetail(loanId);
      _detailCache[loanId] = detail;
      await markClientRecent(loanId);
      notifyListeners();
      return detail;
    } catch (error) {
      final cached = _detailCache[loanId] ?? _offlineDetail(loanId);
      if (cached != null && NetworkStatusStore.instance.isOffline) {
        return cached;
      }
      rethrow;
    }
  }

  Future<ClientLoanDetail> correctLoan({
    required String loanId,
    required Map<String, dynamic> values,
  }) async {
    final network = NetworkStatusStore.instance;
    if (network.isOffline && !await network.checkNow()) {
      throw ApiException(
        'Connect to the internet before correcting legacy records.',
      );
    }

    final detail = await _locator.repository.correctLoan(
      loanId: loanId,
      values: values,
    );
    _detailCache[loanId] = detail;
    await refreshOfflineIndexForCurrentSession();
    await refresh();
    notifyListeners();
    return detail;
  }

  Future<void> deleteLoan({
    required String loanId,
    required String reason,
  }) async {
    final network = NetworkStatusStore.instance;
    if (network.isOffline && !await network.checkNow()) {
      throw ApiException(
        'Connect to the internet before deleting legacy records.',
      );
    }

    await _locator.repository.deleteLoan(loanId: loanId, reason: reason);
    _detailCache.remove(loanId);
    _recentLoanIds.remove(loanId);
    await _saveRecentIds();
    await refreshOfflineIndexForCurrentSession();
    await refresh();
    notifyListeners();
  }

  Future<List<ClientLoanDetail>> searchClients(String query) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    try {
      final results = await _locator.searchClients(query);
      for (final detail in results) {
        _detailCache[detail.loanId] = detail;
      }
      return results;
    } catch (_) {
      if (!NetworkStatusStore.instance.isOffline) rethrow;
      return _searchOffline(q);
    }
  }

  /// Pulls latest branch clients into local cache. Old cache is replaced only
  /// after a successful write.
  Future<void> refreshOfflineIndex(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return;
    final network = NetworkStatusStore.instance;
    if (network.isOffline && !await network.checkNow()) return;
    final repo = _locator.repository;
    if (repo is! RepaymentRepositoryImpl) return;
    final clients = await repo.offlineSnapshotClients();
    await OfflineCacheStore.instance.putJson(
      OfflineCacheKeys.customers(tenantId, branchId),
      clients,
    );
    for (final raw in clients) {
      final detail = _compactToDetail(raw);
      if (detail.loanId.isNotEmpty) {
        _detailCache[detail.loanId] = detail;
      }
    }
  }

  Future<void> refreshOfflineIndexForCurrentSession() async {
    final session = _session;
    if (session == null) return;
    await refreshOfflineIndex(session);
  }

  List<ClientLoanDetail> _searchOffline(String q) {
    final digits = q.replaceAll(RegExp(r'[^0-9+]'), '');
    final matches = _detailCache.values.where((client) {
      final name = client.fullName.toLowerCase();
      final phone = client.phone.toLowerCase();
      if (name.contains(q) || phone.contains(q)) return true;
      if (digits.length >= 3) {
        final phoneDigits = phone.replaceAll(RegExp(r'[^0-9+]'), '');
        return phoneDigits.contains(digits);
      }
      return false;
    }).toList();
    matches.sort((a, b) => a.fullName.compareTo(b.fullName));
    return matches.take(40).toList();
  }

  ClientLoanDetail? _offlineDetail(String loanId) {
    return _detailCache[loanId];
  }

  ClientLoanDetail _compactToDetail(Map<String, dynamic> json) {
    return ClientLoanDetail(
      id: json['loanId'] as String? ?? '',
      loanId: json['loanId'] as String? ?? '',
      customerId: json['customerId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      nationalId: json['nationalId'] as String?,
      customerEmail: json['customerEmail'] as String?,
      registeredBy: json['registeredBy'] as String? ?? '',
      agentPhotoUrl: null,
      outstanding: _asInt(json['outstanding']),
      lastPaymentAmount: 0,
      lastPaymentAt: null,
      lastPaymentBy: null,
      expectedToday: _asInt(json['expectedToday']),
      carriedForward: 0,
      dailyInstalment: 0,
      loanPeriodDays: _asInt(json['loanPeriodDays']),
      daysLeft: _asInt(json['daysLeft']),
      nextDueLabel: json['nextDueLabel'] as String? ?? '',
      nextDueIsToday: json['nextDueIsToday'] as bool? ?? false,
      paidAmount: _asInt(json['paidAmount']),
      loanAmount: _asInt(json['loanAmount']),
      principalAmount: _asInt(json['loanAmount']),
      openingBalance: _asInt(json['outstanding']),
      interestRatePercent: _asInt(json['interestRatePercent']),
      loanStartDate:
          DateTime.tryParse(json['loanStartDate'] as String? ?? '') ??
          DateTime.now(),
      maturityDate:
          DateTime.tryParse(json['maturityDate'] as String? ?? '') ??
          DateTime.now(),
      paymentStartDate: DateTime.tryParse(
        json['paymentStartDate'] as String? ?? '',
      ),
      status: json['status'] as String? ?? 'CURRENT',
      isFined: json['isFined'] as bool? ?? false,
      finesTotal: _asInt(json['finesTotal']),
      paymentHistory: const [],
      fineHistory: const [],
      correctionAccess: ClientLoanCorrectionAccess.fromJson(
        json['correctionAccess'] is Map<String, dynamic>
            ? json['correctionAccess'] as Map<String, dynamic>
            : null,
      ),
    );
  }

  int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
  recordRepayment({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  }) async {
    final network = NetworkStatusStore.instance;
    if (network.isOffline && !await network.checkNow()) {
      return _queueOfflineRepayment(
        loanId: loanId,
        amount: amount,
        note: note,
        method: method,
        paidAt: paidAt ?? DateTime.now(),
      );
    }
    try {
      final result = await _locator.recordRepayment(
        loanId: loanId,
        amount: amount,
        note: note,
        method: method,
        paidAt: paidAt,
      );
      _detailCache[loanId] = result.detail;
      await refresh();
      return result;
    } catch (error) {
      if (NetworkStatusStore.instance.isOffline) {
        return _queueOfflineRepayment(
          loanId: loanId,
          amount: amount,
          note: note,
          method: method,
          paidAt: paidAt ?? DateTime.now(),
        );
      }
      rethrow;
    }
  }

  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
  _queueOfflineRepayment({
    required String loanId,
    required int amount,
    String? note,
    required String method,
    required DateTime paidAt,
  }) async {
    final tenantId = _tenantId;
    if (tenantId == null) {
      throw ApiException(
        'Offline cache is not ready. Open the app online once.',
      );
    }
    final cached = _detailCache[loanId];
    if (cached == null) {
      throw ApiException(
        'Client is not in offline cache. Search while online first.',
      );
    }
    final localId = 'offline_${DateTime.now().millisecondsSinceEpoch}';
    final pending = await _readPendingWrites(tenantId);
    pending.add({
      'id': localId,
      'type': 'repayment',
      'loanId': loanId,
      'amount': amount,
      'note': note,
      'method': method,
      'paidAt': paidAt.toUtc().toIso8601String(),
    });
    await OfflineCacheStore.instance.putJson(
      OfflineCacheKeys.pendingWrites(tenantId),
      pending,
    );

    final nextOutstanding = cached.outstanding - amount < 0
        ? 0
        : cached.outstanding - amount;
    final detail = ClientLoanDetail(
      id: cached.id,
      loanId: cached.loanId,
      customerId: cached.customerId,
      fullName: cached.fullName,
      phone: cached.phone,
      nationalId: cached.nationalId,
      customerEmail: cached.customerEmail,
      registeredBy: cached.registeredBy,
      agentPhotoUrl: cached.agentPhotoUrl,
      outstanding: nextOutstanding,
      lastPaymentAmount: amount,
      lastPaymentAt: paidAt,
      lastPaymentBy: 'You (offline)',
      expectedToday: cached.expectedToday,
      carriedForward: cached.carriedForward,
      dailyInstalment: cached.dailyInstalment,
      loanPeriodDays: cached.loanPeriodDays,
      daysLeft: cached.daysLeft,
      nextDueLabel: cached.nextDueLabel,
      nextDueIsToday: cached.nextDueIsToday,
      paidAmount: cached.paidAmount + amount,
      loanAmount: cached.loanAmount,
      principalAmount: cached.principalAmount,
      openingBalance: cached.openingBalance,
      interestRatePercent: cached.interestRatePercent,
      loanStartDate: cached.loanStartDate,
      maturityDate: cached.maturityDate,
      paymentStartDate: cached.paymentStartDate,
      status: cached.status,
      isFined: cached.isFined,
      finesTotal: cached.finesTotal,
      paymentHistory: [
        PaymentHistoryItem(
          id: localId,
          amount: amount,
          method: method,
          paidAt: paidAt,
          recordedByName: 'You (offline)',
          note: note,
        ),
        ...cached.paymentHistory,
      ],
      fineHistory: cached.fineHistory,
      correctionAccess: cached.correctionAccess,
    );
    _detailCache[loanId] = detail;
    final repayment = FieldRepayment(
      id: localId,
      loanId: loanId,
      clientName: detail.fullName,
      phone: detail.phone,
      amount: amount,
      amountPaid: detail.paidAmount,
      loanAmount: detail.loanAmount,
      recordedAt: paidAt,
      synced: false,
      dueToday: detail.nextDueIsToday,
    );
    _repayments.insert(0, repayment);
    notifyListeners();
    return (repayment: repayment, detail: detail);
  }

  Future<void> flushPendingWrites() async {
    final tenantId = _tenantId;
    final network = NetworkStatusStore.instance;
    if (tenantId == null || network.isOffline && !await network.checkNow()) {
      return;
    }
    final pending = await _readPendingWrites(tenantId);
    if (pending.isEmpty) return;
    final remaining = <Map<String, dynamic>>[];
    for (final item in pending) {
      if (item['type'] != 'repayment') {
        remaining.add(item);
        continue;
      }
      try {
        await _locator.recordRepayment(
          loanId: item['loanId'] as String? ?? '',
          amount: _asInt(item['amount']),
          note: item['note'] as String?,
          method: item['method'] as String? ?? 'CASH',
          paidAt: DateTime.tryParse(item['paidAt'] as String? ?? ''),
        );
      } catch (_) {
        remaining.add(item);
      }
    }
    await OfflineCacheStore.instance.putJson(
      OfflineCacheKeys.pendingWrites(tenantId),
      remaining,
    );
    if (remaining.length < pending.length) {
      await refresh();
    }
  }

  Future<List<Map<String, dynamic>>> _readPendingWrites(String tenantId) async {
    final payload = await OfflineCacheStore.instance.getPayload(
      OfflineCacheKeys.pendingWrites(tenantId),
    );
    if (payload is! List) return [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> markClientRecent(String loanId) async {
    _recentLoanIds.remove(loanId);
    _recentLoanIds.insert(0, loanId);
    if (_recentLoanIds.length > 12) {
      _recentLoanIds.removeRange(12, _recentLoanIds.length);
    }
    final key = _recentKey;
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(key, _recentLoanIds);
  }

  Future<void> _saveRecentIds() async {
    final key = _recentKey;
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(key, _recentLoanIds);
  }

  Future<List<ClientLoanDetail>> recentClients() async {
    final details = <ClientLoanDetail>[];
    final stale = <String>[];
    for (final id in List<String>.from(_recentLoanIds)) {
      try {
        // Always re-fetch so a prior tenant's in-memory cache cannot leak.
        final detail = await _locator.getLoanDetail(id);
        _detailCache[id] = detail;
        details.add(detail);
      } catch (_) {
        stale.add(id);
      }
    }
    if (stale.isNotEmpty) {
      _recentLoanIds.removeWhere(stale.contains);
      final key = _recentKey;
      if (key != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setStringList(key, _recentLoanIds);
      }
    }
    return details;
  }

  Future<void> clearRecentClients() async {
    _recentLoanIds.clear();
    final key = _recentKey;
    if (key != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(key);
    }
    notifyListeners();
  }

  Future<void> _loadRecentIds() async {
    final key = _recentKey;
    _recentLoanIds.clear();
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    _recentLoanIds.addAll(prefs.getStringList(key) ?? const []);
  }

  String _recentPrefsKey(String? tenantId) {
    final scope = (tenantId != null && tenantId.isNotEmpty)
        ? tenantId
        : 'unknown';
    return '${_recentKeyPrefix}_$scope';
  }

  void _onPaymentRealtime(Map<String, dynamic> payload) {
    final payloadTenant = payload['tenantId'] as String?;
    if (_tenantId != null &&
        payloadTenant != null &&
        payloadTenant != _tenantId) {
      return;
    }

    final id = payload['repaymentId'] as String? ?? '';
    if (id.isEmpty) {
      refresh();
      return;
    }

    final item = FieldRepayment(
      id: id,
      loanId: payload['loanId'] as String? ?? '',
      clientName: payload['clientName'] as String? ?? '',
      phone: payload['phone'] as String? ?? '',
      amount: ((payload['amount'] as num?) ?? 0).round(),
      amountPaid: ((payload['amountPaid'] as num?) ?? 0).round(),
      loanAmount: ((payload['loanAmount'] as num?) ?? 0).round(),
      recordedAt:
          DateTime.tryParse(payload['recordedAt'] as String? ?? '') ??
          DateTime.now(),
      synced: payload['synced'] as bool? ?? true,
      dueToday: true,
    );

    final idx = _repayments.indexWhere((row) => row.id == item.id);
    if (idx >= 0) {
      _repayments[idx] = item;
    } else {
      _repayments.insert(0, item);
    }

    final loanId = payload['loanId'] as String?;
    if (loanId != null) {
      _detailCache.remove(loanId);
    }

    // Soft-refresh summary aggregates without clearing the list.
    // ignore: unawaited_futures
    _locator
        .getSummary()
        .then((summary) {
          _summary = summary;
          notifyListeners();
        })
        .catchError((_) {});

    notifyListeners();
  }
}
