import '../../../../services/session_store.dart';
import '../../domain/models/report/daily_report_data.dart';
import '../../domain/repositories/daily_report_repository.dart';

class LoadDailyReport {
  const LoadDailyReport(this._repository);

  final DailyReportRepository _repository;

  Future<DailyReportData> persisted({
    required RembehSession session,
    required String reportId,
  }) {
    return _repository.getPersistedReport(session: session, reportId: reportId);
  }

  Future<DailyReportData> live({
    required RembehSession session,
    required String date,
    String? branchId,
  }) {
    return _repository.getLiveReport(
      session: session,
      date: date,
      branchId: branchId,
    );
  }
}
