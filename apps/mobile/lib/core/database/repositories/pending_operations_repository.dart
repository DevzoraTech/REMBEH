import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/pending_operation.dart';

/// Repository for pending operations queue
class PendingOperationsRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all pending operations
  Future<List<PendingOperation>> getAllPending({
    String? tenantId,
    String? branchId,
  }) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'pending_operations',
      where: _scopeWhere(OperationStatus.pending, tenantId, branchId),
      whereArgs: _scopeArgs(OperationStatus.pending, tenantId, branchId),
      orderBy: 'created_at ASC',
    );

    return maps.map((map) => PendingOperation.fromMap(map)).toList();
  }

  /// Get failed operations (for retry)
  Future<List<PendingOperation>> getFailedOperations({
    String? tenantId,
    String? branchId,
  }) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'pending_operations',
      where:
          '${_scopeWhere(OperationStatus.failed, tenantId, branchId)} '
          'AND retry_count < ?',
      whereArgs: [..._scopeArgs(OperationStatus.failed, tenantId, branchId), 5],
      orderBy: 'created_at ASC',
    );

    return maps.map((map) => PendingOperation.fromMap(map)).toList();
  }

  /// Insert operation
  Future<int> insert(PendingOperation operation) async {
    final database = await _db.database;
    return await database.insert(
      'pending_operations',
      operation.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// A relayed event may be delivered again after a Wi-Fi interruption. The
  /// source event id makes receipt idempotent without relying on wall-clock
  /// timestamps or the receiving device's auto-increment id.
  Future<PendingOperation?> findByRelayEventId(String eventId) async {
    final database = await _db.database;
    final rows = await database.query(
      'pending_operations',
      where: 'relay_event_id = ?',
      whereArgs: [eventId],
      limit: 1,
    );
    return rows.isEmpty ? null : PendingOperation.fromMap(rows.first);
  }

  Future<PendingOperation?> findByLocalEntityId({
    required String operationType,
    required String localEntityId,
    required String tenantId,
    required String branchId,
  }) async {
    final database = await _db.database;
    final rows = await database.query(
      'pending_operations',
      where:
          'operation_type = ? AND local_entity_id = ? '
          'AND tenant_id = ? AND branch_id = ?',
      whereArgs: [operationType, localEntityId, tenantId, branchId],
      limit: 1,
    );
    return rows.isEmpty ? null : PendingOperation.fromMap(rows.first);
  }

  /// Update operation status
  Future<void> updateStatus(
    int id,
    String status, {
    String? lastError,
    int? retryCount,
  }) async {
    final database = await _db.database;

    final Map<String, dynamic> updates = {'status': status};
    if (lastError != null) updates['last_error'] = lastError;
    if (retryCount != null) updates['retry_count'] = retryCount;

    await database.update(
      'pending_operations',
      updates,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Mark operation as uploaded (successful)
  Future<void> markAsUploaded(int id) async {
    await updateStatus(id, OperationStatus.uploaded);
  }

  Future<void> markAsRelayed(int id) async {
    await updateStatus(id, OperationStatus.relayed);
  }

  /// Mark operation as failed with error
  Future<void> markAsFailed(int id, String error, int retryCount) async {
    await updateStatus(
      id,
      OperationStatus.failed,
      lastError: error,
      retryCount: retryCount,
    );
  }

  /// Delete operation
  Future<void> delete(int id) async {
    final database = await _db.database;
    await database.delete(
      'pending_operations',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Delete uploaded operations older than specified days
  Future<void> cleanupUploaded({int olderThanDays = 7}) async {
    final database = await _db.database;
    final cutoffTime = DateTime.now()
        .subtract(Duration(days: olderThanDays))
        .millisecondsSinceEpoch;

    await database.delete(
      'pending_operations',
      where: 'status = ? AND created_at < ?',
      whereArgs: [OperationStatus.uploaded, cutoffTime],
    );
  }

  /// Get count of pending operations
  Future<int> getPendingCount({String? tenantId, String? branchId}) async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM pending_operations WHERE '
      '${_scopeStatusesWhere(tenantId, branchId)}',
      _scopeStatusArgs(tenantId, branchId),
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Get count by operation type
  Future<Map<String, int>> getCountByType() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      '''
      SELECT operation_type, COUNT(*) as count
      FROM pending_operations
      WHERE status = ?
      GROUP BY operation_type
    ''',
      [OperationStatus.pending],
    );

    return Map.fromEntries(
      result.map(
        (row) => MapEntry(row['operation_type'] as String, row['count'] as int),
      ),
    );
  }

  String _scopeWhere(String status, String? tenantId, String? branchId) {
    final scope = _scopeClause(tenantId, branchId);
    return scope.isEmpty ? 'status = ?' : 'status = ? AND $scope';
  }

  List<Object?> _scopeArgs(String status, String? tenantId, String? branchId) =>
      [status, ..._scopeValues(tenantId, branchId)];

  String _scopeStatusesWhere(String? tenantId, String? branchId) {
    final scope = _scopeClause(tenantId, branchId);
    return scope.isEmpty ? 'status IN (?, ?)' : 'status IN (?, ?) AND $scope';
  }

  List<Object?> _scopeStatusArgs(String? tenantId, String? branchId) => [
    OperationStatus.pending,
    OperationStatus.failed,
    ..._scopeValues(tenantId, branchId),
  ];

  String _scopeClause(String? tenantId, String? branchId) {
    if (tenantId == null ||
        tenantId.isEmpty ||
        branchId == null ||
        branchId.isEmpty) {
      return '';
    }
    return 'tenant_id = ? AND branch_id = ?';
  }

  List<Object?> _scopeValues(String? tenantId, String? branchId) =>
      _scopeClause(tenantId, branchId).isEmpty
      ? const []
      : [tenantId, branchId];
}
