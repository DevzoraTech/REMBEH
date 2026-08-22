import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class SaveSalaryEmployee {
  const SaveSalaryEmployee(this.repository);

  final SalariesRepository repository;

  Future<SalaryEmployee> create({
    required RembehSession session,
    required Map<String, dynamic> input,
  }) {
    return repository.createEmployee(session: session, input: input);
  }

  Future<SalaryEmployee> update({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
  }) {
    return repository.updateEmployee(
      session: session,
      employeeId: employeeId,
      input: input,
    );
  }
}
