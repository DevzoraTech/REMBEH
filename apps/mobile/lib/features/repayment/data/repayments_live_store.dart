import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/di/repayment_locator.dart';
import '../../../core/network/realtime_client.dart';
import '../../../models/field_records.dart';
import '../../../services/session_store.dart';
import '../domain/entities/client_loan_detail.dart';

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
    await _loadRecentIds();
    await refresh();
    if (_listening) return;
    _listening = true;

    final client = RealtimeClient.instance;
    await client.connect(session);
    client.on('payment.made', _onPaymentRealtime);
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
      _error = error.toString();
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
              !item.recordedAt
                  .isAfter(customRange.end.add(const Duration(days: 1)));
      }
    }).toList();
    filtered.sort((a, b) => b.recordedAt.compareTo(a.recordedAt));
    return filtered;
  }

  Future<ClientLoanDetail> getLoanDetail(String loanId) async {
    final detail = await _locator.getLoanDetail(loanId);
    _detailCache[loanId] = detail;
    await markClientRecent(loanId);
    notifyListeners();
    return detail;
  }

  Future<List<ClientLoanDetail>> searchClients(String query) async {
    return _locator.searchClients(query);
  }

  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
      recordRepayment({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  }) async {
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
    final scope = (tenantId != null && tenantId.isNotEmpty) ? tenantId : 'unknown';
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
    _locator.getSummary().then((summary) {
      _summary = summary;
      notifyListeners();
    }).catchError((_) {});

    notifyListeners();
  }
}
