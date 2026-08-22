import '../../../../services/session_store.dart';
import '../domain/models/salary_models.dart';
import '../domain/repositories/salaries_repository.dart';

class ReverseSalaryPayment {
  const ReverseSalaryPayment(this.repository);

  final SalariesRepository repository;

  Future<SalaryEmployee> call({
    required RembehSession session,
    required String paymentId,
    String? reason,
  }) {
    return repository.reversePayment(
      session: session,
      paymentId: paymentId,
      reason: reason,
    );
  }
}
