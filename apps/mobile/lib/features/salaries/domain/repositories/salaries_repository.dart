import '../../../../services/session_store.dart';
import '../models/salary_models.dart';

abstract class SalariesRepository {
  Future<SalariesDashboard> loadDashboard({
    required RembehSession session,
    String? branchId,
    String? cycleStart,
    String? search,
  });

  Future<List<SalaryAgentCandidate>> listAgentCandidates({
    required RembehSession session,
    String? branchId,
  });

  Future<SalaryEmployee> createEmployee({
    required RembehSession session,
    required Map<String, dynamic> input,
  });

  Future<({SalaryEmployee employee, SalaryOpenCashDay? openCashDay})> getEmployee({
    required RembehSession session,
    required String employeeId,
    String? cycleStart,
  });

  Future<SalaryEmployee> updateEmployee({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
  });

  Future<({SalaryEmployee employee, SalaryPayment payment})> recordPayment({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
    String? cycleStart,
  });

  Future<SalaryEmployee> reversePayment({
    required RembehSession session,
    required String paymentId,
    String? reason,
  });

  Future<SalaryHistory> loadHistory({
    required RembehSession session,
    required String employeeId,
  });
}
