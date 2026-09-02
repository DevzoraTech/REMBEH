import 'package:flutter/material.dart';

import '../../../core/di/loan_application_locator.dart';
import '../../../core/network/realtime_client.dart';
import '../../../models/field_records.dart';
import '../../../services/session_store.dart';
import '../../../utils/friendly_errors.dart';
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
  RembehSession? _session;

  List<FieldApplication> get applications => List.unmodifiable(_applications);
  bool get loading => _loading;
  String? get error => _error;

  Future<void> start(RembehSession session) async {
    final tenantChanged = _tenantId != null && _tenantId != session.tenantId;
    if (tenantChanged) {
      clearSessionState();
    }
    _tenantId = session.tenantId;
    _session = session;
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
    _session = null;
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
      final items = await LoanApplicationLocator.instance.listApplications();
      _applications
        ..clear()
        ..addAll(
          items
              .where(
                (item) =>
                    item.status == 'SUBMITTED' &&
                    _canShowOfficerRecord(
                      userId: item.officerUserId,
                      publicId: item.officerPublicId,
                      name: item.officerName,
                    ),
              )
              .map(_toFieldApplication),
        );
      _error = null;
    } catch (error) {
      _error = friendlyErrorMessage(error);
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
        case RecordsFilter.duePaidToday:
        case RecordsFilter.overduePaid:
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
              !item.registeredAt.isAfter(
                customRange.end.add(const Duration(days: 1)),
              );
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
      interestRatePercent: ((payload['interestRatePercent'] as num?) ?? 0)
          .round(),
      registeredAt:
          DateTime.tryParse(payload['registeredAt'] as String? ?? '') ??
          DateTime.now(),
      synced: payload['synced'] as bool? ?? true,
      officerUserId: payload['officerUserId'] as String?,
      officerName: payload['officerName'] as String?,
      officerPublicId: payload['officerPublicId'] as String?,
      branchId: payload['branchId'] as String?,
    );

    if (!_canShowOfficerRecord(
      userId: item.officerUserId,
      publicId: item.officerPublicId,
      name: item.officerName,
    )) {
      _applications.removeWhere((app) => app.id == id);
      notifyListeners();
      return;
    }

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
      officerUserId: item.officerUserId,
      officerName: item.officerName,
      officerPublicId: item.officerPublicId,
      branchId: item.branchId,
    );
  }

  bool _canShowOfficerRecord({
    required String? userId,
    required String? publicId,
    required String? name,
  }) {
    final session = _session;
    if (session == null || !session.usesFieldOfficerFloatForLoans) {
      return true;
    }

    final sessionUserId = session.userId?.trim();
    final itemUserId = userId?.trim();
    if (sessionUserId != null &&
        sessionUserId.isNotEmpty &&
        itemUserId != null &&
        itemUserId.isNotEmpty) {
      return sessionUserId == itemUserId;
    }

    final sessionPublicId = session.publicId?.trim();
    final itemPublicId = publicId?.trim();
    if (sessionPublicId != null &&
        sessionPublicId.isNotEmpty &&
        itemPublicId != null &&
        itemPublicId.isNotEmpty) {
      return sessionPublicId == itemPublicId;
    }

    final sessionName = session.userName.trim().toLowerCase();
    final itemName = name?.trim().toLowerCase();
    if (sessionName.isNotEmpty && itemName != null && itemName.isNotEmpty) {
      return sessionName == itemName;
    }

    return itemUserId == null && itemPublicId == null && itemName == null;
  }
}
