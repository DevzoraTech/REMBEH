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
}
