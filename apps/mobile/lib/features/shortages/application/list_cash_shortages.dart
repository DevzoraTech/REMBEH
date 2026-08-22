import '../../../services/session_store.dart';
import '../domain/models/cash_shortage.dart';
import '../domain/repositories/cash_shortages_repository.dart';

class ListCashShortages {
  const ListCashShortages(this.repository);

  final CashShortagesRepository repository;

  Future<List<CashShortage>> call({
    required RembehSession session,
    String? branchId,
    String? userId,
    String? status,
  }) {
    return repository.listShortages(
      session: session,
      branchId: branchId,
      userId: userId,
      status: status,
    );
  }
}
