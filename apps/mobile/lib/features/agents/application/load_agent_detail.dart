import '../../../services/session_store.dart';
import '../domain/models/agent_detail.dart';
import '../domain/repositories/agents_repository.dart';

class LoadAgentDetail {
  const LoadAgentDetail(this.repository);

  final AgentsRepository repository;

  Future<AgentDetail> call({
    required RembehSession session,
    required String agentId,
    String? date,
  }) {
    return repository.loadAgentDetail(
      session: session,
      agentId: agentId,
      date: date,
    );
  }
}
