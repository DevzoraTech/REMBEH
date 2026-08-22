import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class RecordSalaryPayment {
  const RecordSalaryPayment(this.repository);

  final SalariesRepository repository;

  Future<({SalaryEmployee employee, SalaryPayment payment})> call({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
    String? cycleStart,
  }) {
    return repository.recordPayment(
      session: session,
      employeeId: employeeId,
      input: input,
      cycleStart: cycleStart,
    );
  }
}
