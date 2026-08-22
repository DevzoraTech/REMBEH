import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../domain/models/report/daily_report_data.dart';
import '../../domain/repositories/daily_report_repository.dart';
import '../mappers/daily_report_mapper.dart';

class DailyReportRepositoryImpl implements DailyReportRepository {
  DailyReportRepositoryImpl({required ApiClient apiClient})
    : _apiClient = apiClient;

  final ApiClient _apiClient;

  @override
  Future<DailyReportData> getPersistedReport({
    required RembehSession session,
    required String reportId,
  }) async {
    final response = await _apiClient.getOperationReport(
      session: session,
      reportId: reportId,
    );

    final report = response['report'];

    if (report is! Map<String, dynamic>) {
      throw const DailyReportException('The report could not be loaded.');
    }

    return DailyReportMapper.fromReportPayload(
      report: report,
      organizationName: session.workspaceName,
      fallbackBranchName: session.branchName,
      fallbackBranchAddress: session.branchAddress,
      fallbackManagerName: session.userName,
    );
  }

  @override
  Future<DailyReportData> getLiveReport({
    required RembehSession session,
    required String date,
    String? branchId,
  }) async {
    final response = await _apiClient.getBranchOperation(
      session: session,
      branchId: branchId,
      date: date,
    );

    final operation = response['operation'];

    if (operation is! Map<String, dynamic>) {
      throw const DailyReportException(
        'There is no operation available for this day.',
      );
    }

    return DailyReportMapper.fromLiveOperation(
      response: response,
      organizationName: session.workspaceName,
      branchName: session.branchName ?? 'Branch',
      managerName: session.userName,
      branchAddress: session.branchAddress,
    );
  }
}

class DailyReportException implements Exception {
  const DailyReportException(this.message);

  final String message;

  @override
  String toString() => message;
}
