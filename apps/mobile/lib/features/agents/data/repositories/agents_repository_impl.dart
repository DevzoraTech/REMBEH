import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../domain/models/agent_account.dart';
import '../../domain/models/agent_activity.dart';
import '../../domain/models/agent_detail.dart';
import '../../domain/models/agents_overview.dart';
import '../../domain/repositories/agents_repository.dart';
import '../mappers/agent_mapper.dart';

class AgentsRepositoryImpl implements AgentsRepository {
  const AgentsRepositoryImpl({required this.apiClient});

  final ApiClient apiClient;

  @override
  Future<AgentsOverview> loadAgents({
    required RembehSession session,
    String? search,
    String? date,
  }) async {
    final response = await apiClient.listAgentsOverview(
      session: session,
      search: search,
      date: date,
    );

    return AgentMapper.overviewFromResponse(response);
  }

  @override
  Future<AgentDetail> loadAgentDetail({
    required RembehSession session,
    required String agentId,
    String? date,
  }) async {
    final response = await apiClient.getAgentDetail(
      session: session,
      agentId: agentId,
      date: date,
    );

    return AgentMapper.detailFromResponse(response);
  }

  @override
  Future<AgentActivity> loadAgentActivity({
    required RembehSession session,
    required String agentId,
    String? date,
    String? range,
  }) async {
    final response = await apiClient.getAgentActivity(
      session: session,
      agentId: agentId,
      date: date,
      range: range,
    );

    return AgentMapper.activityFromResponse(response);
  }

  @override
  Future<AgentAccount> loadAgentAccount({
    required RembehSession session,
    required String agentId,
  }) async {
    final response = await apiClient.getAgentAccount(
      session: session,
      agentId: agentId,
    );

    return AgentMapper.accountFromResponse(response);
  }

  @override
  Future<AgentDetail> updateAgentStatus({
    required RembehSession session,
    required String agentId,
    required String status,
    String? reason,
  }) async {
    final response = await apiClient.updateAgentStatus(
      session: session,
      agentId: agentId,
      status: status,
      reason: reason,
    );

    return AgentMapper.detailFromResponse(response);
  }

  @override
  Future<AgentDetail> updateAgentProfile({
    required RembehSession session,
    required String agentId,
    String? displayName,
    String? email,
    String? phone,
  }) async {
    final response = await apiClient.updateAgentProfile(
      session: session,
      agentId: agentId,
      displayName: displayName,
      email: email,
      phone: phone,
    );

    return AgentMapper.detailFromResponse(response);
  }

  @override
  Future<void> inviteAgent({
    required RembehSession session,
    required String branchId,
    required String displayName,
    required String email,
  }) async {
    await apiClient.inviteBranchAgent(
      session: session,
      branchId: branchId,
      displayName: displayName,
      email: email,
    );
  }
}
