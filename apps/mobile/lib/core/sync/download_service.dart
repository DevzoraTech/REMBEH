import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';
import '../database/local_database.dart';
import '../database/models/customer_local.dart';
import '../database/models/loan_local.dart';
import '../database/models/loan_product_local.dart';
import '../../services/auth_service.dart';
import 'sync_errors.dart';

/// Service for downloading snapshot from server
class DownloadService {
  final LocalDatabase _db = LocalDatabase.instance;
  final AuthService _authService;
  final String _baseUrl;

  DownloadService(this._authService, this._baseUrl);

  /// Download snapshot from server
  Future<SnapshotResult> downloadSnapshot({DateTime? lastSyncAt}) async {
    try {
      // Get auth token
      final token = await _authService.getAccessToken();
      if (token == null) {
        throw Exception('Not authenticated');
      }

      // Build URL with query params
      final uri = Uri.parse('$_baseUrl/sync/snapshot').replace(
        queryParameters: lastSyncAt != null
            ? {'lastSyncAt': lastSyncAt.toIso8601String()}
            : null,
      );

      // Make API request
      final response = await http
          .get(
            uri,
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
          )
          .timeout(
            const Duration(seconds: 60),
            onTimeout: () {
              throw Exception(
                'Download timeout - check your internet connection',
              );
            },
          );

      if (response.statusCode != 200) {
        throw Exception(
          syncHttpFailureMessage(
            action: 'download latest offline data',
            statusCode: response.statusCode,
            responseBody: response.body,
          ),
        );
      }

      // Parse response
      final data = jsonDecode(response.body);
      final snapshot = Snapshot.fromJson(data);

      // Import snapshot into local database
      await _importSnapshot(snapshot);

      // Update sync metadata
      await _db.updateLastSyncTimestamp(DateTime.parse(snapshot.timestamp));
      await _db.updateSnapshotVersion(snapshot.version);

      return SnapshotResult(
        success: true,
        recordCount: _calculateRecordCount(snapshot),
        version: snapshot.version,
        isIncremental: snapshot.isIncremental,
      );
    } catch (e) {
      return SnapshotResult(success: false, error: cleanSyncException(e));
    }
  }

  /// Import snapshot into local database
  Future<void> _importSnapshot(Snapshot snapshot) async {
    final database = await _db.database;

    // The old snapshot is only cleared inside this transaction, after the full
    // server payload has already been downloaded and parsed.
    await database.transaction((txn) async {
      if (!snapshot.isIncremental) {
        await txn.delete(
          'collections',
          where: 'status = ?',
          whereArgs: ['SYNCED'],
        );
        await txn.delete(
          'payments',
          where: 'status = ?',
          whereArgs: ['SYNCED'],
        );
        await txn.delete(
          'loan_application_media',
          where: 'upload_status = ?',
          whereArgs: ['UPLOADED'],
        );
        await txn.delete(
          'loan_applications',
          where: 'status = ?',
          whereArgs: ['SYNCED'],
        );
        await txn.delete('loans');
        await txn.delete('customers');
        await txn.delete('loan_products');
        await txn.delete('agents');
        await txn.delete('branches');
      }

      final batch = txn.batch();

      for (final branch in snapshot.data.branches) {
        batch.insert(
          'branches',
          branch,
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final customer in snapshot.data.customers) {
        batch.insert(
          'customers',
          customer.toMap(),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final product in snapshot.data.loanProducts) {
        batch.insert(
          'loan_products',
          product.toMap(),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final loan in snapshot.data.loans) {
        batch.insert(
          'loans',
          loan.toMap(),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final agent in snapshot.data.agents) {
        batch.insert(
          'agents',
          agent,
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final collection in snapshot.data.collections) {
        batch.insert(
          'collections',
          collection,
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      if (snapshot.deletedIds != null) {
        for (final customerId in snapshot.deletedIds!.customers) {
          batch.delete('customers', where: 'id = ?', whereArgs: [customerId]);
        }
        for (final loanId in snapshot.deletedIds!.loans) {
          batch.delete('loans', where: 'id = ?', whereArgs: [loanId]);
        }
      }

      await batch.commit(noResult: true);
    });
  }

  /// Calculate total record count
  int _calculateRecordCount(Snapshot snapshot) {
    return snapshot.data.customers.length +
        snapshot.data.loans.length +
        snapshot.data.loanProducts.length;
  }
}

/// Snapshot data structure from API
class Snapshot {
  final String version;
  final String timestamp;
  final bool isIncremental;
  final SnapshotData data;
  final DeletedIds? deletedIds;

  Snapshot({
    required this.version,
    required this.timestamp,
    required this.isIncremental,
    required this.data,
    this.deletedIds,
  });

  factory Snapshot.fromJson(Map<String, dynamic> json) {
    return Snapshot(
      version: json['version'] as String,
      timestamp: json['timestamp'] as String,
      isIncremental: json['isIncremental'] as bool,
      data: SnapshotData.fromJson(json['data'] as Map<String, dynamic>),
      deletedIds: json['deletedIds'] != null
          ? DeletedIds.fromJson(json['deletedIds'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// Snapshot data containing all entities
class SnapshotData {
  final List<CustomerLocal> customers;
  final List<LoanLocal> loans;
  final List<LoanProductLocal> loanProducts;
  final List<Map<String, dynamic>> agents;
  final List<Map<String, dynamic>> branches;
  final List<Map<String, dynamic>> collections;

  SnapshotData({
    required this.customers,
    required this.loans,
    required this.loanProducts,
    required this.agents,
    required this.branches,
    required this.collections,
  });

  factory SnapshotData.fromJson(Map<String, dynamic> json) {
    return SnapshotData(
      customers: (json['customers'] as List? ?? const [])
          .map((e) => CustomerLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
      loans: (json['loans'] as List? ?? const [])
          .map((e) => LoanLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
      loanProducts: (json['loanProducts'] as List? ?? const [])
          .map((e) => LoanProductLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
      agents: (json['agents'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(_agentMap)
          .toList(),
      branches: (json['branches'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(_branchMap)
          .toList(),
      collections: (json['repayments'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(_collectionMap)
          .toList(),
    );
  }
}

Map<String, dynamic> _branchMap(Map<String, dynamic> json) => {
  'id': _text(json['id']) ?? '',
  'tenant_id': _text(json['tenantId']) ?? '',
  'name': _text(json['name']) ?? 'Branch',
  'address': _text(json['address']),
  'phone': _text(json['phone']),
  'created_at': _dateMillis(json['createdAt']),
  'updated_at': _dateMillis(json['updatedAt']),
};

Map<String, dynamic> _agentMap(Map<String, dynamic> json) {
  final parts = _splitName(_text(json['displayName']) ?? 'Agent');
  return {
    'id': _text(json['id']) ?? '',
    'tenant_id': _text(json['tenantId']) ?? '',
    'branch_id': _text(json['branchId']) ?? '',
    'first_name': parts.$1,
    'last_name': parts.$2,
    'phone': _text(json['phone']) ?? '',
    'email': _text(json['email']),
    'role': _text(json['role']) ?? 'AGENT',
    'is_active': 1,
    'created_at': _dateMillis(json['createdAt']),
    'updated_at': _dateMillis(json['updatedAt']),
  };
}

Map<String, dynamic> _collectionMap(Map<String, dynamic> json) => {
  'id': _text(json['id']),
  'local_id': _text(json['id']) ?? '',
  'tenant_id': _text(json['tenantId']) ?? '',
  'branch_id': _text(json['branchId']) ?? '',
  'agent_id': _text(json['agentId']) ?? '',
  'loan_id': _text(json['loanId']) ?? '',
  'customer_id': _text(json['customerId']) ?? '',
  'amount': _double(json['amount']),
  'collection_date': _dateMillis(json['paidAt']),
  'receipt_number': _text(json['receiptNumber']),
  'notes': _text(json['note']),
  'status': 'SYNCED',
  'created_at': _dateMillis(json['createdAt']),
  'synced_at': DateTime.now().millisecondsSinceEpoch,
};

(String, String) _splitName(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return ('Agent', '');
  if (parts.length == 1) return (parts.first, '');
  return (parts.first, parts.skip(1).join(' '));
}

String? _text(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int _dateMillis(Object? value) {
  if (value is int) return value;
  if (value is DateTime) return value.millisecondsSinceEpoch;
  return DateTime.tryParse(value?.toString() ?? '')?.millisecondsSinceEpoch ??
      DateTime.now().millisecondsSinceEpoch;
}

/// Deleted record IDs
class DeletedIds {
  final List<String> customers;
  final List<String> loans;

  DeletedIds({required this.customers, required this.loans});

  factory DeletedIds.fromJson(Map<String, dynamic> json) {
    return DeletedIds(
      customers: (json['customers'] as List? ?? const []).cast<String>(),
      loans: (json['loans'] as List? ?? const []).cast<String>(),
    );
  }
}

/// Result of snapshot download operation
class SnapshotResult {
  final bool success;
  final int? recordCount;
  final String? version;
  final bool? isIncremental;
  final String? error;

  SnapshotResult({
    required this.success,
    this.recordCount,
    this.version,
    this.isIncremental,
    this.error,
  });
}
