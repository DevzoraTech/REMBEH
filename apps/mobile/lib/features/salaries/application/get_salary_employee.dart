import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class GetSalaryEmployee {
  const GetSalaryEmployee(this.repository);

  final SalariesRepository repository;

  Future<({SalaryEmployee employee, SalaryOpenCashDay? openCashDay})> call({
    required RembehSession session,
    required String employeeId,
    String? cycleStart,
  }) {
    return repository.getEmployee(
      session: session,
      employeeId: employeeId,
      cycleStart: cycleStart,
    );
  }
}
