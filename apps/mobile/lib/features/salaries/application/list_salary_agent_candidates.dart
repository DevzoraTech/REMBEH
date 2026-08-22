import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class ListSalaryAgentCandidates {
  const ListSalaryAgentCandidates(this.repository);

  final SalariesRepository repository;

  Future<List<SalaryAgentCandidate>> call({
    required RembehSession session,
    String? branchId,
  }) {
    return repository.listAgentCandidates(session: session, branchId: branchId);
  }
}
