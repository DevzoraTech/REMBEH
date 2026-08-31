import 'package:sqflite/sqflite.dart';

import '../local_database.dart';
import '../models/customer_local.dart';

/// Repository for customer data operations.
class CustomersRepository {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Get all customers, optionally scoped to a branch.
  Future<List<CustomerLocal>> getAll({String? branchId}) async {
    final database = await _db.database;

    final maps = await database.query(
      'customers',
      where: branchId != null ? 'branch_id = ?' : null,
      whereArgs: branchId != null ? [branchId] : null,
      orderBy: 'first_name ASC, last_name ASC',
    );

    return maps.map(CustomerLocal.fromMap).toList(growable: false);
  }

  /// Get customer by ID.
  Future<CustomerLocal?> getById(String id) async {
    final database = await _db.database;

    final maps = await database.query(
      'customers',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Search customers by first name, last name, phone or NIN.
  ///
  /// The search remains branch scoped when [branchId] is provided.
  Future<List<CustomerLocal>> search(
    String query, {
    String? branchId,
  }) async {
    final database = await _db.database;
    final normalized = query.trim().toLowerCase();

    if (normalized.isEmpty) {
      return getAll(branchId: branchId);
    }

    final searchTerm = '%$normalized%';

    var where = '''
      (
        LOWER(first_name) LIKE ?
        OR LOWER(last_name) LIKE ?
        OR LOWER(first_name || ' ' || last_name) LIKE ?
        OR LOWER(last_name || ' ' || first_name) LIKE ?
        OR LOWER(phone) LIKE ?
        OR LOWER(COALESCE(nin, '')) LIKE ?
      )
    ''';

    final whereArgs = <Object?>[
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
    ];

    if (branchId != null && branchId.trim().isNotEmpty) {
      where += ' AND branch_id = ?';
      whereArgs.add(branchId.trim());
    }

    final maps = await database.query(
      'customers',
      where: where,
      whereArgs: whereArgs,
      orderBy: 'first_name ASC, last_name ASC',
      limit: 50,
    );

    return maps.map(CustomerLocal.fromMap).toList(growable: false);
  }

  /// Find customer by phone number.
  Future<CustomerLocal?> findByPhone(String phone) async {
    final database = await _db.database;

    final maps = await database.query(
      'customers',
      where: 'phone = ?',
      whereArgs: [phone],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Find customer by NIN.
  Future<CustomerLocal?> findByNin(String nin) async {
    final database = await _db.database;

    final maps = await database.query(
      'customers',
      where: 'UPPER(nin) = UPPER(?)',
      whereArgs: [nin.trim()],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return CustomerLocal.fromMap(maps.first);
  }

  /// Insert customer.
  Future<void> insert(CustomerLocal customer) async {
    final database = await _db.database;

    await database.insert(
      'customers',
      customer.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Insert multiple customers during snapshot/sync.
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

  /// Update customer.
  Future<void> update(CustomerLocal customer) async {
    final database = await _db.database;

    await database.update(
      'customers',
      customer.toMap(),
      where: 'id = ?',
      whereArgs: [customer.id],
    );
  }

  /// Delete customer.
  Future<void> delete(String id) async {
    final database = await _db.database;

    await database.delete(
      'customers',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Get customer count.
  Future<int> getCount({String? branchId}) async {
    final database = await _db.database;

    final result = await database.rawQuery(
      'SELECT COUNT(*) AS count FROM customers'
      '${branchId != null ? ' WHERE branch_id = ?' : ''}',
      branchId != null ? [branchId] : null,
    );

    return Sqflite.firstIntValue(result) ?? 0;
  }
}
