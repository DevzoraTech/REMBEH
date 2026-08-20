import 'dart:convert';
import 'package:http/http.dart' as http;
import '../database/local_database.dart';
import '../database/repositories/pending_operations_repository.dart';
import '../database/models/pending_operation.dart';
import '../database/repositories/loan_applications_repository.dart';
import '../../services/auth_service.dart';

/// Service for uploading pending operations queue
class UploadService {
  final LocalDatabase _db = LocalDatabase.instance;
  final PendingOperationsRepository _operationsRepo =
      PendingOperationsRepository();
  final LoanApplicationsRepository _loanAppsRepo =
      LoanApplicationsRepository();
  final AuthService _authService;
  final String _baseUrl;

  UploadService(this._authService, this._baseUrl);

  /// Upload all pending operations
  Future<UploadResult> uploadPendingQueue() async {
    try {
      // Get pending operations
      final pendingOps = await _operationsRepo.getAllPending();
      final failedOps = await _operationsRepo.getFailedOperations();

      final allOps = [...pendingOps, ...failedOps];

      if (allOps.isEmpty) {
        return UploadResult(
          success: true,
          processedCount: 0,
          conflictCount: 0,
          errorCount: 0,
        );
      }

      // Get auth token
      final token = await _authService.getAccessToken();
      if (token == null) {
        throw Exception('Not authenticated');
      }

      // Upload in batches of 50
      const batchSize = 50;
      int totalProcessed = 0;
      int totalConflicts = 0;
      int totalErrors = 0;
      final List<Conflict> conflicts = [];

      for (int i = 0; i < allOps.length; i += batchSize) {
        final batch = allOps.skip(i).take(batchSize).toList();
        final result = await _uploadBatch(token, batch);

        totalProcessed += result.processed.length;
        totalConflicts += result.conflicts.length;
        totalErrors += result.errors.length;
        conflicts.addAll(result.conflicts);

        // Process results
        await _processUploadResults(batch, result);
      }

      return UploadResult(
        success: true,
        processedCount: totalProcessed,
        conflictCount: totalConflicts,
        errorCount: totalErrors,
        conflicts: conflicts,
      );
    } catch (e) {
      return UploadResult(
        success: false,
        error: e.toString(),
      );
    }
  }

  /// Upload a batch of operations
  Future<BatchUploadResult> _uploadBatch(
    String token,
    List<PendingOperation> operations,
  ) async {
    final uri = Uri.parse('$_baseUrl/api/v1/sync/upload-queue');

    final body = jsonEncode({
      'operations': operations
          .map((op) => {
                'localId': op.localEntityId,
                'type': op.operationType,
                'createdAt': op.createdAt.toIso8601String(),
                'payload': jsonDecode(op.payload),
              })
          .toList(),
    });

    final response = await http.post(
      uri,
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: body,
    ).timeout(
      const Duration(seconds: 60),
      onTimeout: () {
        throw Exception('Upload timeout - check your internet connection');
      },
    );

    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception(
          'Failed to upload operations: ${response.statusCode} ${response.body}');
    }

    final data = jsonDecode(response.body);
    return BatchUploadResult.fromJson(data);
  }

  /// Process upload results and update local database
  Future<void> _processUploadResults(
    List<PendingOperation> operations,
    BatchUploadResult result,
  ) async {
    // Process successful uploads
    for (final processed in result.processed) {
      final operation = operations.firstWhere(
        (op) => op.localEntityId == processed.localId,
      );

      // Mark operation as uploaded
      if (operation.id != null) {
        await _operationsRepo.markAsUploaded(operation.id!);
      }

      // Update entity with server ID
      await _updateEntityWithServerId(
        operation.operationType,
        processed.localId,
        processed.serverId,
      );
    }

    // Process conflicts
    for (final conflict in result.conflicts) {
      final operation = operations.firstWhere(
        (op) => op.localEntityId == conflict.localId,
      );

      if (operation.id != null) {
        await _operationsRepo.updateStatus(
          operation.id!,
          OperationStatus.conflict,
          lastError: conflict.message,
        );
      }

      // Store conflict for user review
      await _storeConflict(conflict);
    }

    // Process errors
    for (final error in result.errors) {
      final operation = operations.firstWhere(
        (op) => op.localEntityId == error.localId,
      );

      if (operation.id != null) {
        await _operationsRepo.markAsFailed(
          operation.id!,
          error.message,
          operation.retryCount + 1,
        );
      }
    }
  }

  /// Update local entity with server-generated ID
  Future<void> _updateEntityWithServerId(
    String operationType,
    String localId,
    String serverId,
  ) async {
    switch (operationType) {
      case OperationType.loanApplicationCreate:
        await _loanAppsRepo.markAsSynced(localId, serverId);
        break;
      // Handle other operation types...
    }
  }

  /// Store conflict for user review
  Future<void> _storeConflict(Conflict conflict) async {
    final database = await _db.database;
    await database.insert(
      'sync_conflicts',
      {
        'operation_type': conflict.localId,
        'local_entity_id': conflict.localId,
        'local_data': '{}', // TODO: Load from operation
        'server_data': jsonEncode(conflict.serverData ?? {}),
        'created_at': DateTime.now().millisecondsSinceEpoch,
      },
    );
  }
}

/// Result of batch upload
class BatchUploadResult {
  final List<ProcessedOp> processed;
  final List<Conflict> conflicts;
  final List<OperationError> errors;

  BatchUploadResult({
    required this.processed,
    required this.conflicts,
    required this.errors,
  });

  factory BatchUploadResult.fromJson(Map<String, dynamic> json) {
    return BatchUploadResult(
      processed: (json['processed'] as List)
          .map((e) => ProcessedOp.fromJson(e as Map<String, dynamic>))
          .toList(),
      conflicts: (json['conflicts'] as List)
          .map((e) => Conflict.fromJson(e as Map<String, dynamic>))
          .toList(),
      errors: (json['errors'] as List)
          .map((e) => OperationError.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ProcessedOp {
  final String localId;
  final String serverId;
  final String status;

  ProcessedOp({
    required this.localId,
    required this.serverId,
    required this.status,
  });

  factory ProcessedOp.fromJson(Map<String, dynamic> json) {
    return ProcessedOp(
      localId: json['localId'] as String,
      serverId: json['serverId'] as String,
      status: json['status'] as String,
    );
  }
}

class Conflict {
  final String localId;
  final String reason;
  final String message;
  final Map<String, dynamic>? serverData;

  Conflict({
    required this.localId,
    required this.reason,
    required this.message,
    this.serverData,
  });

  factory Conflict.fromJson(Map<String, dynamic> json) {
    return Conflict(
      localId: json['localId'] as String,
      reason: json['reason'] as String,
      message: json['message'] as String,
      serverData: json['serverData'] as Map<String, dynamic>?,
    );
  }
}

class OperationError {
  final String localId;
  final String error;
  final String message;

  OperationError({
    required this.localId,
    required this.error,
    required this.message,
  });

  factory OperationError.fromJson(Map<String, dynamic> json) {
    return OperationError(
      localId: json['localId'] as String,
      error: json['error'] as String,
      message: json['message'] as String,
    );
  }
}

/// Result of upload operation
class UploadResult {
  final bool success;
  final int? processedCount;
  final int? conflictCount;
  final int? errorCount;
  final List<Conflict>? conflicts;
  final String? error;

  UploadResult({
    required this.success,
    this.processedCount,
    this.conflictCount,
    this.errorCount,
    this.conflicts,
    this.error,
  });

  bool get hasErrors => (errorCount ?? 0) > 0;
  bool get hasConflicts => (conflictCount ?? 0) > 0;
}
