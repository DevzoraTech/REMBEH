import '../../../services/session_store.dart';
import '../domain/models/agent_activity.dart';
import '../domain/repositories/agents_repository.dart';

class LoadAgentActivity {
  const LoadAgentActivity(this.repository);

  final AgentsRepository repository;

  Future<AgentActivity> call({
    required RembehSession session,
    required String agentId,
    String? date,
    String? range,
  }) {
    return repository.loadAgentActivity(
      session: session,
      agentId: agentId,
      date: date,
      range: range,
    );
  }
}
