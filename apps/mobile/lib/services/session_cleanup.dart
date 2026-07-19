import '../core/network/realtime_client.dart';
import '../features/applications_list/data/applications_live_store.dart';
import '../features/repayment/data/repayments_live_store.dart';

/// Clears in-memory + device caches that must never leak across tenants.
Future<void> clearTenantScopedClientState() async {
  RealtimeClient.instance.disconnect();
  await RepaymentsLiveStore.instance.clearSessionState();
  ApplicationsLiveStore.instance.clearSessionState();
}
