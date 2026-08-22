import 'agent_summary.dart';

class AgentCounts {
  const AgentCounts({
    required this.total,
    required this.active,
    required this.suspended,
    required this.inactive,
  });

  final int total;
  final int active;
  final int suspended;
  final int inactive;
}

class AgentsOverview {
  const AgentsOverview({required this.agents, required this.counts});

  final List<AgentSummary> agents;
  final AgentCounts counts;
}
