import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../domain/models/salary_models.dart';
import '../../domain/repositories/salaries_repository.dart';
import '../mappers/salary_mapper.dart';

class SalariesRepositoryImpl implements SalariesRepository {
  const SalariesRepositoryImpl({required this.apiClient});

  final ApiClient apiClient;

  @override
  Future<SalariesDashboard> loadDashboard({
    required RembehSession session,
    String? branchId,
    String? cycleStart,
    String? search,
  }) async {
    final body = await apiClient.getSalariesDashboard(
      session: session,
      branchId: branchId,
      cycleStart: cycleStart,
      search: search,
    );
    return SalaryMapper.dashboardFromJson(body);
  }

  @override
  Future<List<SalaryAgentCandidate>> listAgentCandidates({
    required RembehSession session,
    String? branchId,
  }) async {
    final rows = await apiClient.listSalaryAgentCandidates(
      session: session,
      branchId: branchId,
    );
    return rows.map(SalaryMapper.agentCandidateFromJson).toList();
  }

  @override
  Future<SalaryEmployee> createEmployee({
    required RembehSession session,
    required Map<String, dynamic> input,
  }) async {
    final body = await apiClient.createSalaryEmployee(
      session: session,
      body: input,
    );
    return SalaryMapper.employeeFromJson(
      body['employee'] as Map<String, dynamic>? ?? const {},
    );
  }

  @override
  Future<SalaryEmployee> getEmployee({
    required RembehSession session,
    required String employeeId,
    String? cycleStart,
  }) async {
    final body = await apiClient.getSalaryEmployee(
      session: session,
      employeeId: employeeId,
      cycleStart: cycleStart,
    );
    return SalaryMapper.employeeFromJson(
      body['employee'] as Map<String, dynamic>? ?? const {},
    );
  }

  @override
  Future<SalaryEmployee> updateEmployee({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
  }) async {
    final body = await apiClient.updateSalaryEmployee(
      session: session,
      employeeId: employeeId,
      body: input,
    );
    return SalaryMapper.employeeFromJson(
      body['employee'] as Map<String, dynamic>? ?? const {},
    );
  }

  @override
  Future<({SalaryEmployee employee, SalaryPayment payment})> recordPayment({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
    String? cycleStart,
  }) async {
    final body = await apiClient.recordSalaryPayment(
      session: session,
      employeeId: employeeId,
      body: input,
      cycleStart: cycleStart,
    );
    return (
      employee: SalaryMapper.employeeFromJson(
        body['employee'] as Map<String, dynamic>? ?? const {},
      ),
      payment: SalaryMapper.paymentFromJson(
        body['payment'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }

  @override
  Future<SalaryEmployee> reversePayment({
    required RembehSession session,
    required String paymentId,
    String? reason,
  }) async {
    final body = await apiClient.reverseSalaryPayment(
      session: session,
      paymentId: paymentId,
      reason: reason,
    );
    return SalaryMapper.employeeFromJson(
      body['employee'] as Map<String, dynamic>? ?? const {},
    );
  }

  @override
  Future<SalaryHistory> loadHistory({
    required RembehSession session,
    required String employeeId,
  }) async {
    final body = await apiClient.getSalaryHistory(
      session: session,
      employeeId: employeeId,
    );
    return SalaryMapper.historyFromJson(body);
  }
}
