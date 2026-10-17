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

  Future<Database> _relayDatabase() async {
    await _database.ensureBranchRelaySchema();
    return _database.database;
  }

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

  Future<BranchRelayDistribution?> latestDistribution({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _relayDatabase();
    final rows = await db.query(
      'branch_relay_distributions',
      where: 'tenant_id = ? AND branch_id = ? AND status = ?',
      whereArgs: [tenantId, branchId, 'READY'],
      orderBy: 'created_at DESC',
      limit: 1,
    );
    return rows.isEmpty ? null : BranchRelayDistribution.fromMap(rows.first);
  }

  Future<String?> appliedDistributionId({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _relayDatabase();
    final rows = await db.query(
      'branch_relay_distribution_state',
      columns: ['distribution_id'],
      where: 'tenant_id = ? AND branch_id = ?',
      whereArgs: [tenantId, branchId],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['distribution_id'] as String;
  }

  Future<String?> appliedDistributionVersion({
    required String tenantId,
    required String branchId,
  }) async {
    final db = await _relayDatabase();
    final rows = await db.rawQuery(
      '''
      SELECT distribution.version_label
      FROM branch_relay_distribution_state AS state
      INNER JOIN branch_relay_distributions AS distribution
        ON distribution.distribution_id = state.distribution_id
      WHERE state.tenant_id = ? AND state.branch_id = ?
      LIMIT 1
      ''',
      [tenantId, branchId],
    );
    return rows.isEmpty ? null : rows.first['version_label'] as String?;
  }

  Future<List<BranchRelayCollectionOfficer>> collectionOfficers({
    required String sessionId,
    required String tenantId,
    required String branchId,
    required Iterable<String> receivedOfficerNames,
    required Map<String, String> participantStatusByName,
  }) async {
    final db = await _database.database;
    final agents = await db.query(
      'agents',
      columns: ['id', 'first_name', 'last_name', 'role'],
      where: 'tenant_id = ? AND branch_id = ? AND is_active = 1',
      whereArgs: [tenantId, branchId],
      orderBy: 'first_name COLLATE NOCASE, last_name COLLATE NOCASE',
    );
    final decisions = await db.query(
      'branch_relay_collection_decisions',
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );
    final decisionByAgent = {
      for (final decision in decisions)
        decision['agent_id'] as String: decision['status'] as String,
    };
    final received = receivedOfficerNames.map(_normaliseName).toSet();
    return agents
        .where((agent) {
          final role = (agent['role'] as String? ?? '').toLowerCase();
          return role.contains('agent') || role.contains('field officer');
        })
        .map((agent) {
          final id = agent['id'] as String;
          final name = [
            agent['first_name'] as String? ?? '',
            agent['last_name'] as String? ?? '',
          ].where((part) => part.trim().isNotEmpty).join(' ');
          final savedStatus = decisionByAgent[id];
          final receivedByManager = received.contains(_normaliseName(name));
          final participantStatus =
              participantStatusByName[_normaliseName(name)];
          return BranchRelayCollectionOfficer(
            agentId: id,
            name: name.isEmpty ? 'Field officer' : name,
            // A manager skip is an explicit daily accounting decision. Keep it
            // authoritative even when a previously paired device reconnects.
            status: savedStatus == 'SKIPPED'
                ? 'SKIPPED'
                : (receivedByManager
                      ? 'RECEIVED'
                      : (participantStatus ?? savedStatus ?? 'WAITING')),
          );
        })
        .toList();
  }

  Future<void> setCollectionOfficerStatus({
    required String sessionId,
    required String agentId,
    required String status,
  }) async {
    final db = await _database.database;
    await db.insert(
      'branch_relay_collection_decisions',
      {
        'session_id': sessionId,
        'agent_id': agentId,
        'status': status,
        'updated_at': DateTime.now().toUtc().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Returns the immutable event envelopes the manager accepted from one
  /// field device. This is intentionally read from the relay journal rather
  /// than projected branch tables so the collection review remains auditable.
  Future<List<BranchRelayEvent>> receivedEvents({
    required String tenantId,
    required String branchId,
    required String sourceDeviceId,
  }) async {
    final db = await _database.database;
    final rows = await db.query(
      'branch_relay_events',
      where:
          'tenant_id = ? AND branch_id = ? AND source_device_id = ? AND received_at IS NOT NULL',
      whereArgs: [tenantId, branchId, sourceDeviceId],
      orderBy: 'occurred_at ASC',
    );
    return rows.map((row) {
      final payload = Map<String, dynamic>.from(
        jsonDecode(row['payload']! as String) as Map,
      );
      return BranchRelayEvent(
        eventId: row['event_id']! as String,
        sessionId: row['session_id']! as String,
        tenantId: row['tenant_id']! as String,
        branchId: row['branch_id']! as String,
        actorUserId: row['actor_user_id']! as String,
        operationType: row['operation_type']! as String,
        localEntityId: row['local_entity_id']! as String,
        occurredAt: DateTime.fromMillisecondsSinceEpoch(
          row['occurred_at']! as int,
          isUtc: true,
        ),
        receivedAt: row['received_at'] == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(
                row['received_at']! as int,
                isUtc: true,
              ),
        payload: payload,
        payloadHash: row['payload_hash']! as String,
        sourceDeviceId: row['source_device_id']! as String,
        status: row['status']! as String,
      );
    }).toList();
  }

  /// Captures the manager's consolidated branch at one instant. Every row is
  /// retained for a first/full distribution; `is_changed` marks the compact
  /// delta available to an officer on the immediately preceding version.
  Future<BranchRelayDistribution> prepareDistribution({
    required String distributionId,
    required String tenantId,
    required String branchId,
    required String userId,
    required DateTime cutoffAt,
  }) async {
    // Existing app installs can have an already-open database from before the
    // distribution tables were introduced. Upgrade it before starting the
    // transaction, including the cleanup of prior distribution offers.
    final db = await _relayDatabase();
    final day = _businessDay(cutoffAt);
    final latest = await latestDistribution(
      tenantId: tenantId,
      branchId: branchId,
    );
    final sequenceRow = (await db.rawQuery(
      'SELECT COALESCE(MAX(sequence), 0) AS value FROM branch_relay_distributions '
      'WHERE tenant_id = ? AND branch_id = ? AND business_day = ?',
      [tenantId, branchId, day],
    )).first;
    final sequence = ((sequenceRow['value'] as num?)?.toInt() ?? 0) + 1;
    final distribution = BranchRelayDistribution(
      distributionId: distributionId,
      tenantId: tenantId,
      branchId: branchId,
      versionLabel:
          '${_versionDate(cutoffAt)} V.${sequence.toString().padLeft(2, '0')}',
      sequence: sequence,
      businessDay: day,
      cutoffAt: cutoffAt.toUtc(),
      createdAt: DateTime.now().toUtc(),
      createdByUserId: userId,
      previousDistributionId: latest?.distributionId,
      status: 'READY',
    );

    await db.transaction((txn) async {
      await txn.insert('branch_relay_distributions', distribution.toMap());
      for (final table in snapshotTables) {
        final rows = await _snapshotRowsFor(txn, table, tenantId, branchId);
        final previous = <String, String>{};
        if (latest != null) {
          final previousRows = await txn.query(
            'branch_relay_distribution_rows',
            columns: ['row_key', 'row_hash'],
            where: 'distribution_id = ? AND table_name = ? AND is_deleted = 0',
            whereArgs: [latest.distributionId, table],
          );
          for (final row in previousRows) {
            previous[row['row_key']! as String] =
                row['row_hash'] as String? ?? '';
          }
        }
        final currentKeys = <String>{};
        final batch = txn.batch();
        for (final row in rows) {
          final key = _rowKey(row);
          final payload = jsonEncode(row);
          final hash = _stableHash(payload);
          currentKeys.add(key);
          batch.insert('branch_relay_distribution_rows', {
            'distribution_id': distribution.distributionId,
            'table_name': table,
            'row_key': key,
            'row_payload': payload,
            'row_hash': hash,
            'is_deleted': 0,
            'is_changed': latest == null || previous[key] != hash ? 1 : 0,
          });
        }
        for (final removedKey in previous.keys.where(
          (key) => !currentKeys.contains(key),
        )) {
          batch.insert('branch_relay_distribution_rows', {
            'distribution_id': distribution.distributionId,
            'table_name': table,
            'row_key': removedKey,
            'row_payload': null,
            'row_hash': null,
            'is_deleted': 1,
            'is_changed': 1,
          });
        }
        await batch.commit(noResult: true);
      }
      await _pruneFrozenDistributions(
        txn,
        tenantId: tenantId,
        branchId: branchId,
        keepDistributionIds: {
          distribution.distributionId,
          if (latest != null) latest.distributionId,
        },
      );
    });
    return distribution;
  }

  /// Delta transfers only need the most recent frozen package and its direct
  /// predecessor. Devices that miss an older version receive the latest full
  /// package, so retaining every historical copy would only consume storage.
  Future<void> _pruneFrozenDistributions(
    Transaction transaction, {
    required String tenantId,
    required String branchId,
    required Set<String> keepDistributionIds,
  }) async {
    final rows = await transaction.query(
      'branch_relay_distributions',
      columns: ['distribution_id'],
      where: 'tenant_id = ? AND branch_id = ?',
      whereArgs: [tenantId, branchId],
    );
    final remove = rows
        .map((row) => row['distribution_id'] as String)
        .where((id) => !keepDistributionIds.contains(id))
        .toList();
    if (remove.isEmpty) return;
    final placeholders = List.filled(remove.length, '?').join(', ');
    await transaction.delete(
      'branch_relay_distribution_rows',
      where: 'distribution_id IN ($placeholders)',
      whereArgs: remove,
    );
    await transaction.delete(
      'branch_relay_distribution_offers',
      where: 'distribution_id IN ($placeholders)',
      whereArgs: remove,
    );
    await transaction.delete(
      'branch_relay_distributions',
      where: 'distribution_id IN ($placeholders)',
      whereArgs: remove,
    );
  }

  Future<Map<String, int>> distributionManifest({
    required String distributionId,
    required bool deltaOnly,
  }) async {
    final db = await _relayDatabase();
    final counts = <String, int>{};
    for (final table in snapshotTables) {
      final row = (await db.rawQuery(
        'SELECT COUNT(*) AS count FROM branch_relay_distribution_rows '
        'WHERE distribution_id = ? AND table_name = ? ${deltaOnly ? 'AND is_changed = 1' : ''}',
        [distributionId, table],
      )).first;
      counts[table] = (row['count'] as num?)?.toInt() ?? 0;
    }
    return counts;
  }

  Future<void> offerDistribution({
    required String distributionId,
    required String deviceId,
    String? officerUserId,
    String? officerName,
  }) async {
    final db = await _relayDatabase();
    final now = DateTime.now().toUtc().millisecondsSinceEpoch;
    await db.rawInsert(
      '''
      INSERT INTO branch_relay_distribution_offers (
        distribution_id, device_id, officer_user_id, officer_name,
        status, offered_at, accepted_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, 'OFFERED', ?, NULL, NULL, ?)
      ON CONFLICT(distribution_id, device_id) DO UPDATE SET
        officer_user_id = excluded.officer_user_id,
        officer_name = excluded.officer_name,
        status = 'OFFERED',
        offered_at = excluded.offered_at,
        accepted_at = NULL,
        completed_at = NULL,
        updated_at = excluded.updated_at
      ''',
      [distributionId, deviceId, officerUserId, officerName, now, now],
    );
  }

  Future<BranchRelayDistributionOffer?> distributionOffer({
    required String distributionId,
    required String deviceId,
  }) async {
    final db = await _relayDatabase();
    final rows = await db.query(
      'branch_relay_distribution_offers',
      where: 'distribution_id = ? AND device_id = ?',
      whereArgs: [distributionId, deviceId],
      limit: 1,
    );
    return rows.isEmpty
        ? null
        : BranchRelayDistributionOffer.fromMap(rows.first);
  }

  Future<List<BranchRelayDistributionOffer>> distributionOffers(
    String distributionId,
  ) async {
    final db = await _relayDatabase();
    final rows = await db.query(
      'branch_relay_distribution_offers',
      where: 'distribution_id = ?',
      whereArgs: [distributionId],
      orderBy: 'updated_at DESC',
    );
    return rows.map(BranchRelayDistributionOffer.fromMap).toList();
  }

  Future<void> updateDistributionOfferStatus({
    required String distributionId,
    required String deviceId,
    required String status,
  }) async {
    final db = await _relayDatabase();
    final now = DateTime.now().toUtc().millisecondsSinceEpoch;
    final acceptedAt = status == 'ACCEPTED' ? now : null;
    final completedAt = status == 'COMPLETED' ? now : null;
    await db.rawUpdate(
      '''
      UPDATE branch_relay_distribution_offers
      SET status = ?,
          accepted_at = CASE WHEN ? IS NOT NULL THEN ? ELSE accepted_at END,
          completed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE completed_at END,
          updated_at = ?
      WHERE distribution_id = ? AND device_id = ?
      ''',
      [
        status,
        acceptedAt,
        acceptedAt,
        completedAt,
        completedAt,
        now,
        distributionId,
        deviceId,
      ],
    );
  }

  Future<List<Map<String, Object?>>> distributionPage({
    required String distributionId,
    required String table,
    required bool deltaOnly,
    required int offset,
    required int limit,
  }) async {
    final db = await _relayDatabase();
    return db.query(
      'branch_relay_distribution_rows',
      columns: ['row_key', 'row_payload', 'is_deleted'],
      where:
          'distribution_id = ? AND table_name = ? ${deltaOnly ? 'AND is_changed = 1' : ''}',
      whereArgs: [distributionId, table],
      orderBy: 'row_key ASC',
      limit: limit,
      offset: offset,
    );
  }

  Future<void> stageDistributionPage({
    required String sessionId,
    required String table,
    required int offset,
    required List<Map<String, dynamic>> rows,
  }) async {
    final db = await _relayDatabase();
    await db.transaction((txn) async {
      await txn.delete(
        'branch_relay_snapshot_rows',
        where: 'session_id = ? AND table_name = ? AND page_offset = ?',
        whereArgs: [sessionId, 'distribution:$table', offset],
      );
      final batch = txn.batch();
      for (var index = 0; index < rows.length; index++) {
        batch.insert('branch_relay_snapshot_rows', {
          'session_id': sessionId,
          'table_name': 'distribution:$table',
          'page_offset': offset,
          'row_index': index,
          'row_payload': jsonEncode(rows[index]),
        });
      }
      await batch.commit(noResult: true);
    });
  }

  Future<bool> hasStagedDistributionPage({
    required String sessionId,
    required String table,
    required int offset,
    required int expectedRows,
  }) async {
    if (expectedRows == 0) return true;
    final db = await _relayDatabase();
    final row = (await db.rawQuery(
      'SELECT COUNT(*) AS count FROM branch_relay_snapshot_rows '
      'WHERE session_id = ? AND table_name = ? AND page_offset = ?',
      [sessionId, 'distribution:$table', offset],
    )).first;
    return (row['count'] as num?)?.toInt() == expectedRows;
  }

  Future<void> activateStagedDistribution({
    required String sessionId,
    required String distributionId,
    required String tenantId,
    required String branchId,
    required bool full,
  }) async {
    final db = await _relayDatabase();
    await db.transaction((txn) async {
      for (final table in snapshotTables) {
        final scopeWhere = table == 'loan_products'
            ? 'tenant_id = ?'
            : table == 'branches'
            ? 'tenant_id = ? AND id = ?'
            : 'tenant_id = ? AND branch_id = ?';
        final scopeArgs = table == 'loan_products'
            ? <Object?>[tenantId]
            : <Object?>[tenantId, branchId];
        if (full) {
          await txn.delete(table, where: scopeWhere, whereArgs: scopeArgs);
        }
        final staged = await txn.query(
          'branch_relay_snapshot_rows',
          columns: ['row_payload'],
          where: 'session_id = ? AND table_name = ?',
          whereArgs: [sessionId, 'distribution:$table'],
          orderBy: 'page_offset ASC, row_index ASC',
        );
        final batch = txn.batch();
        for (final item in staged) {
          final change = Map<String, dynamic>.from(
            jsonDecode(item['row_payload']! as String) as Map,
          );
          final deleted =
              change['is_deleted'] == 1 || change['is_deleted'] == true;
          final key = change['row_key']?.toString();
          if (deleted && key != null) {
            // Loan applications can exist locally before the server has issued
            // an id, so their stable relay key is local_id instead.
            final where = table == 'loan_applications'
                ? 'id = ? OR local_id = ?'
                : 'id = ?';
            final args = table == 'loan_applications'
                ? <Object?>[key, key]
                : <Object?>[key];
            batch.delete(table, where: where, whereArgs: args);
          } else {
            final payload = change['row_payload'];
            if (payload is String) {
              batch.insert(
                table,
                Map<String, dynamic>.from(jsonDecode(payload) as Map),
                conflictAlgorithm: ConflictAlgorithm.replace,
              );
            }
          }
        }
        await batch.commit(noResult: true);
      }
      await txn.insert(
        'branch_relay_distribution_state',
        {
          'tenant_id': tenantId,
          'branch_id': branchId,
          'distribution_id': distributionId,
          'applied_at': DateTime.now().toUtc().millisecondsSinceEpoch,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      await txn.delete(
        'branch_relay_snapshot_rows',
        where: 'session_id = ? AND table_name LIKE ?',
        whereArgs: [sessionId, 'distribution:%'],
      );
    });
  }

  Future<List<Map<String, Object?>>> _snapshotRowsFor(
    DatabaseExecutor db,
    String table,
    String tenantId,
    String branchId,
  ) {
    final where = table == 'loan_products'
        ? 'tenant_id = ?'
        : table == 'branches'
        ? 'tenant_id = ? AND id = ?'
        : 'tenant_id = ? AND branch_id = ?';
    final args = table == 'loan_products' ? [tenantId] : [tenantId, branchId];
    return db.query(table, where: where, whereArgs: args, orderBy: 'id ASC');
  }

  String _rowKey(Map<String, Object?> row) {
    final key = row['id']?.toString() ?? row['local_id']?.toString();
    if (key == null || key.isEmpty) {
      throw StateError('A branch record has no stable id.');
    }
    return key;
  }

  String _stableHash(String value) {
    var hash = 0xcbf29ce484222325;
    for (final unit in utf8.encode(value)) {
      hash ^= unit;
      hash = (hash * 0x100000001b3) & 0x7fffffffffffffff;
    }
    return hash.toRadixString(16);
  }

  String _businessDay(DateTime value) {
    final date = value.toLocal();
    return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  String _versionDate(DateTime value) {
    final date = value.toLocal();
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final period = date.hour >= 12 ? 'PM' : 'AM';
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${(date.year % 100).toString().padLeft(2, '0')} ${hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')} $period';
  }

  String _normaliseName(String value) => value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');

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
