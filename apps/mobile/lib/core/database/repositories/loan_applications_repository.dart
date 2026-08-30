import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/loan_application_local.dart';
import '../models/pending_operation.dart';
import 'dart:convert';

/// Repository for loan application data operations
class LoanApplicationsRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all loan applications for an agent
  Future<List<LoanApplicationLocal>> getByAgentId(String agentId) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_applications',
      where: 'agent_id = ?',
      whereArgs: [agentId],
      orderBy: 'created_at DESC',
    );

    return maps.map((map) => LoanApplicationLocal.fromMap(map)).toList();
  }

  /// Get pending loan applications (not synced)
  Future<List<LoanApplicationLocal>> getPendingSync() async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_applications',
      where: 'status = ? AND synced_at IS NULL',
      whereArgs: ['SUBMITTED'],
      orderBy: 'submitted_at ASC',
    );

    return maps.map((map) => LoanApplicationLocal.fromMap(map)).toList();
  }

  /// Get draft loan applications
  Future<List<LoanApplicationLocal>> getDrafts(String agentId) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_applications',
      where: 'agent_id = ? AND status = ?',
      whereArgs: [agentId, 'DRAFT'],
      orderBy: 'created_at DESC',
    );

    return maps.map((map) => LoanApplicationLocal.fromMap(map)).toList();
  }

  /// Get loan application by local ID
  Future<LoanApplicationLocal?> getByLocalId(String localId) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_applications',
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return LoanApplicationLocal.fromMap(maps.first);
  }

  /// Insert loan application
  Future<void> insert(LoanApplicationLocal application) async {
    final database = await _db.database;
    await database.insert(
      'loan_applications',
      application.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Update loan application
  Future<void> update(LoanApplicationLocal application) async {
    final database = await _db.database;
    await database.update(
      'loan_applications',
      application.toMap(),
      where: 'local_id = ?',
      whereArgs: [application.localId],
    );
  }

  /// Submit loan application (mark as ready for sync)
  Future<void> submit(String localId) async {
    final database = await _db.database;

    // Update application status
    await database.update(
      'loan_applications',
      {
        'status': 'SUBMITTED',
        'submitted_at': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'local_id = ?',
      whereArgs: [localId],
    );

    // Add to pending operations queue
    final application = await getByLocalId(localId);
    if (application != null) {
      await _addToPendingQueue(application);
    }
  }

  /// Add loan application to pending operations queue
  Future<void> _addToPendingQueue(LoanApplicationLocal application) async {
    final database = await _db.database;

    final payload = jsonEncode({
      'applicantNin': application.applicantNin,
      'applicantFirstName': application.applicantFirstName,
      'applicantLastName': application.applicantLastName,
      'applicantPhone': application.applicantPhone,
      'applicantVillage': application.applicantVillage,
      'requestedAmount': application.requestedAmount,
      if (application.initialDisbursementAmount != null)
        'initialDisbursementAmount': application.initialDisbursementAmount,
      if (application.collectedRepaymentsAmount > 0)
        'collectedRepaymentsAmount': application.collectedRepaymentsAmount,
      if (application.initialDisbursementAmount != null)
        'initialDisbursementLocalId': '${application.localId}-initial-cash',
      if (application.disbursementNote?.trim().isNotEmpty == true)
        'disbursementNote': application.disbursementNote!.trim(),
      'processingFee': application.processingFee,
      'loanProductId': application.loanProductId,
      'guarantorName': application.guarantorName,
      'guarantorPhone': application.guarantorPhone,
      'guarantorNin': application.guarantorNin,
      'businessDescription': application.businessDescription,
    });

    await database.insert('pending_operations', {
      'operation_type': OperationType.loanApplicationCreate,
      'local_entity_id': application.localId,
      'payload': payload,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'retry_count': 0,
      'status': OperationStatus.pending,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// Mark loan application as synced with server ID
  Future<void> markAsSynced(String localId, String serverId) async {
    final database = await _db.database;
    await database.update(
      'loan_applications',
      {
        'id': serverId,
        'status': 'SYNCED',
        'synced_at': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  /// Delete loan application (drafts only)
  Future<void> delete(String localId) async {
    final database = await _db.database;
    await database.delete(
      'loan_applications',
      where: 'local_id = ? AND status = ?',
      whereArgs: [localId, 'DRAFT'],
    );
  }

  /// Get count of pending applications
  Future<int> getPendingCount() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM loan_applications WHERE status = ? AND synced_at IS NULL',
      ['SUBMITTED'],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }
}
