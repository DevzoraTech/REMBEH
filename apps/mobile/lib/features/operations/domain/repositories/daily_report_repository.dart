import '../../../../services/session_store.dart';
import '../models/report/daily_report_data.dart';

abstract interface class DailyReportRepository {
  Future<DailyReportData> getPersistedReport({
    required RembehSession session,
    required String reportId,
  });

  Future<DailyReportData> getLiveReport({
    required RembehSession session,
    required String date,
    String? branchId,
  });
}
