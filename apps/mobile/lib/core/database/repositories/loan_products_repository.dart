import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/loan_product_local.dart';

/// Repository for loan product data operations
class LoanProductsRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all active loan products
  Future<List<LoanProductLocal>> getAllActive() async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_products',
      where: 'is_active = ?',
      whereArgs: [1],
      orderBy: 'name ASC',
    );

    return maps.map((map) => LoanProductLocal.fromMap(map)).toList();
  }

  /// Get loan product by ID
  Future<LoanProductLocal?> getById(String id) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'loan_products',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return LoanProductLocal.fromMap(maps.first);
  }

  /// Insert loan product
  Future<void> insert(LoanProductLocal product) async {
    final database = await _db.database;
    await database.insert(
      'loan_products',
      product.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Insert multiple loan products (batch insert for sync)
  Future<void> insertBatch(List<LoanProductLocal> products) async {
    final database = await _db.database;
    final batch = database.batch();

    for (final product in products) {
      batch.insert(
        'loan_products',
        product.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    await batch.commit(noResult: true);
  }

  /// Get count of active loan products
  Future<int> getActiveCount() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM loan_products WHERE is_active = ?',
      [1],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }
}
