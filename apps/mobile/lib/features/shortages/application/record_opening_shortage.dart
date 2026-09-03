import '../../../services/session_store.dart';
import '../domain/models/cash_shortage.dart';
import '../domain/repositories/cash_shortages_repository.dart';

class RecordOpeningShortage {
  const RecordOpeningShortage(this.repository);

  final CashShortagesRepository repository;

  Future<CashShortage> call({
    required RembehSession session,
    required String employeeId,
    required num amount,
    String? notes,
    String? operationDate,
  }) {
    return repository.recordOpeningShortage(
      session: session,
      employeeId: employeeId,
      amount: amount,
      notes: notes,
      operationDate: operationDate,
    );
  }
}
