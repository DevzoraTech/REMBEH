import 'dart:convert';
import 'package:http/http.dart' as http;
import '../database/local_database.dart';
import '../database/models/customer_local.dart';
import '../database/models/loan_local.dart';
import '../database/models/loan_product_local.dart';
import '../database/repositories/customers_repository.dart';
import '../database/repositories/loans_repository.dart';
import '../database/repositories/loan_products_repository.dart';
import '../../services/auth_service.dart';

/// Service for downloading snapshot from server
class DownloadService {
  final LocalDatabase _db = LocalDatabase.instance;
  final CustomersRepository _customersRepo = CustomersRepository();
  final LoansRepository _loansRepo = LoansRepository();
  final LoanProductsRepository _loanProductsRepo = LoanProductsRepository();
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
      final uri = Uri.parse('$_baseUrl/api/v1/sync/snapshot').replace(
        queryParameters: lastSyncAt != null
            ? {'lastSyncAt': lastSyncAt.toIso8601String()}
            : null,
      );

      // Make API request
      final response = await http.get(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      ).timeout(
        const Duration(seconds: 60),
        onTimeout: () {
          throw Exception('Download timeout - check your internet connection');
        },
      );

      if (response.statusCode != 200) {
        throw Exception(
            'Failed to download snapshot: ${response.statusCode} ${response.body}');
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
      return SnapshotResult(
        success: false,
        error: e.toString(),
      );
    }
  }

  /// Import snapshot into local database
  Future<void> _importSnapshot(Snapshot snapshot) async {
    final database = await _db.database;

    // Use transaction for atomic import
    await database.transaction((txn) async {
      // If full snapshot, clear existing data first
      if (!snapshot.isIncremental) {
        await _db.clearAllData();
      }

      // Import customers
      if (snapshot.data.customers.isNotEmpty) {
        await _customersRepo.insertBatch(snapshot.data.customers);
      }

      // Import loans
      if (snapshot.data.loans.isNotEmpty) {
        await _loansRepo.insertBatch(snapshot.data.loans);
      }

      // Import loan products
      if (snapshot.data.loanProducts.isNotEmpty) {
        await _loanProductsRepo.insertBatch(snapshot.data.loanProducts);
      }

      // Delete records that were deleted on server
      if (snapshot.deletedIds != null) {
        for (final customerId in snapshot.deletedIds!.customers) {
          await _customersRepo.delete(customerId);
        }
        // Handle other deleted entities...
      }
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

  SnapshotData({
    required this.customers,
    required this.loans,
    required this.loanProducts,
  });

  factory SnapshotData.fromJson(Map<String, dynamic> json) {
    return SnapshotData(
      customers: (json['customers'] as List)
          .map((e) => CustomerLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
      loans: (json['loans'] as List)
          .map((e) => LoanLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
      loanProducts: (json['loanProducts'] as List)
          .map((e) => LoanProductLocal.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Deleted record IDs
class DeletedIds {
  final List<String> customers;
  final List<String> loans;

  DeletedIds({
    required this.customers,
    required this.loans,
  });

  factory DeletedIds.fromJson(Map<String, dynamic> json) {
    return DeletedIds(
      customers: (json['customers'] as List).cast<String>(),
      loans: (json['loans'] as List).cast<String>(),
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
