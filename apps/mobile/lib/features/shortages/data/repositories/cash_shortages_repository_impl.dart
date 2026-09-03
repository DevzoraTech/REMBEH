import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../domain/models/cash_shortage.dart';
import '../../domain/repositories/cash_shortages_repository.dart';
import '../mappers/cash_shortage_mapper.dart';

class CashShortagesRepositoryImpl implements CashShortagesRepository {
  const CashShortagesRepositoryImpl({required this.apiClient});

  final ApiClient apiClient;

  @override
  Future<List<CashShortage>> listShortages({
    required RembehSession session,
    String? branchId,
    String? userId,
    String? status,
  }) async {
    final rows = await apiClient.listCashShortages(
      session: session,
      branchId: branchId,
      userId: userId,
      status: status,
    );

    return CashShortageMapper.listFromJson(rows);
  }

  @override
  Future<CashShortage> getShortage({
    required RembehSession session,
    required String shortageId,
  }) async {
    final row = await apiClient.getCashShortage(
      session: session,
      shortageId: shortageId,
    );

    return CashShortageMapper.fromJson(row);
  }

  @override
  Future<CashShortage> recordPayment({
    required RembehSession session,
    required String shortageId,
    required num amount,
    String method = 'CASH',
    String? notes,
  }) async {
    final row = await apiClient.recordCashShortagePayment(
      session: session,
      shortageId: shortageId,
      amount: amount,
      method: method,
      notes: notes,
    );

    return CashShortageMapper.fromJson(row);
  }

  @override
  Future<CashShortage> settleEmployee({
    required RembehSession session,
    String? responsibleUserId,
    String? employeeId,
    required num amount,
    String method = 'CASH',
    String? notes,
  }) async {
    final row = await apiClient.settleEmployeeCashShortage(
      session: session,
      responsibleUserId: responsibleUserId,
      employeeId: employeeId,
      amount: amount,
      method: method,
      notes: notes,
    );

    return CashShortageMapper.fromJson(row);
  }

  @override
  Future<CashShortage> recordOpeningShortage({
    required RembehSession session,
    required String employeeId,
    required num amount,
    String? notes,
    String? operationDate,
  }) async {
    final row = await apiClient.createOpeningCashShortage(
      session: session,
      employeeId: employeeId,
      amount: amount,
      notes: notes,
      operationDate: operationDate,
    );

    return CashShortageMapper.fromJson(row);
  }
}
