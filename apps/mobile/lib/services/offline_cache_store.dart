import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Offline cache for field work. New snapshots replace old ones only after
/// a successful write so a failed sync never wipes working data.
class OfflineCacheStore {
  OfflineCacheStore._();
  static final OfflineCacheStore instance = OfflineCacheStore._();

  static const _prefix = 'rembeh_offline_v1_';

  Future<void> putJson(String key, Object value) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode({
      'savedAt': DateTime.now().toUtc().toIso8601String(),
      'payload': value,
    });
    final ok = await prefs.setString('$_prefix$key', encoded);
    if (!ok) {
      throw StateError('Failed to cache $key');
    }
  }

  Future<Map<String, dynamic>?> getEnvelope(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_prefix$key');
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {}
    return null;
  }

  Future<Object?> getPayload(String key) async {
    final envelope = await getEnvelope(key);
    return envelope?['payload'];
  }

  Future<DateTime?> savedAt(String key) async {
    final envelope = await getEnvelope(key);
    return DateTime.tryParse(envelope?['savedAt'] as String? ?? '');
  }

  Future<void> remove(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_prefix$key');
  }
}

/// Keys used by the mobile offline snapshot.
class OfflineCacheKeys {
  static String customers(String tenantId, String branchId) =>
      'customers_${tenantId}_$branchId';
  static String loans(String tenantId, String branchId) =>
      'loans_${tenantId}_$branchId';
  static String agentDay(String tenantId, String branchId) =>
      'agent_day_${tenantId}_$branchId';
  static String pendingDisbursements(String tenantId, String branchId) =>
      'pending_disbursements_${tenantId}_$branchId';
  static String pendingWrites(String tenantId) => 'pending_writes_$tenantId';
}
