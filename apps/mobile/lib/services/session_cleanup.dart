import '../core/network/realtime_client.dart';
import '../features/agent_day/data/agent_day_status_store.dart';
import '../features/applications_list/data/applications_live_store.dart';
import '../features/repayment/data/repayments_live_store.dart';

/// Clears in-memory + device caches that must never leak across tenants.
Future<void> clearTenantScopedClientState() async {
  RealtimeClient.instance.disconnect();
  AgentDayStatusStore.instance.clearSessionState();
  await RepaymentsLiveStore.instance.clearSessionState();
  ApplicationsLiveStore.instance.clearSessionState();
}
