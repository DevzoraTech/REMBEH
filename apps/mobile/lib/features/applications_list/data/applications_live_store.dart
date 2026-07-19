import 'package:flutter/material.dart';

import '../../../core/di/loan_application_locator.dart';
import '../../../core/network/realtime_client.dart';
import '../../../models/field_records.dart';
import '../../../services/session_store.dart';
import '../../loan_application/domain/entities/loan_application.dart';

/// Live Applications list for Records tab — UI shape unchanged.
class ApplicationsLiveStore extends ChangeNotifier {
  ApplicationsLiveStore._();

  static final ApplicationsLiveStore instance = ApplicationsLiveStore._();

  final List<FieldApplication> _applications = [];
  bool _loading = false;
  String? _error;
  bool _listening = false;
  String? _tenantId;

  List<FieldApplication> get applications => List.unmodifiable(_applications);
  bool get loading => _loading;
  String? get error => _error;

  Future<void> start(RembehSession session) async {
    final tenantChanged = _tenantId != null && _tenantId != session.tenantId;
    if (tenantChanged) {
      clearSessionState();
    }
    _tenantId = session.tenantId;
    await refresh();
    if (_listening) return;
    _listening = true;

    final client = RealtimeClient.instance;
    await client.connect(session);

    client.on('loan_application.submitted', _onRealtime);
    client.on('loan_application.updated', _onRealtime);
  }

  void clearSessionState() {
    _applications.clear();
    _error = null;
    _loading = false;
    _listening = false;
    _tenantId = null;
    final client = RealtimeClient.instance;
    client.off('loan_application.submitted', _onRealtime);
    client.off('loan_application.updated', _onRealtime);
    notifyListeners();
  }

  Future<void> refresh() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final items =
          await LoanApplicationLocator.instance.listApplications();
      _applications
        ..clear()
        ..addAll(
          items
              .where((item) => item.status == 'SUBMITTED')
              .map(_toFieldApplication),
        );
      _error = null;
    } catch (error) {
      _error = error.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  List<FieldApplication> filtered({
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

    final filtered = _applications.where((item) {
      switch (filter) {
        case RecordsFilter.all:
        case RecordsFilter.dueToday:
          return true;
        case RecordsFilter.today:
        case RecordsFilter.collectedToday:
          return sameDay(item.registeredAt, now);
        case RecordsFilter.yesterday:
          return sameDay(item.registeredAt, yesterday);
        case RecordsFilter.thisWeek:
          return inWeek(item.registeredAt);
        case RecordsFilter.thisMonth:
          return inMonth(item.registeredAt);
        case RecordsFilter.pendingSync:
          return !item.synced;
        case RecordsFilter.uploaded:
          return item.synced;
        case RecordsFilter.custom:
          if (customRange == null) return true;
          return !item.registeredAt.isBefore(customRange.start) &&
              !item.registeredAt
                  .isAfter(customRange.end.add(const Duration(days: 1)));
      }
    }).toList();
    filtered.sort((a, b) => b.registeredAt.compareTo(a.registeredAt));
    return filtered;
  }

  void _onRealtime(Map<String, dynamic> payload) {
    final payloadTenant = payload['tenantId'] as String?;
    if (_tenantId != null &&
        payloadTenant != null &&
        payloadTenant != _tenantId) {
      return;
    }

    final id = payload['applicationId'] as String? ?? payload['id'] as String?;
    if (id == null) return;

    final item = FieldApplication(
      id: id,
      clientName: payload['clientName'] as String? ?? '',
      phone: payload['phone'] as String? ?? '',
      amountRequested: ((payload['amountRequested'] as num?) ?? 0).round(),
      interestRatePercent:
          ((payload['interestRatePercent'] as num?) ?? 0).round(),
      registeredAt:
          DateTime.tryParse(payload['registeredAt'] as String? ?? '') ??
              DateTime.now(),
      synced: payload['synced'] as bool? ?? true,
    );

    final index = _applications.indexWhere((app) => app.id == id);
    if (index >= 0) {
      _applications[index] = item;
    } else if ((payload['status'] as String?) == 'SUBMITTED' ||
        payload['synced'] == true) {
      _applications.insert(0, item);
    }
    notifyListeners();
  }

  FieldApplication _toFieldApplication(LoanApplicationListItem item) {
    return FieldApplication(
      id: item.id,
      clientName: item.clientName,
      phone: item.phone,
      amountRequested: item.amountRequested,
      interestRatePercent: item.interestRatePercent,
      registeredAt: item.registeredAt,
      synced: item.synced,
    );
  }
}
