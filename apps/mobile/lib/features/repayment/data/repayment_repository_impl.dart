import 'dart:typed_data';

import '../../../models/client_detail.dart' as ui;
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

  Future<List<Map<String, dynamic>>> offlineSnapshotClients() async {
    final payload = await _api.offlineSnapshot();
    return ((payload['clients'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
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
  Future<ClientLoanDetail> correctLoan({
    required String loanId,
    required Map<String, dynamic> values,
  }) async {
    final payload = await _api.correctLoan(loanId: loanId, values: values);
    return _detail(
      Map<String, dynamic>.from(payload['detail'] as Map? ?? const {}),
    );
  }

  @override
  Future<void> deleteLoan({
    required String loanId,
    required String reason,
  }) async {
    await _api.deleteLoan(loanId: loanId, reason: reason);
  }

  @override
  Future<ClientLoanDetail> uploadCorrectionMedia({
    required String loanId,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  }) async {
    final payload = await _api.uploadCorrectionMedia(
      loanId: loanId,
      mediaType: mediaType,
      bytes: bytes,
      mimeType: mimeType,
      fileName: fileName,
    );
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

  @override
  Future<void> requestRepaymentCorrection({
    required String repaymentId,
    required String reason,
    int? requestedAmount,
    String? requestedMethod,
    DateTime? requestedPaidAt,
    String? requestedNote,
  }) async {
    await _api.requestRepaymentCorrection(
      repaymentId: repaymentId,
      reason: reason,
      requestedAmount: requestedAmount,
      requestedMethod: requestedMethod,
      requestedPaidAt: requestedPaidAt,
      requestedNote: requestedNote,
    );
  }

  @override
  Future<ClientLoanDetail> applyRepaymentCorrection({
    required String repaymentId,
    required String loanId,
    required String reason,
    String? correctionRequestId,
    int? amount,
    String? method,
    DateTime? paidAt,
    String? note,
  }) async {
    final payload = await _api.applyRepaymentCorrection(
      repaymentId: repaymentId,
      reason: reason,
      correctionRequestId: correctionRequestId,
      amount: amount,
      method: method,
      paidAt: paidAt,
      note: note,
    );
    return _detail(
      Map<String, dynamic>.from(payload['detail'] as Map? ?? const {}),
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
      recordedByUserId: json['recordedByUserId'] as String?,
      recordedByName: json['recordedByName'] as String?,
      recordedByPublicId: json['recordedByPublicId'] as String?,
    );
  }

  ClientLoanDetail _detail(Map<String, dynamic> json) {
    return ClientLoanDetail(
      id: json['loanId'] as String? ?? json['id'] as String? ?? '',
      loanId: json['loanId'] as String? ?? json['id'] as String? ?? '',
      customerId: json['customerId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      nationalId: json['nationalId'] as String?,
      customerEmail: json['customerEmail'] as String?,
      registeredBy: json['registeredBy'] as String? ?? '',
      agentPhotoUrl: json['agentPhotoUrl'] as String?,
      outstanding: _money(json['outstanding']),
      lastPaymentAmount: _money(json['lastPaymentAmount']),
      lastPaymentAt: DateTime.tryParse(json['lastPaymentAt'] as String? ?? ''),
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
      principalAmount: _money(json['principalAmount']),
      openingBalance: json['openingBalance'] == null
          ? null
          : _money(json['openingBalance']),
      interestRatePercent: _int(json['interestRatePercent']),
      loanStartDate:
          DateTime.tryParse(json['loanStartDate'] as String? ?? '') ??
          DateTime.now(),
      maturityDate:
          DateTime.tryParse(json['maturityDate'] as String? ?? '') ??
          DateTime.now(),
      paymentStartDate: DateTime.tryParse(
        json['paymentStartDate'] as String? ?? '',
      ),
      status: json['status'] as String? ?? '',
      isFined: json['isFined'] as bool? ?? false,
      finesTotal: _money(json['finesTotal']),
      paymentHistory:
          ((json['paymentHistory'] as List?) ?? const [])
              .whereType<Map>()
              .map(
                (row) => PaymentHistoryItem(
                  id: row['id'] as String? ?? '',
                  amount: _money(row['amount']),
                  method: row['method'] as String? ?? 'CASH',
                  paidAt:
                      DateTime.tryParse(row['paidAt'] as String? ?? '') ??
                      DateTime.now(),
                  recordedByName: row['recordedByName'] as String? ?? '',
                  agentPhotoUrl: row['agentPhotoUrl'] as String?,
                  note: row['note'] as String?,
                  correctionLocked: row['correctionLocked'] as bool? ?? false,
                  canRequestCorrection:
                      row['canRequestCorrection'] as bool? ?? true,
                  pendingCorrectionRequestId:
                      row['pendingCorrectionRequestId'] as String?,
                  approvedCorrectionRequestId:
                      row['approvedCorrectionRequestId'] as String?,
                  officerCanEdit: row['officerCanEdit'] as bool? ?? false,
                  correctionAppliedAt: DateTime.tryParse(
                    row['correctionAppliedAt'] as String? ?? '',
                  ),
                ),
              )
              .toList()
            ..sort((a, b) => b.paidAt.compareTo(a.paidAt)),
      fineHistory:
          ((json['fineHistory'] as List?) ?? const [])
              .whereType<Map>()
              .map(
                (row) => FineHistoryItem(
                  id: row['id'] as String? ?? '',
                  periodIndex: _int(row['periodIndex']),
                  amount: _money(row['amount']),
                  dueAt:
                      DateTime.tryParse(row['dueAt'] as String? ?? '') ??
                      DateTime.now(),
                  appliedAt:
                      DateTime.tryParse(row['appliedAt'] as String? ?? '') ??
                      DateTime.now(),
                ),
              )
              .toList()
            ..sort((a, b) => b.periodIndex.compareTo(a.periodIndex)),
      media:
          ((json['media'] as List?) ?? const [])
              .whereType<Map>()
              .map(
                (row) => ClientLoanMediaItem(
                  id: row['id'] as String? ?? '',
                  mediaType: row['mediaType'] as String? ?? '',
                  fileName: row['fileName'] as String?,
                  mimeType: row['mimeType'] as String? ?? '',
                  byteSize: _int(row['byteSize']),
                  url: row['url'] as String?,
                  createdAt:
                      DateTime.tryParse(row['createdAt'] as String? ?? '') ??
                      DateTime.now(),
                ),
              )
              .toList()
            ..sort((a, b) => b.createdAt.compareTo(a.createdAt)),
      correctionAccess: ClientLoanCorrectionAccess.fromJson(
        json['correctionAccess'] is Map<String, dynamic>
            ? json['correctionAccess'] as Map<String, dynamic>
            : null,
      ),
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
ui.ClientDetail toUiClientDetail(ClientLoanDetail detail) {
  return ui.ClientDetail(
    id: detail.loanId,
    loanId: detail.loanId,
    customerId: detail.customerId,
    fullName: detail.fullName,
    phone: detail.phone,
    nationalId: detail.nationalId,
    customerEmail: detail.customerEmail,
    registeredBy: detail.registeredBy,
    agentPhotoUrl: detail.agentPhotoUrl,
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
    principalAmount: detail.principalAmount,
    openingBalance: detail.openingBalance,
    interestRatePercent: detail.interestRatePercent.toDouble(),
    loanStartDate: detail.loanStartDate,
    maturityDate: detail.maturityDate,
    paymentStartDate: detail.paymentStartDate,
    status: detail.status,
    isFined: detail.isFined,
    finesTotal: detail.finesTotal,
    paymentHistory: detail.paymentHistory
        .map(
          (item) => ui.ClientPaymentHistoryItem(
            id: item.id,
            amount: item.amount,
            method: item.method,
            paidAt: item.paidAt,
            recordedByName: item.recordedByName,
            agentPhotoUrl: item.agentPhotoUrl,
            note: item.note,
            correctionLocked: item.correctionLocked,
            canRequestCorrection: item.canRequestCorrection,
            pendingCorrectionRequestId: item.pendingCorrectionRequestId,
            approvedCorrectionRequestId: item.approvedCorrectionRequestId,
            officerCanEdit: item.officerCanEdit,
            correctionAppliedAt: item.correctionAppliedAt,
          ),
        )
        .toList(),
    fineHistory: detail.fineHistory
        .map(
          (item) => ui.ClientFineHistoryItem(
            id: item.id,
            periodIndex: item.periodIndex,
            amount: item.amount,
            dueAt: item.dueAt,
            appliedAt: item.appliedAt,
          ),
        )
        .toList(),
    media: detail.media
        .map(
          (item) => ui.ClientLoanMediaItem(
            id: item.id,
            mediaType: item.mediaType,
            fileName: item.fileName,
            mimeType: item.mimeType,
            byteSize: item.byteSize,
            url: item.url,
            createdAt: item.createdAt,
          ),
        )
        .toList(),
    correctionAccess: ui.ClientCorrectionAccess(
      enabled: detail.correctionAccess.enabled,
      source: detail.correctionAccess.source,
      reason: detail.correctionAccess.reason,
    ),
  );
}
