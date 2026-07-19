import 'package:flutter/material.dart';

import '../models/client_detail.dart';
import '../models/field_records.dart';

/// Local field ledger until repayments / applications APIs land.
class FieldRecordsStore {
  FieldRecordsStore._() {
    _seed();
  }

  static final FieldRecordsStore instance = FieldRecordsStore._();

  final List<FieldRepayment> _repayments = [];
  final List<FieldApplication> _applications = [];
  final List<DueClient> _dueClients = [];
  final List<ClientDetail> _clients = [];
  final List<String> _recentClientIds = [];

  DateTimeRange? customRange;

  void _seed() {
    final now = DateTime.now();
    final todayMorning = DateTime(now.year, now.month, now.day, 9, 12);
    final todayMid = DateTime(now.year, now.month, now.day, 10, 42);
    final yesterday = DateTime(now.year, now.month, now.day, 16, 15)
        .subtract(const Duration(days: 1));
    final lastWeek = now.subtract(const Duration(days: 5));
    final lastMonth = DateTime(now.year, now.month - 1, 12, 15, 10);

    _repayments
      ..clear()
      ..addAll([
        FieldRepayment(
          id: 'rp-1',
          clientName: 'John Ssempijja',
          phone: '0772 123 456',
          amount: 70000,
          amountPaid: 1450000,
          loanAmount: 2300000,
          recordedAt: todayMid,
          synced: true,
          dueToday: true,
        ),
        FieldRepayment(
          id: 'rp-2',
          clientName: 'Sarah Namukasa',
          phone: '0701 987 654',
          amount: 50000,
          amountPaid: 750000,
          loanAmount: 1200000,
          recordedAt: yesterday,
          synced: false,
          dueToday: true,
        ),
        FieldRepayment(
          id: 'rp-3',
          clientName: 'Peter Okello',
          phone: '0755 222 111',
          amount: 100000,
          amountPaid: 960000,
          loanAmount: 1600000,
          recordedAt: todayMorning,
          synced: true,
          dueToday: true,
        ),
        FieldRepayment(
          id: 'rp-4',
          clientName: 'Amina Nalubega',
          phone: '0782 444 333',
          amount: 40000,
          amountPaid: 490000,
          loanAmount: 800000,
          recordedAt: todayMorning.add(const Duration(hours: 1)),
          synced: false,
          dueToday: true,
        ),
        FieldRepayment(
          id: 'rp-5',
          clientName: 'David Kato',
          phone: '0760 111 222',
          amount: 125000,
          amountPaid: 600000,
          loanAmount: 1500000,
          recordedAt: lastWeek,
          synced: true,
          dueToday: false,
        ),
        FieldRepayment(
          id: 'rp-6',
          clientName: 'Grace Atim',
          phone: '0777 100 200',
          amount: 30000,
          amountPaid: 30000,
          loanAmount: 800000,
          recordedAt: lastMonth,
          synced: true,
          dueToday: false,
        ),
      ]);

    // Applications are loaded live from the API (ApplicationsLiveStore).
    _applications.clear();

    _dueClients
      ..clear()
      ..addAll([
        DueClient(
          id: 'dc-1',
          fullName: 'John Ssempijja',
          phone: '0772 123 456',
          amountPaid: 1450000,
          loanAmount: 2300000,
          amountDue: 70000,
          lastActivityAt: todayMid,
          synced: true,
        ),
        DueClient(
          id: 'dc-2',
          fullName: 'Sarah Namukasa',
          phone: '0701 987 654',
          amountPaid: 750000,
          loanAmount: 1200000,
          amountDue: 50000,
          lastActivityAt: yesterday,
          synced: false,
        ),
        DueClient(
          id: 'dc-3',
          fullName: 'Peter Okello',
          phone: '0755 222 111',
          amountPaid: 960000,
          loanAmount: 1600000,
          amountDue: 100000,
          lastActivityAt: todayMorning,
          synced: true,
        ),
        DueClient(
          id: 'dc-4',
          fullName: 'Amina Nalubega',
          phone: '0782 444 333',
          amountPaid: 490000,
          loanAmount: 800000,
          amountDue: 40000,
          lastActivityAt: todayMorning.add(const Duration(hours: 1)),
          synced: false,
        ),
      ]);

    _clients
      ..clear()
      ..addAll([
        ClientDetail(
          id: 'dc-1',
          fullName: 'John Ssempijja',
          phone: '0772 123 456',
          registeredBy: 'Bashir',
          outstanding: 850000,
          lastPaymentAmount: 50000,
          lastPaymentAt: DateTime(now.year, now.month, now.day - 2, 11, 20),
          lastPaymentBy: 'Peter',
          expectedToday: 70000,
          carriedForward: 20000,
          dailyInstalment: 50000,
          loanPeriodDays: 30,
          daysLeft: 12,
          nextDueLabel: 'Today',
          nextDueIsToday: true,
          paidAmount: 1450000,
          loanAmount: 2300000,
          interestRatePercent: 5,
          loanStartDate: DateTime(now.year, now.month, now.day - 18),
          maturityDate: DateTime(now.year, now.month, now.day + 12),
        ),
        ClientDetail(
          id: 'dc-2',
          fullName: 'Sarah Namukasa',
          phone: '0701 987 654',
          registeredBy: 'Bashir',
          outstanding: 450000,
          lastPaymentAmount: 50000,
          lastPaymentAt: yesterday,
          lastPaymentBy: 'Bonny',
          expectedToday: 50000,
          carriedForward: 0,
          dailyInstalment: 50000,
          loanPeriodDays: 45,
          daysLeft: 20,
          nextDueLabel: 'Today',
          nextDueIsToday: true,
          paidAmount: 750000,
          loanAmount: 1200000,
          interestRatePercent: 18,
          loanStartDate: DateTime(now.year, now.month, now.day - 25),
          maturityDate: DateTime(now.year, now.month, now.day + 20),
        ),
        ClientDetail(
          id: 'dc-3',
          fullName: 'Peter Okello',
          phone: '0755 222 111',
          registeredBy: 'Amina',
          outstanding: 640000,
          lastPaymentAmount: 100000,
          lastPaymentAt: todayMorning,
          lastPaymentBy: 'Bonny',
          expectedToday: 100000,
          carriedForward: 0,
          dailyInstalment: 80000,
          loanPeriodDays: 60,
          daysLeft: 30,
          nextDueLabel: 'Today',
          nextDueIsToday: true,
          paidAmount: 960000,
          loanAmount: 1600000,
          interestRatePercent: 16,
          loanStartDate: DateTime(now.year, now.month, now.day - 30),
          maturityDate: DateTime(now.year, now.month, now.day + 30),
        ),
        ClientDetail(
          id: 'dc-4',
          fullName: 'Amina Nalubega',
          phone: '0782 444 333',
          registeredBy: 'Bashir',
          outstanding: 310000,
          lastPaymentAmount: 40000,
          lastPaymentAt: todayMorning.add(const Duration(hours: 1)),
          lastPaymentBy: 'Peter',
          expectedToday: 40000,
          carriedForward: 0,
          dailyInstalment: 40000,
          loanPeriodDays: 30,
          daysLeft: 8,
          nextDueLabel: 'Today',
          nextDueIsToday: true,
          paidAmount: 490000,
          loanAmount: 800000,
          interestRatePercent: 20,
          loanStartDate: DateTime(now.year, now.month, now.day - 22),
          maturityDate: DateTime(now.year, now.month, now.day + 8),
        ),
        ClientDetail(
          id: 'ap-3',
          fullName: 'Grace Atim',
          phone: '0777 100 200',
          registeredBy: 'Bonny',
          outstanding: 0,
          lastPaymentAmount: 0,
          lastPaymentAt: todayMorning,
          lastPaymentBy: '—',
          expectedToday: 0,
          carriedForward: 0,
          dailyInstalment: 0,
          loanPeriodDays: 30,
          daysLeft: 30,
          nextDueLabel: 'Pending',
          nextDueIsToday: false,
          paidAmount: 0,
          loanAmount: 800000,
          interestRatePercent: 22,
          loanStartDate: todayMorning,
          maturityDate: todayMorning.add(const Duration(days: 30)),
        ),
        ClientDetail(
          id: 'ap-4',
          fullName: 'Brian Mugisha',
          phone: '0702 300 400',
          registeredBy: 'Bashir',
          outstanding: 0,
          lastPaymentAmount: 0,
          lastPaymentAt: todayMid,
          lastPaymentBy: '—',
          expectedToday: 0,
          carriedForward: 0,
          dailyInstalment: 0,
          loanPeriodDays: 45,
          daysLeft: 45,
          nextDueLabel: 'Pending',
          nextDueIsToday: false,
          paidAmount: 0,
          loanAmount: 2500000,
          interestRatePercent: 16,
          loanStartDate: todayMid,
          maturityDate: todayMid.add(const Duration(days: 45)),
        ),
        ClientDetail(
          id: 'ap-5',
          fullName: 'Faith Achieng',
          phone: '0751 500 600',
          registeredBy: 'Bonny',
          outstanding: 0,
          lastPaymentAmount: 0,
          lastPaymentAt: lastWeek,
          lastPaymentBy: '—',
          expectedToday: 0,
          carriedForward: 0,
          dailyInstalment: 0,
          loanPeriodDays: 30,
          daysLeft: 30,
          nextDueLabel: 'Pending',
          nextDueIsToday: false,
          paidAmount: 0,
          loanAmount: 1200000,
          interestRatePercent: 20,
          loanStartDate: lastWeek,
          maturityDate: lastWeek.add(const Duration(days: 30)),
        ),
        ClientDetail(
          id: 'ap-6',
          fullName: 'James Opio',
          phone: '0788 900 100',
          registeredBy: 'Amina',
          outstanding: 0,
          lastPaymentAmount: 0,
          lastPaymentAt: lastMonth,
          lastPaymentBy: '—',
          expectedToday: 0,
          carriedForward: 0,
          dailyInstalment: 0,
          loanPeriodDays: 30,
          daysLeft: 30,
          nextDueLabel: 'Pending',
          nextDueIsToday: false,
          paidAmount: 0,
          loanAmount: 500000,
          interestRatePercent: 24,
          loanStartDate: lastMonth,
          maturityDate: lastMonth.add(const Duration(days: 30)),
        ),
        ClientDetail(
          id: 'rp-5',
          fullName: 'David Kato',
          phone: '0760 111 222',
          registeredBy: 'Bashir',
          outstanding: 900000,
          lastPaymentAmount: 125000,
          lastPaymentAt: lastWeek,
          lastPaymentBy: 'Bonny',
          expectedToday: 0,
          carriedForward: 0,
          dailyInstalment: 75000,
          loanPeriodDays: 40,
          daysLeft: 15,
          nextDueLabel: 'Tomorrow',
          nextDueIsToday: false,
          paidAmount: 600000,
          loanAmount: 1500000,
          interestRatePercent: 15,
          loanStartDate: lastWeek.subtract(const Duration(days: 10)),
          maturityDate: now.add(const Duration(days: 15)),
        ),
      ]);
  }

  ClientDetail? clientDetail({
    String? id,
    String? phone,
    String? fullName,
  }) {
    final normalizedPhone = _normalizePhone(phone);
    for (final client in _clients) {
      if (id != null && client.id == id) return client;
      if (normalizedPhone.isNotEmpty &&
          _normalizePhone(client.phone) == normalizedPhone) {
        return client;
      }
      if (fullName != null &&
          client.fullName.toLowerCase() == fullName.trim().toLowerCase()) {
        return client;
      }
    }

    DueClient? due;
    for (final item in _dueClients) {
      final matchId = id != null && item.id == id;
      final matchPhone = normalizedPhone.isNotEmpty &&
          _normalizePhone(item.phone) == normalizedPhone;
      final matchName = fullName != null &&
          item.fullName.toLowerCase() == fullName.trim().toLowerCase();
      if (matchId || matchPhone || matchName) {
        due = item;
        break;
      }
    }
    if (due == null) return null;

    final now = DateTime.now();
    return ClientDetail(
      id: due.id,
      fullName: due.fullName,
      phone: due.phone,
      registeredBy: 'Agent',
      outstanding: due.loanAmount - due.amountPaid,
      lastPaymentAmount: due.amountDue,
      lastPaymentAt: due.lastActivityAt,
      lastPaymentBy: 'Agent',
      expectedToday: due.amountDue,
      carriedForward: 0,
      dailyInstalment: due.amountDue,
      loanPeriodDays: 30,
      daysLeft: 12,
      nextDueLabel: 'Today',
      nextDueIsToday: true,
      paidAmount: due.amountPaid,
      loanAmount: due.loanAmount,
      interestRatePercent: 5,
      loanStartDate: now.subtract(const Duration(days: 18)),
      maturityDate: now.add(const Duration(days: 12)),
    );
  }

  String _normalizePhone(String? phone) =>
      (phone ?? '').replaceAll(RegExp(r'\s+'), '');

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _inCurrentWeek(DateTime value, DateTime now) {
    final start = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
    final end = start.add(const Duration(days: 7));
    return !value.isBefore(start) && value.isBefore(end);
  }

  bool _inCurrentMonth(DateTime value, DateTime now) =>
      value.year == now.year && value.month == now.month;

  bool _inCustomRange(DateTime value) {
    final range = customRange;
    if (range == null) return true;
    final day = DateTime(value.year, value.month, value.day);
    final start = DateTime(range.start.year, range.start.month, range.start.day);
    final end = DateTime(range.end.year, range.end.month, range.end.day);
    return !day.isBefore(start) && !day.isAfter(end);
  }

  HomeSummary summary({DateTime? now}) {
    final moment = now ?? DateTime.now();
    final todayRepayments = _repayments
        .where((item) => _isSameDay(item.recordedAt, moment))
        .toList();
    final amountCollected = todayRepayments.fold<int>(
      0,
      (sum, item) => sum + item.amount,
    );
    final pendingSync = _repayments.where((item) => !item.synced).length;
    final appsToday = _applications
        .where((item) => _isSameDay(item.registeredAt, moment))
        .length;

    return HomeSummary(
      amountCollectedToday: amountCollected,
      repaymentsTodayCount: todayRepayments.length,
      dueTodayCount: _dueClients.length,
      newApplicationsTodayCount: appsToday,
      pendingSyncCount: pendingSync,
      clientsDueToday: List.unmodifiable(_dueClients),
    );
  }

  List<FieldRepayment> repayments({RecordsFilter filter = RecordsFilter.all}) {
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));

    return _repayments.where((item) {
      switch (filter) {
        case RecordsFilter.all:
          return true;
        case RecordsFilter.dueToday:
          return item.dueToday;
        case RecordsFilter.collectedToday:
        case RecordsFilter.today:
          return _isSameDay(item.recordedAt, now);
        case RecordsFilter.yesterday:
          return _isSameDay(item.recordedAt, yesterday);
        case RecordsFilter.thisWeek:
          return _inCurrentWeek(item.recordedAt, now);
        case RecordsFilter.thisMonth:
          return _inCurrentMonth(item.recordedAt, now);
        case RecordsFilter.pendingSync:
          return !item.synced;
        case RecordsFilter.uploaded:
          return item.synced;
        case RecordsFilter.custom:
          return _inCustomRange(item.recordedAt);
      }
    }).toList();
  }

  List<FieldApplication> applications({
    RecordsFilter filter = RecordsFilter.all,
  }) {
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));

    return _applications.where((item) {
      switch (filter) {
        case RecordsFilter.all:
        case RecordsFilter.dueToday:
          return true;
        case RecordsFilter.today:
        case RecordsFilter.collectedToday:
          return _isSameDay(item.registeredAt, now);
        case RecordsFilter.yesterday:
          return _isSameDay(item.registeredAt, yesterday);
        case RecordsFilter.thisWeek:
          return _inCurrentWeek(item.registeredAt, now);
        case RecordsFilter.thisMonth:
          return _inCurrentMonth(item.registeredAt, now);
        case RecordsFilter.pendingSync:
          return !item.synced;
        case RecordsFilter.uploaded:
          return item.synced;
        case RecordsFilter.custom:
          return _inCustomRange(item.registeredAt);
      }
    }).toList();
  }

  List<DueClient> searchClients(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return List.unmodifiable(_dueClients);
    return _dueClients
        .where(
          (client) =>
              client.fullName.toLowerCase().contains(q) ||
              client.phone.replaceAll(' ', '').contains(q.replaceAll(' ', '')),
        )
        .toList();
  }

  List<ClientDetail> searchClientDetails(String query) {
    final q = query.trim().toLowerCase();
    final digits = q.replaceAll(RegExp(r'\s+'), '');
    return _clients
        .where(
          (client) =>
              client.fullName.toLowerCase().contains(q) ||
              _normalizePhone(client.phone).contains(digits),
        )
        .toList();
  }

  List<ClientDetail> recentClients() {
    if (_recentClientIds.isEmpty) {
      // Seed recent from active due clients until the agent opens profiles.
      return _dueClients
          .map((due) => clientDetail(id: due.id, phone: due.phone))
          .whereType<ClientDetail>()
          .toList();
    }

    final recent = <ClientDetail>[];
    for (final id in _recentClientIds) {
      final match = clientDetail(id: id);
      if (match != null) recent.add(match);
    }
    return recent;
  }

  void markClientRecent(String clientId) {
    _recentClientIds.remove(clientId);
    _recentClientIds.insert(0, clientId);
    if (_recentClientIds.length > 8) {
      _recentClientIds.removeRange(8, _recentClientIds.length);
    }
  }

  void clearRecentClients() => _recentClientIds.clear();

  void refreshSeed() => _seed();
}
