import '../../../services/session_store.dart';
import '../domain/models/agent_detail.dart';
import '../domain/repositories/agents_repository.dart';

class UpdateAgentStatus {
  const UpdateAgentStatus(this.repository);

  final AgentsRepository repository;

  Future<AgentDetail> call({
    required RembehSession session,
    required String agentId,
    required String status,
    String? reason,
  }) {
    return repository.updateAgentStatus(
      session: session,
      agentId: agentId,
      status: status,
      reason: reason,
    );
  }
}
