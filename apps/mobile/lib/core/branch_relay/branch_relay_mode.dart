import 'branch_relay_models.dart';
import 'branch_relay_repository.dart';

/// Durable local-network work guard.
///
/// A paired field officer may have internet coverage in the field, but their
/// branch work belongs to the manager's offline session until it is handed
/// over. This guard intentionally blocks automatic server refreshes/uploads
/// during that period; it is not a connectivity indicator.
class BranchRelayMode {
  BranchRelayMode._();

  static final BranchRelayMode instance = BranchRelayMode._();

  final BranchRelayRepository _repository = BranchRelayRepository();

  Future<BranchRelaySession?> activeFor({
    required String? tenantId,
    required String? branchId,
  }) async {
    if (tenantId == null ||
        tenantId.isEmpty ||
        branchId == null ||
        branchId.isEmpty) {
      return null;
    }
    return _repository.activeClientSession(
      tenantId: tenantId,
      branchId: branchId,
    );
  }

  Future<bool> shouldDeferServerSync({
    required String? tenantId,
    required String? branchId,
  }) async => (await activeFor(tenantId: tenantId, branchId: branchId)) != null;

  Future<void> endRecoveryMode(String sessionId) =>
      _repository.endClientSession(sessionId);
}
