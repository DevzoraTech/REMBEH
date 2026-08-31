import '../../../models/field_records.dart';
import '../domain/entities/client_loan_detail.dart';
import '../domain/repositories/repayment_repository.dart';

class GetCollectionSummaryUseCase {
  GetCollectionSummaryUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<HomeSummary> call() => _repository.getSummary();
}

class ListRepaymentsUseCase {
  ListRepaymentsUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<List<FieldRepayment>> call({String? filter}) =>
      _repository.listRepayments(filter: filter);
}

class SearchClientsUseCase {
  SearchClientsUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<List<ClientLoanDetail>> call(String query) =>
      _repository.searchClients(query);
}

class GetLoanDetailUseCase {
  GetLoanDetailUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<ClientLoanDetail> call(String loanId) =>
      _repository.getLoanDetail(loanId);
}

class CorrectLoanUseCase {
  CorrectLoanUseCase(this._repository);
  final RepaymentRepository _repository;

  Future<ClientLoanDetail> call({
    required String loanId,
    required Map<String, dynamic> values,
  }) => _repository.correctLoan(loanId: loanId, values: values);
}

class DeleteLoanUseCase {
  DeleteLoanUseCase(this._repository);
  final RepaymentRepository _repository;

  Future<void> call({required String loanId, required String reason}) =>
      _repository.deleteLoan(loanId: loanId, reason: reason);
}

class RecordRepaymentUseCase {
  RecordRepaymentUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<({FieldRepayment repayment, ClientLoanDetail detail})> call({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  }) => _repository.recordRepayment(
    loanId: loanId,
    amount: amount,
    note: note,
    method: method,
    paidAt: paidAt,
  );
}

class RequestRepaymentCorrectionUseCase {
  RequestRepaymentCorrectionUseCase(this._repository);
  final RepaymentRepository _repository;

  Future<void> call({
    required String repaymentId,
    required String reason,
    int? requestedAmount,
    String? requestedMethod,
    DateTime? requestedPaidAt,
    String? requestedNote,
  }) => _repository.requestRepaymentCorrection(
    repaymentId: repaymentId,
    reason: reason,
    requestedAmount: requestedAmount,
    requestedMethod: requestedMethod,
    requestedPaidAt: requestedPaidAt,
    requestedNote: requestedNote,
  );
}

class ApplyRepaymentCorrectionUseCase {
  ApplyRepaymentCorrectionUseCase(this._repository);
  final RepaymentRepository _repository;

  Future<ClientLoanDetail> call({
    required String repaymentId,
    required String loanId,
    required String reason,
    String? correctionRequestId,
    int? amount,
    String? method,
    DateTime? paidAt,
    String? note,
  }) => _repository.applyRepaymentCorrection(
    repaymentId: repaymentId,
    loanId: loanId,
    reason: reason,
    correctionRequestId: correctionRequestId,
    amount: amount,
    method: method,
    paidAt: paidAt,
    note: note,
  );
}
