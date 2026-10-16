import 'dart:async';
import 'connectivity_monitor.dart';
import 'download_service.dart';
import 'sync_errors.dart';
import 'upload_service.dart';
import '../branch_relay/branch_relay_mode.dart';
import '../database/local_database.dart';
import '../database/repositories/pending_operations_repository.dart';
import '../../services/auth_service.dart';

class SyncScope {
  const SyncScope({required this.tenantId, required this.branchId});

  final String? tenantId;
  final String? branchId;

  String get key => '${tenantId ?? 'none'}:${branchId ?? 'all'}';
}

/// Sync status for UI display
class SyncStatus {
  final SyncState state;
  final String? message;
  final double? progress;
  final int? pendingOperations;
  final DateTime? lastSyncAt;

  SyncStatus({
    required this.state,
    this.message,
    this.progress,
    this.pendingOperations,
    this.lastSyncAt,
  });

  factory SyncStatus.idle({DateTime? lastSyncAt, int? pendingOperations}) {
    return SyncStatus(
      state: SyncState.idle,
      lastSyncAt: lastSyncAt,
      pendingOperations: pendingOperations,
    );
  }

  factory SyncStatus.syncing(String message, {double? progress}) {
    return SyncStatus(
      state: SyncState.syncing,
      message: message,
      progress: progress,
    );
  }

  factory SyncStatus.error(String message) {
    return SyncStatus(state: SyncState.error, message: message);
  }

  factory SyncStatus.offline({int? pendingOperations}) {
    return SyncStatus(
      state: SyncState.offline,
      pendingOperations: pendingOperations,
    );
  }
}

/// Sync state enum
enum SyncState { idle, syncing, error, offline }

/// Orchestrates the full sync flow
class SyncService {
  final ConnectivityMonitor _connectivity = ConnectivityMonitor.instance;
  final LocalDatabase _db = LocalDatabase.instance;
  final PendingOperationsRepository _operationsRepo =
      PendingOperationsRepository();
  late final DownloadService _downloadService;
  late final UploadService _uploadService;
  final AuthService _authService;
  final String _baseUrl;

  /// Stream controller for sync status
  final _statusController = StreamController<SyncStatus>.broadcast();

  /// Stream of sync status updates
  Stream<SyncStatus> get statusStream => _statusController.stream;

  Future<SyncResult>? _activeSync;
  Timer? _connectivityDebounce;
  SyncScope? _scope;

  /// Auto-sync subscription
  StreamSubscription? _connectivitySubscription;

  SyncService(this._authService, this._baseUrl) {
    _downloadService = DownloadService(_authService, _baseUrl);
    _uploadService = UploadService(_authService, _baseUrl);
  }

  /// Configure the branch whose snapshot and pending work this service owns.
  /// A device may be used across branches, so cursors must never be shared.
  void configureScope(SyncScope scope) {
    _scope = scope;
    // Backfill only legacy loan applications proven to belong to this branch.
    // Unscoped financial operations remain untouched rather than risking a
    // cross-branch upload.
    final tenantId = scope.tenantId;
    final branchId = scope.branchId;
    if (tenantId != null &&
        tenantId.isNotEmpty &&
        branchId != null &&
        branchId.isNotEmpty) {
      unawaited(
        _db.scopeLegacyLoanApplicationOperations(
          tenantId: tenantId,
          branchId: branchId,
        ),
      );
    }
  }

  /// Initialize sync service and start monitoring
  Future<void> initialize() async {
    await _connectivity.initialize();

    // Emit initial status
    await _emitCurrentStatus();

    // Listen for connectivity changes and auto-sync
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((
      isOnline,
    ) async {
      _connectivityDebounce?.cancel();
      if (isOnline) {
        _connectivityDebounce = Timer(const Duration(seconds: 2), () {
          unawaited(performFullSync(isAutoSync: true));
        });
      } else if (!isOnline) {
        final pending = await _pendingCount();
        _statusController.add(SyncStatus.offline(pendingOperations: pending));
      }
    });
  }

  /// Perform full sync: upload pending → download snapshot
  Future<SyncResult> performFullSync({
    bool isAutoSync = false,
    bool forceFullDownload = false,
  }) {
    final active = _activeSync;
    if (active != null) return active;

    final future = _performSync(
      isAutoSync: isAutoSync,
      forceFullDownload: forceFullDownload,
    );
    _activeSync = future;
    return future.whenComplete(() {
      if (identical(_activeSync, future)) {
        _activeSync = null;
      }
    });
  }

  Future<SyncResult> _performSync({
    required bool isAutoSync,
    required bool forceFullDownload,
  }) async {
    if (await BranchRelayMode.instance.shouldDeferServerSync(
      tenantId: _scope?.tenantId,
      branchId: _scope?.branchId,
    )) {
      final pending = await _pendingCount();
      final lastSyncAt = await _db.getLastSyncTimestamp();
      _statusController.add(
        SyncStatus.idle(lastSyncAt: lastSyncAt, pendingOperations: pending),
      );
      return SyncResult(success: true, deferredToManager: true);
    }
    // Check connectivity
    final isOnline = await _connectivity.checkConnectivity();
    if (!isOnline) {
      final pending = await _pendingCount();
      _statusController.add(SyncStatus.offline(pendingOperations: pending));
      return SyncResult(success: false, error: 'No internet connection');
    }

    try {
      // Step 1: Upload pending operations
      _statusController.add(
        SyncStatus.syncing('Uploading pending changes...', progress: 0.2),
      );
      final uploadResult = await _uploadService.uploadPendingQueue(
        tenantId: _scope?.tenantId,
        branchId: _scope?.branchId,
      );
      if (!uploadResult.success) {
        throw SyncException(
          uploadResult.error ?? 'Could not upload pending changes.',
        );
      }

      // Step 2: Download fresh snapshot
      _statusController.add(
        SyncStatus.syncing('Downloading latest data...', progress: 0.5),
      );
      final scopeChanged =
          _scope != null && await _db.getSnapshotScope() != _scope!.key;
      final lastSyncAt = forceFullDownload || scopeChanged
          ? null
          : await _db.getLastSyncTimestamp();
      final downloadResult = await _downloadService.downloadSnapshot(
        lastSyncAt: lastSyncAt,
        snapshotScope: _scope?.key,
      );
      if (!downloadResult.success) {
        throw SyncException(
          downloadResult.error ?? 'Could not download latest data.',
        );
      }

      // Step 3: Cleanup old uploaded operations
      _statusController.add(
        SyncStatus.syncing('Cleaning up...', progress: 0.9),
      );
      await _operationsRepo.cleanupUploaded();

      // Step 4: Emit final status
      final pending = await _pendingCount();
      final newLastSyncAt = await _db.getLastSyncTimestamp();

      _statusController.add(
        SyncStatus.idle(lastSyncAt: newLastSyncAt, pendingOperations: pending),
      );

      return SyncResult(
        success: true,
        uploadedCount: uploadResult.processedCount ?? 0,
        downloadedCount: downloadResult.recordCount ?? 0,
        conflictCount: uploadResult.conflictCount ?? 0,
        errorCount: uploadResult.errorCount ?? 0,
        conflicts: uploadResult.conflicts,
      );
    } catch (e) {
      final message = cleanSyncException(e);
      _statusController.add(SyncStatus.error(message));
      return SyncResult(success: false, error: message);
    }
  }

  /// Upload only (without downloading new snapshot)
  Future<UploadResult> uploadPendingOnly() async {
    if (await BranchRelayMode.instance.shouldDeferServerSync(
      tenantId: _scope?.tenantId,
      branchId: _scope?.branchId,
    )) {
      return UploadResult(
        success: false,
        error: 'Send saved work to the manager through Branch sharing first.',
      );
    }
    if (!_connectivity.isOnline) {
      return UploadResult(success: false, error: 'No internet connection');
    }

    _statusController.add(SyncStatus.syncing('Uploading pending changes...'));

    final result = await _uploadService.uploadPendingQueue(
      tenantId: _scope?.tenantId,
      branchId: _scope?.branchId,
    );
    await _emitCurrentStatus();
    return result;
  }

  /// Download only (without uploading changes first)
  Future<SnapshotResult> downloadOnly({bool forceFullDownload = false}) async {
    if (await BranchRelayMode.instance.shouldDeferServerSync(
      tenantId: _scope?.tenantId,
      branchId: _scope?.branchId,
    )) {
      return SnapshotResult(
        success: false,
        error:
            'Download branch data from the manager while branch sharing is active.',
      );
    }
    if (!_connectivity.isOnline) {
      return SnapshotResult(success: false, error: 'No internet connection');
    }

    _statusController.add(SyncStatus.syncing('Downloading latest data...'));

    final scopeChanged =
        _scope != null && await _db.getSnapshotScope() != _scope!.key;
    final lastSyncAt = forceFullDownload || scopeChanged
        ? null
        : await _db.getLastSyncTimestamp();
    final result = await _downloadService.downloadSnapshot(
      lastSyncAt: lastSyncAt,
      snapshotScope: _scope?.key,
    );

    await _emitCurrentStatus();
    return result;
  }

  /// Get current sync status
  Future<SyncStatus> getCurrentStatus() async {
    final pending = await _pendingCount();
    final lastSyncAt = await _db.getLastSyncTimestamp();

    if (await BranchRelayMode.instance.shouldDeferServerSync(
      tenantId: _scope?.tenantId,
      branchId: _scope?.branchId,
    )) {
      return SyncStatus.idle(
        lastSyncAt: lastSyncAt,
        pendingOperations: pending,
      );
    }

    final isOnline = await _connectivity.checkConnectivity();

    if (!isOnline) {
      return SyncStatus.offline(pendingOperations: pending);
    }

    return SyncStatus.idle(lastSyncAt: lastSyncAt, pendingOperations: pending);
  }

  /// Emit current status to stream
  Future<void> _emitCurrentStatus() async {
    final status = await getCurrentStatus();
    _statusController.add(status);
  }

  Future<int> _pendingCount() => _operationsRepo.getPendingCount(
    tenantId: _scope?.tenantId,
    branchId: _scope?.branchId,
  );

  /// Dispose resources
  void dispose() {
    _connectivityDebounce?.cancel();
    _connectivitySubscription?.cancel();
    _statusController.close();
  }
}

class SyncException implements Exception {
  SyncException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Full sync result
class SyncResult {
  final bool success;
  final int? uploadedCount;
  final int? downloadedCount;
  final int? conflictCount;
  final int? errorCount;
  final List<Conflict>? conflicts;
  final String? error;
  final bool deferredToManager;

  SyncResult({
    required this.success,
    this.uploadedCount,
    this.downloadedCount,
    this.conflictCount,
    this.errorCount,
    this.conflicts,
    this.error,
    this.deferredToManager = false,
  });
}
