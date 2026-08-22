import 'package:flutter/foundation.dart';

import '../../../../services/session_store.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/list_salary_agent_candidates.dart';
import '../../application/load_salaries_dashboard.dart';
import '../../application/record_salary_payment.dart';
import '../../application/save_salary_employee.dart';
import '../../domain/models/salary_models.dart';

enum SalaryListFilter { all, unpaid, partial, paid }

class SalariesController extends ChangeNotifier {
  SalariesController({
    required LoadSalariesDashboard loadDashboard,
    required ListSalaryAgentCandidates listAgentCandidates,
    required SaveSalaryEmployee saveEmployee,
    required RecordSalaryPayment recordSalaryPayment,
  }) : _loadDashboard = loadDashboard,
       _listAgentCandidates = listAgentCandidates,
       _saveEmployee = saveEmployee,
       _recordSalaryPayment = recordSalaryPayment;

  final LoadSalariesDashboard _loadDashboard;
  final ListSalaryAgentCandidates _listAgentCandidates;
  final SaveSalaryEmployee _saveEmployee;
  final RecordSalaryPayment _recordSalaryPayment;

  SalariesDashboard? _dashboard;
  List<SalaryAgentCandidate> _agentCandidates = const [];
  SalaryListFilter _filter = SalaryListFilter.all;
  String _search = '';
  bool _loading = false;
  bool _saving = false;
  String? _error;
  String? _notice;

  SalariesDashboard? get dashboard => _dashboard;

  SalaryCycle? get cycle => _dashboard?.cycle;

  PayrollSummary? get summary => _dashboard?.summary;

  List<SalaryAgentCandidate> get agentCandidates => _agentCandidates;

  SalaryListFilter get filter => _filter;

  String get search => _search;

  bool get isLoading => _loading;

  bool get isSaving => _saving;

  String? get error => _error;

  String? get notice => _notice;

  List<SalaryEmployee> get visibleEmployees {
    final source = _dashboard?.employees ?? const <SalaryEmployee>[];
    final byFilter = switch (_filter) {
      SalaryListFilter.all => source,
      SalaryListFilter.unpaid => source.where((row) => row.isUnpaid),
      SalaryListFilter.partial => source.where((row) => row.isPartial),
      SalaryListFilter.paid => source.where((row) => row.isPaid),
    };
    final query = _search.trim().toLowerCase();
    final rows = query.isEmpty
        ? byFilter
        : byFilter.where(
            (row) =>
                row.fullName.toLowerCase().contains(query) ||
                (row.phone ?? '').toLowerCase().contains(query) ||
                (row.roleName ?? '').toLowerCase().contains(query),
          );
    return rows.toList();
  }

  void setFilter(SalaryListFilter filter) {
    if (_filter == filter) return;
    _filter = filter;
    notifyListeners();
  }

  void setSearch(String value) {
    _search = value;
    notifyListeners();
  }

  void clearNotice() {
    _notice = null;
    notifyListeners();
  }

  Future<void> load({
    required RembehSession session,
    String? branchId,
    String? cycleStart,
    bool quiet = false,
  }) async {
    if (_loading) return;
    _loading = true;
    if (!quiet) _notice = null;
    _error = null;
    notifyListeners();

    try {
      _dashboard = await _loadDashboard(
        session: session,
        branchId: branchId,
        cycleStart: cycleStart,
      );
    } catch (error) {
      _error = friendlyErrorMessage(error);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> loadAgentCandidates({
    required RembehSession session,
    String? branchId,
  }) async {
    try {
      _agentCandidates = await _listAgentCandidates(
        session: session,
        branchId: branchId,
      );
      notifyListeners();
    } catch (error) {
      _error = friendlyErrorMessage(error);
      notifyListeners();
    }
  }

  Future<bool> createEmployee({
    required RembehSession session,
    required Map<String, dynamic> input,
  }) async {
    if (_saving) return false;
    _saving = true;
    _error = null;
    notifyListeners();
    try {
      await _saveEmployee.create(session: session, input: input);
      _notice = 'Employee saved.';
      return true;
    } catch (error) {
      _error = friendlyErrorMessage(error);
      return false;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }

  Future<bool> updateEmployee({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> input,
  }) async {
    if (_saving) return false;
    _saving = true;
    _error = null;
    notifyListeners();
    try {
      await _saveEmployee.update(
        session: session,
        employeeId: employeeId,
        input: input,
      );
      _notice = 'Employee details updated.';
      return true;
    } catch (error) {
      _error = friendlyErrorMessage(error);
      return false;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }

  Future<SalaryPayment?> recordPayment({
    required RembehSession session,
    required SalaryEmployee employee,
    required Map<String, dynamic> input,
    String? cycleStart,
  }) async {
    if (_saving) return null;
    _saving = true;
    _error = null;
    notifyListeners();
    try {
      final result = await _recordSalaryPayment(
        session: session,
        employeeId: employee.id,
        input: input,
        cycleStart: cycleStart,
      );
      _notice = 'Salary payment recorded.';
      return result.payment;
    } catch (error) {
      _error = friendlyErrorMessage(error);
      return null;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }
}
