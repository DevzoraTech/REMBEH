import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../database/local_database.dart';
import '../database/models/pending_operation.dart';
import '../database/repositories/pending_operations_repository.dart';
import 'branch_relay_models.dart';

class BranchRelayRepository {
  BranchRelayRepository({LocalDatabase? database})
    : _database = database ?? LocalDatabase.instance;

  final LocalDatabase _database;
  final PendingOperationsRepository _operations = PendingOperationsRepository();

  Future<void> saveSession(BranchRelaySession session) async {
    final db = await _database.database;
    await db.insert(
      'branch_relay_sessions',
      session.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<BranchRelaySession?> findSession(String sessionId) async {
    final db = await _database.database;
    final rows = await db.query(
      'branch_relay_sessions',
      where: 'session_id = ?',
      whereArgs: [sessionId],
      limit: 1,
    );
    return rows.isEmpty ? null : BranchRelaySession.fromMap(rows.first);
  }

  /// Only paired field-officer sessions suspend direct server sync. Manager
  /// hosting sessions remain free to synchronize the consolidated branch.
  Future<BranchRelaySession?> activeClientSession({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _database.database;
    final rows = await db.query(
      'branch_relay_sessions',
      where:
          'tenant_id = ? AND branch_id = ? AND role = ? AND status = ? '
          'AND expires_at > ?',
      whereArgs: [
        tenantId,
        branchId,
        'CLIENT',
        'PAIRED',
        DateTime.now().toUtc().millisecondsSinceEpoch,
      ],
      orderBy: 'paired_at DESC',
      limit: 1,
    );
    return rows.isEmpty ? null : BranchRelaySession.fromMap(rows.first);
  }

  Future<void> endClientSession(String sessionId) async {
    final db = await _database.database;
    await db.update(
      'branch_relay_sessions',
      {
        'status': 'ENDED',
        'last_activity_at': DateTime.now().toUtc().millisecondsSinceEpoch,
      },
      where: 'session_id = ? AND role = ?',
      whereArgs: [sessionId, 'CLIENT'],
    );
  }

  /// A device can only have one authoritative manager relay for a branch.
  /// Retiring an older pairing avoids an expired QR session accidentally
  /// becoming the sync policy after the manager starts a new sharing session.
  Future<void> endActiveClientSessions({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _database.database;
    await db.update(
      'branch_relay_sessions',
      {
        'status': 'ENDED',
        'last_activity_at': DateTime.now().toUtc().millisecondsSinceEpoch,
      },
      where: 'tenant_id = ? AND branch_id = ? AND role = ? AND status = ?',
      whereArgs: [tenantId, branchId, 'CLIENT', 'PAIRED'],
    );
  }

  Future<List<PendingOperation>> pendingForBranch({
    required String tenantId,
    required String branchId,
  }) async {
    final pending = await _operations.getAllPending(
      tenantId: tenantId,
      branchId: branchId,
    );
    final retryable = await _operations.getFailedOperations(
      tenantId: tenantId,
      branchId: branchId,
    );
    return [...pending, ...retryable]
      ..sort((left, right) => left.createdAt.compareTo(right.createdAt));
  }

  Future<void> markOperationRelayed(int operationId) =>
      _operations.markAsRelayed(operationId);

  static const snapshotTables = <String>[
    'branches',
    'customers',
    'loan_products',
    'loans',
    'agents',
    'collections',
    'payments',
    'loan_applications',
    'agent_days',
  ];

  Future<Map<String, int>> snapshotManifest({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _database.database;
    final counts = <String, int>{};
    for (final table in snapshotTables) {
      final where = table == 'loan_products'
          ? 'tenant_id = ?'
          : table == 'branches'
          ? 'tenant_id = ? AND id = ?'
          : 'tenant_id = ? AND branch_id = ?';
      final args = table == 'loan_products' ? [tenantId] : [tenantId, branchId];
      final row = (await db.rawQuery(
        'SELECT COUNT(*) AS count FROM $table WHERE $where',
        args,
      )).first;
      counts[table] = (row['count'] as num?)?.toInt() ?? 0;
    }
    return counts;
  }

  Future<List<Map<String, Object?>>> snapshotPage({
    required String table,
    required String tenantId,
    required String branchId,
    required int offset,
    required int limit,
  }) async {
    if (!snapshotTables.contains(table)) {
      throw ArgumentError.value(table, 'table', 'Unsupported snapshot table');
    }
    final db = await _database.database;
    final where = table == 'loan_products'
        ? 'tenant_id = ?'
        : table == 'branches'
        ? 'tenant_id = ? AND id = ?'
        : 'tenant_id = ? AND branch_id = ?';
    final args = table == 'loan_products' ? [tenantId] : [tenantId, branchId];
    return db.query(
      table,
      where: where,
      whereArgs: args,
      limit: limit,
      offset: offset,
    );
  }

  /// Stores one received page away from the live tables. The page can be
  /// safely downloaded again after an interruption because its offset/index
  /// identity replaces the previous staged copy.
  Future<void> stageSnapshotPage({
    required String sessionId,
    required String table,
    required int offset,
    required List<Map<String, dynamic>> rows,
  }) async {
    if (!snapshotTables.contains(table)) {
      throw ArgumentError.value(table, 'table', 'Unsupported snapshot table');
    }
    final db = await _database.database;
    await db.transaction((txn) async {
      await txn.delete(
        'branch_relay_snapshot_rows',
        where: 'session_id = ? AND table_name = ? AND page_offset = ?',
        whereArgs: [sessionId, table, offset],
      );
      final batch = txn.batch();
      for (var index = 0; index < rows.length; index++) {
        batch.insert('branch_relay_snapshot_rows', {
          'session_id': sessionId,
          'table_name': table,
          'page_offset': offset,
          'row_index': index,
          'row_payload': jsonEncode(rows[index]),
        });
      }
      await batch.commit(noResult: true);
    });
  }

  Future<bool> hasStagedSnapshotPage({
    required String sessionId,
    required String table,
    required int offset,
    required int expectedRows,
  }) async {
    if (expectedRows == 0) return true;
    final db = await _database.database;
    final row = (await db.rawQuery(
      'SELECT COUNT(*) AS count FROM branch_relay_snapshot_rows '
      'WHERE session_id = ? AND table_name = ? AND page_offset = ?',
      [sessionId, table, offset],
    )).first;
    return (row['count'] as num?)?.toInt() == expectedRows;
  }

  /// Makes a fully received manager snapshot visible atomically. Until this
  /// runs, the officer continues to work from the last complete local copy.
  Future<void> activateStagedSnapshot({
    required String sessionId,
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _database.database;
    await db.transaction((txn) async {
      for (final table in snapshotTables) {
        final where = table == 'loan_products'
            ? 'tenant_id = ?'
            : table == 'branches'
            ? 'tenant_id = ? AND id = ?'
            : 'tenant_id = ? AND branch_id = ?';
        final args = table == 'loan_products'
            ? <Object?>[tenantId]
            : <Object?>[tenantId, branchId];
        await txn.delete(table, where: where, whereArgs: args);

        final stagedRows = await txn.query(
          'branch_relay_snapshot_rows',
          columns: ['row_payload'],
          where: 'session_id = ? AND table_name = ?',
          whereArgs: [sessionId, table],
          orderBy: 'page_offset ASC, row_index ASC',
        );
        final batch = txn.batch();
        for (final staged in stagedRows) {
          final row = Map<String, dynamic>.from(
            jsonDecode(staged['row_payload']! as String) as Map,
          );
          batch.insert(
            table,
            row,
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        }
        await batch.commit(noResult: true);
      }
      await txn.delete(
        'branch_relay_snapshot_rows',
        where: 'session_id = ?',
        whereArgs: [sessionId],
      );
    });
  }

  Future<bool> receiveEvent(BranchRelayEvent event) async {
    final db = await _database.database;
    return db.transaction((txn) async {
      final existing = await txn.query(
        'branch_relay_events',
        columns: ['event_id'],
        where:
            'event_id = ? OR (source_device_id = ? AND local_entity_id = ? AND operation_type = ?)',
        whereArgs: [
          event.eventId,
          event.sourceDeviceId,
          event.localEntityId,
          event.operationType,
        ],
        limit: 1,
      );
      if (existing.isNotEmpty) return false;

      final now = DateTime.now().toUtc();
      await txn.insert('branch_relay_events', {
        'event_id': event.eventId,
        'session_id': event.sessionId,
        'tenant_id': event.tenantId,
        'branch_id': event.branchId,
        'actor_user_id': event.actorUserId,
        'operation_type': event.operationType,
        'local_entity_id': event.localEntityId,
        'occurred_at': event.occurredAt.millisecondsSinceEpoch,
        'received_at': now.millisecondsSinceEpoch,
        'payload': jsonEncode(event.payload),
        'payload_hash': event.payloadHash,
        'source_device_id': event.sourceDeviceId,
        'status': 'RECEIVED',
      });

      // The original field-officer identity and the original occurrence time
      // travel with the operation; the queue remains idempotent by local id.
      final id = await txn.insert('pending_operations', {
        'operation_type': event.operationType,
        'local_entity_id': event.localEntityId,
        'payload': jsonEncode(event.payload),
        'tenant_id': event.tenantId,
        'branch_id': event.branchId,
        'user_id': event.actorUserId,
        'relay_event_id': event.eventId,
        'created_at': event.occurredAt.millisecondsSinceEpoch,
        'retry_count': 0,
        'status': OperationStatus.pending,
      }, conflictAlgorithm: ConflictAlgorithm.ignore);

      if (id != 0) {
        await txn.update(
          'branch_relay_events',
          {'imported_pending_operation_id': id, 'status': 'QUEUED'},
          where: 'event_id = ?',
          whereArgs: [event.eventId],
        );
        await _projectReceivedEvent(txn, event);
      }
      return true;
    });
  }

  /// Keeps the manager's on-device branch data truthful while the branch is
  /// offline. The durable queue remains the upload authority; this is only a
  /// local projection of an already accepted field-officer event.
  Future<void> _projectReceivedEvent(
    Transaction txn,
    BranchRelayEvent event,
  ) async {
    if (event.operationType == OperationType.loanApplicationCreate) {
      await _projectLoanApplication(txn, event);
      return;
    }
    if (event.operationType != OperationType.paymentCreate &&
        event.operationType != OperationType.collectionCreate) {
      return;
    }
    final loanId = event.payload['loanId']?.toString();
    final amount = _number(event.payload['amount']);
    if (loanId == null || loanId.isEmpty || amount <= 0) return;

    final loanRows = await txn.query(
      'loans',
      columns: ['customer_id', 'outstanding_balance', 'total_paid'],
      where: 'id = ? AND tenant_id = ? AND branch_id = ?',
      whereArgs: [loanId, event.tenantId, event.branchId],
      limit: 1,
    );
    if (loanRows.isEmpty) return;
    final loan = loanRows.first;
    final customerId = loan['customer_id']?.toString();
    if (customerId == null || customerId.isEmpty) return;

    final occurredAt = event.occurredAt.toUtc();
    final reference =
        event.payload['receiptNumber']?.toString() ??
        event.payload['referenceNumber']?.toString();
    await txn.insert('collections', {
      'id': null,
      'local_id': event.localEntityId,
      'tenant_id': event.tenantId,
      'branch_id': event.branchId,
      'agent_id': event.actorUserId,
      'loan_id': loanId,
      'customer_id': customerId,
      'amount': amount,
      'collection_date': occurredAt.millisecondsSinceEpoch,
      'receipt_number': reference,
      'notes':
          event.payload['notes']?.toString() ??
          event.payload['note']?.toString(),
      'status': 'PENDING_SYNC',
      'created_at': occurredAt.millisecondsSinceEpoch,
      'synced_at': null,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);

    final outstanding = _number(loan['outstanding_balance']);
    final totalPaid = _number(loan['total_paid']);
    await txn.update(
      'loans',
      {
        'outstanding_balance': (outstanding - amount).clamp(0, double.infinity),
        'total_paid': totalPaid + amount,
        'updated_at': DateTime.now().toUtc().millisecondsSinceEpoch,
      },
      where: 'id = ?',
      whereArgs: [loanId],
    );
  }

  Future<void> _projectLoanApplication(
    Transaction txn,
    BranchRelayEvent event,
  ) async {
    final payload = event.payload;
    final firstName = payload['applicantFirstName']?.toString().trim();
    final lastName = payload['applicantLastName']?.toString().trim();
    final phone = payload['applicantPhone']?.toString().trim();
    final productId = payload['loanProductId']?.toString().trim();
    final requestedAmount = _number(payload['requestedAmount']);
    if (firstName == null ||
        firstName.isEmpty ||
        lastName == null ||
        lastName.isEmpty ||
        phone == null ||
        phone.isEmpty ||
        productId == null ||
        productId.isEmpty ||
        requestedAmount <= 0) {
      return;
    }

    // This mirrors the officer's local application so that the manager can
    // review it offline. The queued event remains the authoritative upload.
    await txn.insert('loan_applications', {
      'id': null,
      'local_id': event.localEntityId,
      'tenant_id': event.tenantId,
      'branch_id': event.branchId,
      'agent_id': event.actorUserId,
      'customer_id': payload['customerId']?.toString(),
      'status': 'SUBMITTED',
      'applicant_nin': payload['applicantNin']?.toString(),
      'applicant_first_name': firstName,
      'applicant_last_name': lastName,
      'applicant_phone': phone,
      'applicant_village': payload['applicantVillage']?.toString(),
      'requested_amount': requestedAmount,
      'initial_disbursement_amount': _nullableNumber(
        payload['initialDisbursementAmount'],
      ),
      'collected_repayments_amount': _number(
        payload['collectedRepaymentsAmount'],
      ),
      'processing_fee': _number(payload['processingFee']),
      'loan_product_id': productId,
      'guarantor_name': payload['guarantorName']?.toString(),
      'guarantor_phone': payload['guarantorPhone']?.toString(),
      'guarantor_nin': payload['guarantorNin']?.toString(),
      'business_description': payload['businessDescription']?.toString(),
      'disbursement_note': payload['disbursementNote']?.toString(),
      'operation_date':
          payload['operationDate']?.toString() ?? _dateLabel(event.occurredAt),
      'created_at': event.occurredAt.millisecondsSinceEpoch,
      'submitted_at': event.occurredAt.millisecondsSinceEpoch,
      'synced_at': null,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  double _number(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  double? _nullableNumber(Object? value) {
    if (value == null) return null;
    return _number(value);
  }

  String _dateLabel(DateTime value) {
    final date = value.toLocal();
    return '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
  }

  Future<BranchRelayTransfer> startOrResumeTransfer({
    required String sessionId,
    required String direction,
    required String contentType,
    required String contentId,
    required int totalBytes,
    required String sha256,
    required String transferId,
  }) async {
    final db = await _database.database;
    final rows = await db.query(
      'branch_relay_transfers',
      where: 'session_id = ? AND direction = ? AND content_id = ?',
      whereArgs: [sessionId, direction, contentId],
      limit: 1,
    );
    if (rows.isNotEmpty) return _transferFromMap(rows.first);

    final now = DateTime.now().toUtc();
    await db.insert('branch_relay_transfers', {
      'transfer_id': transferId,
      'session_id': sessionId,
      'direction': direction,
      'content_type': contentType,
      'content_id': contentId,
      'total_bytes': totalBytes,
      'acknowledged_bytes': 0,
      'sha256': sha256,
      'created_at': now.millisecondsSinceEpoch,
      'updated_at': now.millisecondsSinceEpoch,
      'status': 'IN_PROGRESS',
    });
    return BranchRelayTransfer(
      transferId: transferId,
      sessionId: sessionId,
      direction: direction,
      contentType: contentType,
      contentId: contentId,
      totalBytes: totalBytes,
      acknowledgedBytes: 0,
      sha256: sha256,
      createdAt: now,
      updatedAt: now,
      status: 'IN_PROGRESS',
    );
  }

  Future<void> acknowledgeTransfer({
    required String transferId,
    required int acknowledgedBytes,
    required bool completed,
  }) async {
    final db = await _database.database;
    await db.update(
      'branch_relay_transfers',
      {
        'acknowledged_bytes': acknowledgedBytes,
        'updated_at': DateTime.now().toUtc().millisecondsSinceEpoch,
        if (completed)
          'completed_at': DateTime.now().toUtc().millisecondsSinceEpoch,
        'status': completed ? 'COMPLETED' : 'IN_PROGRESS',
      },
      where: 'transfer_id = ?',
      whereArgs: [transferId],
    );
  }

  BranchRelayTransfer _transferFromMap(
    Map<String, Object?> row,
  ) => BranchRelayTransfer(
    transferId: row['transfer_id']! as String,
    sessionId: row['session_id']! as String,
    direction: row['direction']! as String,
    contentType: row['content_type']! as String,
    contentId: row['content_id']! as String,
    totalBytes: row['total_bytes']! as int,
    acknowledgedBytes: row['acknowledged_bytes']! as int,
    sha256: row['sha256']! as String,
    createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
    updatedAt: DateTime.fromMillisecondsSinceEpoch(row['updated_at']! as int),
    status: row['status']! as String,
  );
}
