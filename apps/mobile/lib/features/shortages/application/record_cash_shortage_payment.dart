import '../../../services/session_store.dart';
import '../domain/models/cash_shortage.dart';
import '../domain/repositories/cash_shortages_repository.dart';

class RecordCashShortagePayment {
  const RecordCashShortagePayment(this.repository);

  final CashShortagesRepository repository;

  Future<CashShortage> call({
    required RembehSession session,
    required String shortageId,
    required num amount,
    String method = 'CASH',
    String? notes,
  }) {
    return repository.recordPayment(
      session: session,
      shortageId: shortageId,
      amount: amount,
      method: method,
      notes: notes,
    );
  }
}
