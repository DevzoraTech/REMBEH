import 'dart:async';
import 'connectivity_monitor.dart';
import 'download_service.dart';
import 'upload_service.dart';
import '../database/local_database.dart';
import '../database/repositories/pending_operations_repository.dart';
import '../../services/auth_service.dart';

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
    return SyncStatus(
      state: SyncState.error,
      message: message,
    );
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

  /// Whether sync is currently running
  bool _isSyncing = false;

  /// Auto-sync subscription
  StreamSubscription? _connectivitySubscription;

  SyncService(this._authService, this._baseUrl) {
    _downloadService = DownloadService(_authService, _baseUrl);
    _uploadService = UploadService(_authService, _baseUrl);
  }

  /// Initialize sync service and start monitoring
  Future<void> initialize() async {
    await _connectivity.initialize();

    // Emit initial status
    await _emitCurrentStatus();

    // Listen for connectivity changes and auto-sync
    _connectivitySubscription =
        _connectivity.onConnectivityChanged.listen((isOnline) async {
      if (isOnline && !_isSyncing) {
        await performFullSync(isAutoSync: true);
      } else if (!isOnline) {
        final pending = await _operationsRepo.getPendingCount();
        _statusController.add(SyncStatus.offline(pendingOperations: pending));
      }
    });
  }

  /// Perform full sync: upload pending → download snapshot
  Future<SyncResult> performFullSync({bool isAutoSync = false}) async {
    if (_isSyncing) {
      return SyncResult(
        success: false,
        error: 'Sync already in progress',
      );
    }

    // Check connectivity
    final isOnline = await _connectivity.checkConnectivity();
    if (!isOnline) {
      final pending = await _operationsRepo.getPendingCount();
      _statusController.add(SyncStatus.offline(pendingOperations: pending));
      return SyncResult(success: false, error: 'No internet connection');
    }

    _isSyncing = true;

    try {
      // Step 1: Upload pending operations
      _statusController.add(
        SyncStatus.syncing('Uploading pending changes...', progress: 0.2),
      );
      final uploadResult = await _uploadService.uploadPendingQueue();

      // Step 2: Download fresh snapshot
      _statusController.add(
        SyncStatus.syncing('Downloading latest data...', progress: 0.5),
      );
      final lastSyncAt = await _db.getLastSyncTimestamp();
      final downloadResult =
          await _downloadService.downloadSnapshot(lastSyncAt: lastSyncAt);

      // Step 3: Cleanup old uploaded operations
      _statusController.add(
        SyncStatus.syncing('Cleaning up...', progress: 0.9),
      );
      await _operationsRepo.cleanupUploaded();

      // Step 4: Emit final status
      final pending = await _operationsRepo.getPendingCount();
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
      _statusController.add(SyncStatus.error(e.toString()));
      return SyncResult(success: false, error: e.toString());
    } finally {
      _isSyncing = false;
    }
  }

  /// Upload only (without downloading new snapshot)
  Future<UploadResult> uploadPendingOnly() async {
    if (!_connectivity.isOnline) {
      return UploadResult(success: false, error: 'No internet connection');
    }

    _statusController
        .add(SyncStatus.syncing('Uploading pending changes...'));

    final result = await _uploadService.uploadPendingQueue();
    await _emitCurrentStatus();
    return result;
  }

  /// Download only (without uploading changes first)
  Future<SnapshotResult> downloadOnly() async {
    if (!_connectivity.isOnline) {
      return SnapshotResult(success: false, error: 'No internet connection');
    }

    _statusController
        .add(SyncStatus.syncing('Downloading latest data...'));

    final lastSyncAt = await _db.getLastSyncTimestamp();
    final result =
        await _downloadService.downloadSnapshot(lastSyncAt: lastSyncAt);

    await _emitCurrentStatus();
    return result;
  }

  /// Get current sync status
  Future<SyncStatus> getCurrentStatus() async {
    final isOnline = await _connectivity.checkConnectivity();
    final pending = await _operationsRepo.getPendingCount();
    final lastSyncAt = await _db.getLastSyncTimestamp();

    if (!isOnline) {
      return SyncStatus.offline(pendingOperations: pending);
    }

    return SyncStatus.idle(
      lastSyncAt: lastSyncAt,
      pendingOperations: pending,
    );
  }

  /// Emit current status to stream
  Future<void> _emitCurrentStatus() async {
    final status = await getCurrentStatus();
    _statusController.add(status);
  }

  /// Dispose resources
  void dispose() {
    _connectivitySubscription?.cancel();
    _statusController.close();
  }
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

  SyncResult({
    required this.success,
    this.uploadedCount,
    this.downloadedCount,
    this.conflictCount,
    this.errorCount,
    this.conflicts,
    this.error,
  });
}
