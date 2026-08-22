import 'package:flutter/material.dart';
import 'dart:async';
import '../core/sync/sync_service.dart';

/// Widget displaying sync status in app bar or bottom of screen
class SyncStatusIndicator extends StatefulWidget {
  final SyncService syncService;

  const SyncStatusIndicator({super.key, required this.syncService});

  @override
  State<SyncStatusIndicator> createState() => _SyncStatusIndicatorState();
}

class _SyncStatusIndicatorState extends State<SyncStatusIndicator> {
  SyncStatus? _currentStatus;
  StreamSubscription? _statusSubscription;

  @override
  void initState() {
    super.initState();
    _statusSubscription = widget.syncService.statusStream.listen((status) {
      if (mounted) {
        setState(() {
          _currentStatus = status;
        });
      }
    });
    _loadInitialStatus();
  }

  Future<void> _loadInitialStatus() async {
    final status = await widget.syncService.getCurrentStatus();
    if (mounted) {
      setState(() {
        _currentStatus = status;
      });
    }
  }

  @override
  void dispose() {
    _statusSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_currentStatus == null) {
      return const SizedBox.shrink();
    }

    return _buildStatusChip(_currentStatus!);
  }

  Widget _buildStatusChip(SyncStatus status) {
    IconData icon;
    Color color;
    String text;

    switch (status.state) {
      case SyncState.idle:
        icon = Icons.cloud_done;
        color = Colors.green;
        text = _buildIdleText(status);
        break;
      case SyncState.syncing:
        icon = Icons.sync;
        color = Colors.blue;
        text = status.message ?? 'Syncing...';
        break;
      case SyncState.error:
        icon = Icons.cloud_off;
        color = Colors.red;
        text = 'Sync error';
        break;
      case SyncState.offline:
        icon = Icons.cloud_off_outlined;
        color = Colors.orange;
        text = 'Offline mode';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (status.pendingOperations != null &&
              status.pendingOperations! > 0) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${status.pendingOperations}',
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _buildIdleText(SyncStatus status) {
    if (status.lastSyncAt == null) {
      return 'Not synced';
    }

    final now = DateTime.now();
    final diff = now.difference(status.lastSyncAt!);

    if (diff.inMinutes < 1) {
      return 'Just synced';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else {
      return '${diff.inDays}d ago';
    }
  }
}
