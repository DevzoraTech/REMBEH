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

  static const _recentKey = 'rembeh_recent_loan_ids';

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

  HomeSummary get summary => _summary;
  List<FieldRepayment> get repayments => List.unmodifiable(_repayments);
  bool get loading => _loading;
  String? get error => _error;

  Future<void> start(RembehSession session) async {
    await _loadRecentIds();
    await refresh();
    if (_listening) return;
    _listening = true;

    final client = RealtimeClient.instance;
    await client.connect(session);
    client.on('payment.made', _onPaymentRealtime);
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
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_recentKey, _recentLoanIds);
  }

  Future<List<ClientLoanDetail>> recentClients() async {
    final details = <ClientLoanDetail>[];
    for (final id in _recentLoanIds) {
      final cached = _detailCache[id];
      if (cached != null) {
        details.add(cached);
        continue;
      }
      try {
        details.add(await getLoanDetail(id));
      } catch (_) {
        // Drop stale recent ids quietly.
      }
    }
    return details;
  }

  Future<void> clearRecentClients() async {
    _recentLoanIds.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_recentKey);
    notifyListeners();
  }

  Future<void> _loadRecentIds() async {
    final prefs = await SharedPreferences.getInstance();
    _recentLoanIds
      ..clear()
      ..addAll(prefs.getStringList(_recentKey) ?? const []);
  }

  void _onPaymentRealtime(Map<String, dynamic> payload) {
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
