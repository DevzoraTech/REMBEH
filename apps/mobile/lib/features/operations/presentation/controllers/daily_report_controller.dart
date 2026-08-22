import 'package:flutter/foundation.dart';

import '../../../../services/session_store.dart';
import '../../application/report/load_daily_report.dart';
import '../../domain/models/report/daily_report_data.dart';

enum DailyReportLoadState { initial, loading, loaded, failed }

class DailyReportController extends ChangeNotifier {
  DailyReportController({required LoadDailyReport loadDailyReport})
    : _loadDailyReport = loadDailyReport;

  final LoadDailyReport _loadDailyReport;

  DailyReportLoadState _state = DailyReportLoadState.initial;

  DailyReportLoadState get state => _state;

  DailyReportData? _report;

  DailyReportData? get report => _report;

  String? _error;

  String? get error => _error;

  bool get isLoading => _state == DailyReportLoadState.loading;

  Future<void> loadLive({
    required RembehSession session,
    required String date,
    String? branchId,
  }) async {
    await _run(
      () => _loadDailyReport.live(
        session: session,
        date: date,
        branchId: branchId,
      ),
    );
  }

  Future<void> loadPersisted({
    required RembehSession session,
    required String reportId,
  }) async {
    await _run(
      () => _loadDailyReport.persisted(session: session, reportId: reportId),
    );
  }

  Future<void> _run(Future<DailyReportData> Function() loader) async {
    if (_state == DailyReportLoadState.loading) {
      return;
    }

    _state = DailyReportLoadState.loading;

    _error = null;

    notifyListeners();

    try {
      _report = await loader();

      _state = DailyReportLoadState.loaded;
    } catch (error) {
      _error = _message(error);

      _state = DailyReportLoadState.failed;
    }

    notifyListeners();
  }

  String _message(Object error) {
    final value = error.toString().trim();

    if (value.isEmpty) {
      return 'The report could not be loaded.';
    }

    return value;
  }
}
