import 'package:flutter/material.dart';
import '../core/sync/sync_service.dart';

/// Floating action button for manual sync
class SyncButton extends StatefulWidget {
  final SyncService syncService;
  final VoidCallback? onSyncComplete;

  const SyncButton({
    super.key,
    required this.syncService,
    this.onSyncComplete,
  });

  @override
  State<SyncButton> createState() => _SyncButtonState();
}

class _SyncButtonState extends State<SyncButton> {
  bool _isSyncing = false;

  Future<void> _handleSync() async {
    if (_isSyncing) return;

    setState(() {
      _isSyncing = true;
    });

    try {
      final result = await widget.syncService.performFullSync();

      if (!mounted) return;

      if (result.success) {
        _showSyncResult(
          success: true,
          message: _buildSuccessMessage(result),
        );
        widget.onSyncComplete?.call();
      } else {
        _showSyncResult(
          success: false,
          message: result.error ?? 'Sync failed',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSyncing = false;
        });
      }
    }
  }

  String _buildSuccessMessage(SyncResult result) {
    final parts = <String>[];
    if (result.uploadedCount != null && result.uploadedCount! > 0) {
      parts.add('Uploaded ${result.uploadedCount} changes');
    }
    if (result.downloadedCount != null && result.downloadedCount! > 0) {
      parts.add('Downloaded ${result.downloadedCount} records');
    }
    if (parts.isEmpty) {
      return 'Already up to date';
    }
    return parts.join(' • ');
  }

  void _showSyncResult({required bool success, required String message}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              success ? Icons.check_circle : Icons.error,
              color: Colors.white,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: success ? Colors.green : Colors.red,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: _isSyncing ? null : _handleSync,
      child: _isSyncing
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : const Icon(Icons.sync),
    );
  }
}
