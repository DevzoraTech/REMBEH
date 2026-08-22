import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class LoadSalariesDashboard {
  const LoadSalariesDashboard(this.repository);

  final SalariesRepository repository;

  Future<SalariesDashboard> call({
    required RembehSession session,
    String? branchId,
    String? cycleStart,
    String? search,
  }) {
    return repository.loadDashboard(
      session: session,
      branchId: branchId,
      cycleStart: cycleStart,
      search: search,
    );
  }
}
