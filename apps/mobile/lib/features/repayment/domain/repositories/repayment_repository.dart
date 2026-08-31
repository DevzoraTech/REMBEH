import '../../../../models/field_records.dart';
import '../entities/client_loan_detail.dart';
import 'dart:typed_data';

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

  Future<ClientLoanDetail> uploadCorrectionMedia({
    required String loanId,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  });

  Future<({FieldRepayment repayment, ClientLoanDetail detail})>
  recordRepayment({
    required String loanId,
    required int amount,
    String? note,
    String method = 'CASH',
    DateTime? paidAt,
  });

  Future<void> requestRepaymentCorrection({
    required String repaymentId,
    required String reason,
    int? requestedAmount,
    String? requestedMethod,
    DateTime? requestedPaidAt,
    String? requestedNote,
  });

  Future<ClientLoanDetail> applyRepaymentCorrection({
    required String repaymentId,
    required String loanId,
    required String reason,
    String? correctionRequestId,
    int? amount,
    String? method,
    DateTime? paidAt,
    String? note,
  });
}
