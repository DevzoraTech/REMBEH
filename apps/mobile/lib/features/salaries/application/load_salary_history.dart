import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class LoadSalaryHistory {
  const LoadSalaryHistory(this.repository);

  final SalariesRepository repository;

  Future<SalaryHistory> call({
    required RembehSession session,
    required String employeeId,
  }) {
    return repository.loadHistory(session: session, employeeId: employeeId);
  }
}
