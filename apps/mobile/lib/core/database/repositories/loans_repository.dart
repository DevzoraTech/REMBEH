import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/loan_local.dart';

/// Repository for loan data operations
class LoansRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all loans for a customer
  Future<List<LoanLocal>> getByCustomerId(String customerId) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loans',
      where: 'customer_id = ?',
      whereArgs: [customerId],
      orderBy: 'created_at DESC',
    );

    return maps.map((map) => LoanLocal.fromMap(map)).toList();
  }

  /// Get active loans for a branch
  Future<List<LoanLocal>> getActiveLoans({String? branchId}) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loans',
      where: branchId != null
          ? "status IN ('ACTIVE', 'OVERDUE') AND branch_id = ?"
          : "status IN ('ACTIVE', 'OVERDUE')",
      whereArgs: branchId != null ? [branchId] : null,
      orderBy: 'created_at DESC',
    );

    return maps.map((map) => LoanLocal.fromMap(map)).toList();
  }

  /// Get overdue loans for a branch
  Future<List<LoanLocal>> getOverdueLoans({String? branchId}) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loans',
      where: branchId != null ? "status = 'OVERDUE' AND branch_id = ?" : "status = 'OVERDUE'",
      whereArgs: branchId != null ? [branchId] : null,
      orderBy: 'maturity_date ASC',
    );

    return maps.map((map) => LoanLocal.fromMap(map)).toList();
  }

  /// Get loan by ID
  Future<LoanLocal?> getById(String id) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loans',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return LoanLocal.fromMap(maps.first);
  }

  /// Search loans
  Future<List<LoanLocal>> search(String query, {String? branchId}) async {
    final database = await _db.database;

    // Join with customers to search by customer name
    String sql = '''
      SELECT l.* FROM loans l
      INNER JOIN customers c ON l.customer_id = c.id
      WHERE (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)
    ''';

    final searchTerm = '%${query.toLowerCase()}%';
    List<dynamic> args = [searchTerm, searchTerm, searchTerm];

    if (branchId != null) {
      sql += ' AND l.branch_id = ?';
      args.add(branchId);
    }

    sql += ' ORDER BY l.created_at DESC LIMIT 50';

    final List<Map<String, dynamic>> maps = await database.rawQuery(sql, args);
    return maps.map((map) => LoanLocal.fromMap(map)).toList();
  }

  /// Insert loan
  Future<void> insert(LoanLocal loan) async {
    final database = await _db.database;
    await database.insert(
      'loans',
      loan.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Insert multiple loans (batch insert for sync)
  Future<void> insertBatch(List<LoanLocal> loans) async {
    final database = await _db.database;
    final batch = database.batch();

    for (final loan in loans) {
      batch.insert(
        'loans',
        loan.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    await batch.commit(noResult: true);
  }

  /// Update loan
  Future<void> update(LoanLocal loan) async {
    final database = await _db.database;
    await database.update(
      'loans',
      loan.toMap(),
      where: 'id = ?',
      whereArgs: [loan.id],
    );
  }

  /// Get loan statistics for a branch
  Future<Map<String, dynamic>> getStatistics({String? branchId}) async {
    final database = await _db.database;

    String whereClause = branchId != null ? 'WHERE branch_id = ?' : '';
    List<dynamic>? args = branchId != null ? [branchId] : null;

    final result = await database.rawQuery('''
      SELECT
        COUNT(*) as total_loans,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_loans,
        SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) as overdue_loans,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_loans,
        SUM(principal) as total_principal,
        SUM(outstanding_balance) as total_outstanding
      FROM loans
      $whereClause
    ''', args);

    return result.first;
  }

  /// Get count of loans
  Future<int> getCount({String? branchId, String? status}) async {
    final database = await _db.database;

    String where = '';
    List<dynamic> args = [];

    if (branchId != null && status != null) {
      where = 'WHERE branch_id = ? AND status = ?';
      args = [branchId, status];
    } else if (branchId != null) {
      where = 'WHERE branch_id = ?';
      args = [branchId];
    } else if (status != null) {
      where = 'WHERE status = ?';
      args = [status];
    }

    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM loans $where',
      args.isEmpty ? null : args,
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }
}
