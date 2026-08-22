import '../../../services/session_store.dart';
import '../domain/models/agent_account.dart';
import '../domain/repositories/agents_repository.dart';

class LoadAgentAccount {
  const LoadAgentAccount(this.repository);

  final AgentsRepository repository;

  Future<AgentAccount> call({
    required RembehSession session,
    required String agentId,
  }) {
    return repository.loadAgentAccount(session: session, agentId: agentId);
  }
}
