import 'package:flutter/foundation.dart';

import '../../../../services/session_store.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/load_agents.dart';
import '../../domain/models/agent_summary.dart';
import '../../domain/models/agents_overview.dart';

enum AgentListFilter { all, active, suspended, inactive }

class AgentsController extends ChangeNotifier {
  AgentsController({required LoadAgents loadAgents}) : _loadAgents = loadAgents;

  final LoadAgents _loadAgents;

  AgentsOverview? _overview;

  bool _loading = false;

  String? _error;

  String _search = '';

  AgentListFilter _filter = AgentListFilter.all;

  AgentsOverview? get overview => _overview;

  bool get isLoading => _loading;

  String? get error => _error;

  String get search => _search;

  AgentListFilter get filter => _filter;

  AgentCounts get counts =>
      _overview?.counts ??
      const AgentCounts(total: 0, active: 0, suspended: 0, inactive: 0);

  List<AgentSummary> get agents {
    final source = _overview?.agents ?? const <AgentSummary>[];

    Iterable<AgentSummary> filtered = source;

    switch (_filter) {
      case AgentListFilter.all:
        break;

      case AgentListFilter.active:
        filtered = filtered.where((agent) => agent.isActive);
        break;

      case AgentListFilter.suspended:
        filtered = filtered.where((agent) => agent.isSuspended);
        break;

      case AgentListFilter.inactive:
        filtered = filtered.where(
          (agent) =>
              agent.isInactive ||
              agent.isInvited ||
              agent.isPendingVerification,
        );
        break;
    }

    final query = _search.trim().toLowerCase();

    if (query.isNotEmpty) {
      filtered = filtered.where((agent) {
        return agent.name.toLowerCase().contains(query) ||
            agent.email.toLowerCase().contains(query) ||
            (agent.phone?.toLowerCase().contains(query) ?? false) ||
            (agent.publicId?.toLowerCase().contains(query) ?? false);
      });
    }

    return filtered.toList();
  }

  bool get hasAgents => _overview?.agents.isNotEmpty == true;

  bool get hasVisibleAgents => agents.isNotEmpty;

  Future<void> load({required RembehSession session, String? date}) async {
    if (_loading) {
      return;
    }

    _loading = true;
    _error = null;

    notifyListeners();

    try {
      _overview = await _loadAgents(session: session, date: date);
    } catch (error) {
      _error = friendlyErrorMessage(error);
    } finally {
      _loading = false;

      notifyListeners();
    }
  }

  Future<void> refresh({required RembehSession session, String? date}) {
    return load(session: session, date: date);
  }

  void setSearch(String value) {
    if (_search == value) {
      return;
    }

    _search = value;

    notifyListeners();
  }

  void clearSearch() {
    if (_search.isEmpty) {
      return;
    }

    _search = '';

    notifyListeners();
  }

  void setFilter(AgentListFilter value) {
    if (_filter == value) {
      return;
    }

    _filter = value;

    notifyListeners();
  }
}
