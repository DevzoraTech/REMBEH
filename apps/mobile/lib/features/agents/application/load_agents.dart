import '../../../services/session_store.dart';
import '../domain/models/agents_overview.dart';
import '../domain/repositories/agents_repository.dart';

class LoadAgents {
  const LoadAgents(this.repository);

  final AgentsRepository repository;

  Future<AgentsOverview> call({
    required RembehSession session,
    String? search,
    String? date,
  }) {
    return repository.loadAgents(session: session, search: search, date: date);
  }
}
