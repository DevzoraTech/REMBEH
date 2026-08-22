import '../../../services/session_store.dart';
import '../domain/models/cash_shortage.dart';
import '../domain/repositories/cash_shortages_repository.dart';

class GetCashShortage {
  const GetCashShortage(this.repository);

  final CashShortagesRepository repository;

  Future<CashShortage> call({
    required RembehSession session,
    required String shortageId,
  }) {
    return repository.getShortage(session: session, shortageId: shortageId);
  }
}
