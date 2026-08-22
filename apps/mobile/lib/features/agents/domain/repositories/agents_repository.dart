import '../../../../services/session_store.dart';
import '../models/agent_account.dart';
import '../models/agent_activity.dart';
import '../models/agent_detail.dart';
import '../models/agents_overview.dart';

abstract interface class AgentsRepository {
  Future<AgentsOverview> loadAgents({
    required RembehSession session,
    String? search,
    String? date,
  });

  Future<AgentDetail> loadAgentDetail({
    required RembehSession session,
    required String agentId,
    String? date,
  });

  Future<AgentActivity> loadAgentActivity({
    required RembehSession session,
    required String agentId,
    String? date,
    String? range,
  });

  Future<AgentAccount> loadAgentAccount({
    required RembehSession session,
    required String agentId,
  });

  Future<AgentDetail> updateAgentStatus({
    required RembehSession session,
    required String agentId,
    required String status,
    String? reason,
  });

  Future<AgentDetail> updateAgentProfile({
    required RembehSession session,
    required String agentId,
    String? displayName,
    String? email,
    String? phone,
  });

  Future<void> inviteAgent({
    required RembehSession session,
    required String branchId,
    required String displayName,
    required String email,
  });
}
