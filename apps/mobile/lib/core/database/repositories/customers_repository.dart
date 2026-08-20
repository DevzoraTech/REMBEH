import 'package:sqflite/sqflite.dart';
import '../local_database.dart';
import '../models/customer_local.dart';

/// Repository for customer data operations
class CustomersRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all customers for a branch
  Future<List<CustomerLocal>> getAll({String? branchId}) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'customers',
      where: branchId != null ? 'branch_id = ?' : null,
      whereArgs: branchId != null ? [branchId] : null,
      orderBy: 'first_name ASC',
    );

    return maps.map((map) => CustomerLocal.fromMap(map)).toList();
  }

  /// Get customer by ID
  Future<CustomerLocal?> getById(String id) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'customers',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Search customers by name or phone
  Future<List<CustomerLocal>> search(String query, {String? branchId}) async {
    final database = await _db.database;
    final searchTerm = '%${query.toLowerCase()}%';

    String where = '(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR phone LIKE ?)';
    List<dynamic> whereArgs = [searchTerm, searchTerm, searchTerm];

    if (branchId != null) {
      where += ' AND branch_id = ?';
      whereArgs.add(branchId);
    }

    final List<Map<String, dynamic>> maps = await database.query(
      'customers',
      where: where,
      whereArgs: whereArgs,
      orderBy: 'first_name ASC',
      limit: 50,
    );

    return maps.map((map) => CustomerLocal.fromMap(map)).toList();
  }

  /// Find customer by phone number
  Future<CustomerLocal?> findByPhone(String phone) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'customers',
      where: 'phone = ?',
      whereArgs: [phone],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Find customer by NIN
  Future<CustomerLocal?> findByNin(String nin) async {
    final database = await _db.database;
    final List<Map<String, dynamic>> maps = await database.query(
      'customers',
      where: 'nin = ?',
      whereArgs: [nin],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Insert customer
  Future<void> insert(CustomerLocal customer) async {
    final database = await _db.database;
    await database.insert(
      'customers',
      customer.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Insert multiple customers (batch insert for sync)
  Future<void> insertBatch(List<CustomerLocal> customers) async {
    final database = await _db.database;
    final batch = database.batch();

    for (final customer in customers) {
      batch.insert(
        'customers',
        customer.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    await batch.commit(noResult: true);
  }

  /// Update customer
  Future<void> update(CustomerLocal customer) async {
    final database = await _db.database;
    await database.update(
      'customers',
      customer.toMap(),
      where: 'id = ?',
      whereArgs: [customer.id],
    );
  }

  /// Delete customer
  Future<void> delete(String id) async {
    final database = await _db.database;
    await database.delete(
      'customers',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Get count of customers
  Future<int> getCount({String? branchId}) async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM customers${branchId != null ? ' WHERE branch_id = ?' : ''}',
      branchId != null ? [branchId] : null,
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }
}
