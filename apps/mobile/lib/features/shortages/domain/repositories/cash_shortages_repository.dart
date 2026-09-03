import '../../../../services/session_store.dart';
import '../models/cash_shortage.dart';

abstract interface class CashShortagesRepository {
  Future<List<CashShortage>> listShortages({
    required RembehSession session,
    String? branchId,
    String? userId,
    String? status,
  });

  Future<CashShortage> getShortage({
    required RembehSession session,
    required String shortageId,
  });

  Future<CashShortage> recordPayment({
    required RembehSession session,
    required String shortageId,
    required num amount,
    String method,
    String? notes,
  });

  Future<CashShortage> settleEmployee({
    required RembehSession session,
    String? responsibleUserId,
    String? employeeId,
    required num amount,
    String method,
    String? notes,
  });

  Future<CashShortage> recordOpeningShortage({
    required RembehSession session,
    required String employeeId,
    required num amount,
    String? notes,
    String? operationDate,
  });
}
