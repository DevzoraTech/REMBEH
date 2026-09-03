import '../../../services/session_store.dart';
import '../domain/models/cash_shortage.dart';
import '../domain/repositories/cash_shortages_repository.dart';

class SettleEmployeeShortage {
  const SettleEmployeeShortage(this.repository);

  final CashShortagesRepository repository;

  Future<CashShortage> call({
    required RembehSession session,
    required String responsibleUserId,
    required num amount,
    String method = 'CASH',
    String? notes,
  }) {
    return repository.settleEmployee(
      session: session,
      responsibleUserId: responsibleUserId,
      amount: amount,
      method: method,
      notes: notes,
    );
  }
}
