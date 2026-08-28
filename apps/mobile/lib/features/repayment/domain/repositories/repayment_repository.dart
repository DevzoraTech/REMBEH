import '../../../../models/field_records.dart';
import '../entities/client_loan_detail.dart';

abstract class RepaymentRepository {
  Future<HomeSummary> getSummary();

  Future<List<FieldRepayment>> listRepayments({String? filter});

  Future<List<DueClient>> listDueToday();

  Future<List<ClientLoanDetail>> searchClients(String query);

  Future<ClientLoanDetail> getLoanDetail(String loanId);

  Future<ClientLoanDetail> correctLoan({
    required String loanId,
    required Map<String, dynamic> values,
  });

  Future<void> deleteLoan({required String loanId, required String reason});

  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
  recordRepayment({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  });
}
