import '../../../services/session_store.dart';
import '../domain/repositories/agents_repository.dart';

class InviteAgent {
  const InviteAgent(this.repository);

  final AgentsRepository repository;

  Future<void> call({
    required RembehSession session,
    required String branchId,
    required String displayName,
    required String email,
  }) {
    return repository.inviteAgent(
      session: session,
      branchId: branchId,
      displayName: displayName,
      email: email,
    );
  }
}
