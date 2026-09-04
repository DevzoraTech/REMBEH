import '../../../../services/offline_cache_store.dart';

/// Short-lived shortages list cache (memory + disk) so More → Shortages
/// can open instantly and avoid hammering `/cash-shortages`.
class ShortagesListCache {
  ShortagesListCache._();
  static final ShortagesListCache instance = ShortagesListCache._();

  /// Fresh enough to skip a network round-trip on open/refresh.
  static const Duration freshTtl = Duration(seconds: 90);

  /// Soft ceiling — still shown immediately, then refreshed quietly.
  static const Duration softTtl = Duration(minutes: 15);

  final Map<String, _ShortagesCacheEntry> _memory = {};

  static String key({
    required String tenantId,
    required String branchId,
    String? userId,
  }) {
    final user = (userId ?? '').trim();
    final suffix = user.isEmpty ? 'all' : user;
    return OfflineCacheKeys.shortages(tenantId, branchId, suffix);
  }

  List<Map<String, dynamic>>? peekMemory(String cacheKey) {
    final entry = _memory[cacheKey];
    if (entry == null) return null;
    return entry.rows;
  }

  bool isFresh(String cacheKey, {Duration ttl = freshTtl}) {
    final entry = _memory[cacheKey];
    if (entry == null) return false;
    return DateTime.now().toUtc().difference(entry.savedAt) <= ttl;
  }

  Future<List<Map<String, dynamic>>?> read(String cacheKey) async {
    final memory = _memory[cacheKey];
    if (memory != null) {
      return memory.rows;
    }

    final payload = await OfflineCacheStore.instance.getPayload(cacheKey);
    final rows = _asMapList(payload);
    if (rows == null) return null;

    final savedAt =
        await OfflineCacheStore.instance.savedAt(cacheKey) ??
        DateTime.now().toUtc();
    _memory[cacheKey] = _ShortagesCacheEntry(rows: rows, savedAt: savedAt);
    return rows;
  }

  Future<DateTime?> savedAt(String cacheKey) async {
    final memory = _memory[cacheKey];
    if (memory != null) return memory.savedAt;
    return OfflineCacheStore.instance.savedAt(cacheKey);
  }

  Future<void> write(
    String cacheKey,
    List<Map<String, dynamic>> rows,
  ) async {
    final savedAt = DateTime.now().toUtc();
    final copy = rows
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
    _memory[cacheKey] = _ShortagesCacheEntry(rows: copy, savedAt: savedAt);
    try {
      await OfflineCacheStore.instance.putJson(cacheKey, copy);
    } catch (_) {
      // Memory still helps this session.
    }
  }

  Future<void> invalidate(String cacheKey) async {
    _memory.remove(cacheKey);
    try {
      await OfflineCacheStore.instance.remove(cacheKey);
    } catch (_) {}
  }

  static List<Map<String, dynamic>>? _asMapList(Object? payload) {
    if (payload is! List) return null;
    return payload
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }
}

class _ShortagesCacheEntry {
  const _ShortagesCacheEntry({required this.rows, required this.savedAt});

  final List<Map<String, dynamic>> rows;
  final DateTime savedAt;
}
