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

class RecordRepaymentUseCase {
  RecordRepaymentUseCase(this._repository);
  final RepaymentRepository _repository;
  Future<({FieldRepayment repayment, ClientLoanDetail detail})> call({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  }) =>
      _repository.recordRepayment(
        loanId: loanId,
        amount: amount,
        note: note,
        method: method,
        paidAt: paidAt,
      );
}
