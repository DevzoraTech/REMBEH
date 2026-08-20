import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/pending_operation.dart';

/// Repository for pending operations queue
class PendingOperationsRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all pending operations
  Future<List<PendingOperation>> getAllPending() async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'pending_operations',
      where: 'status = ?',
      whereArgs: [OperationStatus.pending],
      orderBy: 'created_at ASC',
    );

    return maps.map((map) => PendingOperation.fromMap(map)).toList();
  }

  /// Get failed operations (for retry)
  Future<List<PendingOperation>> getFailedOperations() async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'pending_operations',
      where: 'status = ? AND retry_count < ?',
      whereArgs: [OperationStatus.failed, 5], // Max 5 retries
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
  Future<int> getPendingCount() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM pending_operations WHERE status IN (?, ?)',
      [OperationStatus.pending, OperationStatus.failed],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Get count by operation type
  Future<Map<String, int>> getCountByType() async {
    final database = await _db.database;
    final result = await database.rawQuery('''
      SELECT operation_type, COUNT(*) as count
      FROM pending_operations
      WHERE status = ?
      GROUP BY operation_type
    ''', [OperationStatus.pending]);

    return Map.fromEntries(
      result.map((row) => MapEntry(
            row['operation_type'] as String,
            row['count'] as int,
          )),
    );
  }
}
