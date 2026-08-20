import 'package:flutter/material.dart';
import 'dart:async';
import '../core/sync/sync_service.dart';
import '../core/sync/upload_service.dart';

/// Screen for viewing and resolving sync conflicts
class SyncConflictsScreen extends StatefulWidget {
  final SyncService syncService;

  const SyncConflictsScreen({
    super.key,
    required this.syncService,
  });

  @override
  State<SyncConflictsScreen> createState() => _SyncConflictsScreenState();
}

class _SyncConflictsScreenState extends State<SyncConflictsScreen> {
  List<Conflict> _conflicts = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadConflicts();
  }

  Future<void> _loadConflicts() async {
    setState(() {
      _isLoading = true;
    });

    // Load conflicts from database
    // This would query the sync_conflicts table
    // For now, showing empty state

    setState(() {
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sync Conflicts'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _conflicts.isEmpty
              ? _buildEmptyState()
              : _buildConflictList(),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 64,
            color: Colors.green.shade300,
          ),
          const SizedBox(height: 16),
          const Text(
            'No sync conflicts',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'All your changes are in sync',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConflictList() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _conflicts.length,
      itemBuilder: (context, index) {
        final conflict = _conflicts[index];
        return _buildConflictCard(conflict);
      },
    );
  }

  Widget _buildConflictCard(Conflict conflict) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning, color: Colors.orange.shade700, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    conflict.reason,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              conflict.message,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => _resolveConflict(conflict, keepLocal: false),
                  child: const Text('Use Server Version'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () => _resolveConflict(conflict, keepLocal: true),
                  child: const Text('Keep My Changes'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _resolveConflict(Conflict conflict, {required bool keepLocal}) async {
    // Implement conflict resolution logic
    // This would mark the conflict as resolved in the database
    // and either keep local changes or accept server version

    setState(() {
      _conflicts.remove(conflict);
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          keepLocal
              ? 'Keeping your local changes'
              : 'Accepted server version',
        ),
      ),
    );
  }
}
