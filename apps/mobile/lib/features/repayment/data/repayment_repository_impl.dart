import '../../../models/client_detail.dart';
import '../../../models/field_records.dart';
import '../domain/entities/client_loan_detail.dart';
import '../domain/repositories/repayment_repository.dart';
import 'repayment_api_datasource.dart';

class RepaymentRepositoryImpl implements RepaymentRepository {
  RepaymentRepositoryImpl(this._api);

  final RepaymentApiDatasource _api;

  @override
  Future<HomeSummary> getSummary() async {
    final payload = await _api.getSummary();
    final summary = Map<String, dynamic>.from(
      payload['summary'] as Map? ?? const {},
    );
    final clients = ((summary['clientsDueToday'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => _dueClient(Map<String, dynamic>.from(item)))
        .toList();
    return HomeSummary(
      amountCollectedToday: _money(summary['amountCollectedToday']),
      repaymentsTodayCount: _int(summary['repaymentsTodayCount']),
      dueTodayCount: _int(summary['dueTodayCount']),
      newApplicationsTodayCount: 0,
      pendingSyncCount: _int(summary['pendingSyncCount']),
      clientsDueToday: clients,
    );
  }

  @override
  Future<List<FieldRepayment>> listRepayments({String? filter}) async {
    final payload = await _api.listRepayments(filter: filter);
    return ((payload['repayments'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => _repayment(Map<String, dynamic>.from(item)))
        .toList();
  }

  @override
  Future<List<DueClient>> listDueToday() async {
    final payload = await _api.listDueToday();
    return ((payload['clients'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => _dueClient(Map<String, dynamic>.from(item)))
        .toList();
  }

  @override
  Future<List<ClientLoanDetail>> searchClients(String query) async {
    final payload = await _api.searchClients(query);
    return ((payload['clients'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => _detail(Map<String, dynamic>.from(item)))
        .toList();
  }

  @override
  Future<ClientLoanDetail> getLoanDetail(String loanId) async {
    final payload = await _api.getLoanDetail(loanId);
    return _detail(
      Map<String, dynamic>.from(payload['detail'] as Map? ?? const {}),
    );
  }

  @override
  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
      recordRepayment({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  }) async {
    final payload = await _api.recordRepayment(
      loanId: loanId,
      amount: amount,
      note: note,
      method: method,
      paidAt: paidAt,
    );
    return (
      repayment: _repayment(
        Map<String, dynamic>.from(payload['repayment'] as Map? ?? const {}),
      ),
      detail: _detail(
        Map<String, dynamic>.from(payload['detail'] as Map? ?? const {}),
      ),
    );
  }

  DueClient _dueClient(Map<String, dynamic> json) {
    return DueClient(
      id: json['loanId'] as String? ?? json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      amountPaid: _money(json['amountPaid']),
      loanAmount: _money(json['loanAmount']),
      amountDue: _money(json['amountDue']),
      lastActivityAt:
          DateTime.tryParse(json['lastActivityAt'] as String? ?? '') ??
              DateTime.now(),
      synced: json['synced'] as bool? ?? true,
    );
  }

  FieldRepayment _repayment(Map<String, dynamic> json) {
    return FieldRepayment(
      id: json['id'] as String? ?? '',
      loanId: json['loanId'] as String? ?? '',
      clientName: json['clientName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      amount: _money(json['amount']),
      amountPaid: _money(json['amountPaid']),
      loanAmount: _money(json['loanAmount']),
      recordedAt:
          DateTime.tryParse(json['recordedAt'] as String? ?? '') ??
              DateTime.now(),
      synced: json['synced'] as bool? ?? true,
      dueToday: json['dueToday'] as bool? ?? false,
    );
  }

  ClientLoanDetail _detail(Map<String, dynamic> json) {
    return ClientLoanDetail(
      id: json['loanId'] as String? ?? json['id'] as String? ?? '',
      loanId: json['loanId'] as String? ?? json['id'] as String? ?? '',
      customerId: json['customerId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      registeredBy: json['registeredBy'] as String? ?? '',
      outstanding: _money(json['outstanding']),
      lastPaymentAmount: _money(json['lastPaymentAmount']),
      lastPaymentAt:
          DateTime.tryParse(json['lastPaymentAt'] as String? ?? ''),
      lastPaymentBy: json['lastPaymentBy'] as String?,
      expectedToday: _money(json['expectedToday']),
      carriedForward: _money(json['carriedForward']),
      dailyInstalment: _money(json['dailyInstalment']),
      loanPeriodDays: _int(json['loanPeriodDays']),
      daysLeft: _int(json['daysLeft']),
      nextDueLabel: json['nextDueLabel'] as String? ?? '',
      nextDueIsToday: json['nextDueIsToday'] as bool? ?? false,
      paidAmount: _money(json['paidAmount']),
      loanAmount: _money(json['loanAmount']),
      interestRatePercent: _int(json['interestRatePercent']),
      loanStartDate:
          DateTime.tryParse(json['loanStartDate'] as String? ?? '') ??
              DateTime.now(),
      maturityDate:
          DateTime.tryParse(json['maturityDate'] as String? ?? '') ??
              DateTime.now(),
    );
  }

  int _money(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  int _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

/// Maps domain detail into the existing UI `ClientDetail` model.
ClientDetail toUiClientDetail(ClientLoanDetail detail) {
  return ClientDetail(
    id: detail.loanId,
    loanId: detail.loanId,
    customerId: detail.customerId,
    fullName: detail.fullName,
    phone: detail.phone,
    registeredBy: detail.registeredBy,
    outstanding: detail.outstanding,
    lastPaymentAmount: detail.lastPaymentAmount,
    lastPaymentAt: detail.lastPaymentAt,
    lastPaymentBy: detail.lastPaymentBy,
    expectedToday: detail.expectedToday,
    carriedForward: detail.carriedForward,
    dailyInstalment: detail.dailyInstalment,
    loanPeriodDays: detail.loanPeriodDays,
    daysLeft: detail.daysLeft,
    nextDueLabel: detail.nextDueLabel,
    nextDueIsToday: detail.nextDueIsToday,
    paidAmount: detail.paidAmount,
    loanAmount: detail.loanAmount,
    interestRatePercent: detail.interestRatePercent.toDouble(),
    loanStartDate: detail.loanStartDate,
    maturityDate: detail.maturityDate,
  );
}
