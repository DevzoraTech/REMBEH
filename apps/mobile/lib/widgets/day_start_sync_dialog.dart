import 'package:flutter/material.dart';
import 'dart:async';
import '../core/sync/sync_service.dart';
import '../core/sync/connectivity_monitor.dart';

/// Prompt dialog shown at day start to sync data
class DayStartSyncDialog extends StatefulWidget {
  final SyncService syncService;
  final VoidCallback onSyncComplete;
  final VoidCallback onSkip;

  const DayStartSyncDialog({
    super.key,
    required this.syncService,
    required this.onSyncComplete,
    required this.onSkip,
  });

  @override
  State<DayStartSyncDialog> createState() => _DayStartSyncDialogState();
}

class _DayStartSyncDialogState extends State<DayStartSyncDialog> {
  bool _isSyncing = false;
  bool _isCheckingConnectivity = true;
  bool _hasInternet = false;
  String? _syncMessage;
  double? _syncProgress;

  StreamSubscription? _statusSubscription;

  @override
  void initState() {
    super.initState();
    _checkConnectivity();
    _listenToSyncStatus();
  }

  @override
  void dispose() {
    _statusSubscription?.cancel();
    super.dispose();
  }

  Future<void> _checkConnectivity() async {
    final connectivity = ConnectivityMonitor.instance;
    final hasInternet = await connectivity.checkConnectivity();

    if (mounted) {
      setState(() {
        _hasInternet = hasInternet;
        _isCheckingConnectivity = false;
      });
    }
  }

  void _listenToSyncStatus() {
    _statusSubscription = widget.syncService.statusStream.listen((status) {
      if (mounted) {
        setState(() {
          _syncMessage = status.message;
          _syncProgress = status.progress;
        });
      }
    });
  }

  Future<void> _startSync() async {
    setState(() {
      _isSyncing = true;
    });

    final result = await widget.syncService.performFullSync();

    if (!mounted) return;

    if (result.success) {
      widget.onSyncComplete();
    } else {
      setState(() {
        _isSyncing = false;
      });

      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Sync Failed'),
          content: Text(result.error ?? 'Could not sync data'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                _startSync();
              },
              child: const Text('Retry'),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                widget.onSkip();
              },
              child: const Text('Continue Offline'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async => !_isSyncing,
      child: AlertDialog(
        title: const Text('Start Your Day'),
        content: _buildContent(),
        actions: _buildActions(),
      ),
    );
  }

  Widget _buildContent() {
    if (_isCheckingConnectivity) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Checking internet connection...'),
        ],
      );
    }

    if (_isSyncing) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_syncProgress != null)
            LinearProgressIndicator(value: _syncProgress)
          else
            const LinearProgressIndicator(),
          const SizedBox(height: 16),
          Text(_syncMessage ?? 'Syncing data...'),
        ],
      );
    }

    if (!_hasInternet) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_off, color: Colors.orange),
              SizedBox(width: 8),
              Text(
                'No Internet Connection',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          SizedBox(height: 12),
          Text(
            'You can continue working offline with your locally cached data. '
            'Connect to internet later to sync your changes.',
          ),
        ],
      );
    }

    return const Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.cloud_done, color: Colors.green),
            SizedBox(width: 8),
            Text(
              'Connected',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        SizedBox(height: 12),
        Text(
          'Sync your data to get the latest updates and upload any pending changes.',
        ),
      ],
    );
  }

  List<Widget> _buildActions() {
    if (_isCheckingConnectivity || _isSyncing) {
      return [];
    }

    if (!_hasInternet) {
      return [
        TextButton(
          onPressed: _checkConnectivity,
          child: const Text('Retry'),
        ),
        ElevatedButton(
          onPressed: widget.onSkip,
          child: const Text('Continue Offline'),
        ),
      ];
    }

    return [
      TextButton(
        onPressed: widget.onSkip,
        child: const Text('Skip'),
      ),
      ElevatedButton(
        onPressed: _startSync,
        child: const Text('Sync Now'),
      ),
    ];
  }
}
