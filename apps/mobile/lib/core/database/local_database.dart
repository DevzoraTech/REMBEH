import 'dart:io';

import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

/// Local SQLite database for offline-first data storage.
/// Stores tenant+branch scoped data synced from the server.
class LocalDatabase {
  static final LocalDatabase instance = LocalDatabase._internal();
  static Database? _database;

  LocalDatabase._internal();

  /// Current database schema version
  static const int _currentVersion = 1;

  /// Database file name
  static const String _databaseName = 'rembeh_local.db';

  /// Get database instance, initializing if needed
  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  /// Initialize database with schema
  Future<Database> _initDatabase() async {
    final databasePath = await getDatabasesPath();
    final path = join(databasePath, _databaseName);

    return await openDatabase(
      path,
      version: _currentVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  /// Create database schema
  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        nin TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        village TEXT,
        sub_county TEXT,
        district TEXT,
        date_of_birth INTEGER,
        gender TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE loans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        loan_product_id TEXT NOT NULL,
        principal REAL NOT NULL,
        interest_rate REAL NOT NULL,
        term_months INTEGER NOT NULL,
        installment_amount REAL NOT NULL,
        status TEXT NOT NULL,
        disbursed_at INTEGER,
        maturity_date INTEGER,
        outstanding_balance REAL,
        total_paid REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (loan_product_id) REFERENCES loan_products(id)
      )
    ''');

    await db.execute('''
      CREATE TABLE loan_products (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        min_amount REAL NOT NULL,
        max_amount REAL NOT NULL,
        interest_rate REAL NOT NULL,
        min_term INTEGER NOT NULL,
        max_term INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE branches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE loan_applications (
        id TEXT,
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        customer_id TEXT,
        status TEXT NOT NULL,
        applicant_nin TEXT,
        applicant_first_name TEXT NOT NULL,
        applicant_last_name TEXT NOT NULL,
        applicant_phone TEXT NOT NULL,
        applicant_village TEXT,
        requested_amount REAL NOT NULL,
        loan_product_id TEXT NOT NULL,
        guarantor_name TEXT,
        guarantor_phone TEXT,
        guarantor_nin TEXT,
        business_description TEXT,
        created_at INTEGER NOT NULL,
        submitted_at INTEGER,
        synced_at INTEGER,
        FOREIGN KEY (loan_product_id) REFERENCES loan_products(id)
      )
    ''');

    await db.execute('''
      CREATE TABLE loan_application_media (
        id TEXT,
        local_id TEXT PRIMARY KEY,
        loan_application_id TEXT,
        loan_application_local_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        local_file_path TEXT NOT NULL,
        s3_key TEXT,
        upload_status TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        created_at INTEGER NOT NULL,
        uploaded_at INTEGER,
        FOREIGN KEY (loan_application_local_id) REFERENCES loan_applications(local_id)
      )
    ''');

    await db.execute('''
      CREATE TABLE collections (
        id TEXT,
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        loan_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        collection_date INTEGER NOT NULL,
        receipt_number TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (loan_id) REFERENCES loans(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    ''');

    await db.execute('''
      CREATE TABLE payments (
        id TEXT,
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        loan_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        reference_number TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (loan_id) REFERENCES loans(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    ''');

    await db.execute('''
      CREATE TABLE agent_days (
        id TEXT,
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        opening_float REAL NOT NULL,
        closing_balance REAL,
        total_collections REAL,
        total_payments REAL,
        status TEXT NOT NULL,
        synced_at INTEGER,
        created_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE pending_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        local_entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        status TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        local_entity_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        server_data TEXT NOT NULL,
        resolution TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      )
    ''');

    await db.execute('''
      CREATE TABLE auth_cache (
        email TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        role_name TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        workspace_name TEXT NOT NULL,
        permissions TEXT NOT NULL,
        profile_photo_url TEXT,
        cached_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE pending_media (
        media_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        caption TEXT,
        upload_status TEXT NOT NULL,
        storage_key TEXT,
        public_url TEXT,
        last_error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        uploaded_at INTEGER
      )
    ''');

    // Create indexes for performance
    await _createIndexes(db);
  }

  /// Create database indexes
  Future<void> _createIndexes(Database db) async {
    await db.execute(
      'CREATE INDEX idx_customers_branch ON customers(branch_id, tenant_id)',
    );
    await db.execute('CREATE INDEX idx_customers_phone ON customers(phone)');
    await db.execute('CREATE INDEX idx_customers_nin ON customers(nin)');

    await db.execute('CREATE INDEX idx_loans_customer ON loans(customer_id)');
    await db.execute('CREATE INDEX idx_loans_status ON loans(status)');
    await db.execute('CREATE INDEX idx_loans_branch ON loans(branch_id)');

    await db.execute(
      'CREATE INDEX idx_loan_applications_status ON loan_applications(status)',
    );
    await db.execute(
      'CREATE INDEX idx_loan_applications_agent ON loan_applications(agent_id)',
    );

    await db.execute(
      'CREATE INDEX idx_collections_loan ON collections(loan_id)',
    );
    await db.execute(
      'CREATE INDEX idx_collections_status ON collections(status)',
    );
    await db.execute(
      'CREATE INDEX idx_collections_date ON collections(collection_date)',
    );

    await db.execute('CREATE INDEX idx_payments_loan ON payments(loan_id)');
    await db.execute('CREATE INDEX idx_payments_status ON payments(status)');

    await db.execute(
      'CREATE INDEX idx_pending_operations_status ON pending_operations(status)',
    );
    await db.execute(
      'CREATE INDEX idx_media_upload_status ON loan_application_media(upload_status)',
    );
    await db.execute(
      'CREATE INDEX idx_pending_media_status ON pending_media(upload_status, entity_type, entity_id)',
    );
  }

  /// Handle database schema upgrades
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Future schema migrations will be handled here
    if (oldVersion < 2) {
      // Example: Add new column in version 2
      // await db.execute('ALTER TABLE customers ADD COLUMN new_field TEXT');
    }
  }

  /// Get sync metadata value
  Future<String?> getMetadata(String key) async {
    final db = await database;
    final result = await db.query(
      'sync_metadata',
      where: 'key = ?',
      whereArgs: [key],
    );

    if (result.isEmpty) return null;
    return result.first['value'] as String;
  }

  /// Set sync metadata value
  Future<void> setMetadata(String key, String value) async {
    final db = await database;
    await db.insert('sync_metadata', {
      'key': key,
      'value': value,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// Get last sync timestamp
  Future<DateTime?> getLastSyncTimestamp() async {
    final timestamp = await getMetadata('last_sync_timestamp');
    if (timestamp == null) return null;
    return DateTime.parse(timestamp);
  }

  /// Update last sync timestamp
  Future<void> updateLastSyncTimestamp(DateTime timestamp) async {
    await setMetadata('last_sync_timestamp', timestamp.toIso8601String());
  }

  /// Get snapshot version
  Future<String?> getSnapshotVersion() async {
    return await getMetadata('snapshot_version');
  }

  /// Update snapshot version
  Future<void> updateSnapshotVersion(String version) async {
    await setMetadata('snapshot_version', version);
  }

  /// Clear all data (used before importing new snapshot)
  Future<void> clearAllData() async {
    final db = await database;

    // Clear all tables except metadata and pending operations
    await db.delete('customers');
    await db.delete('loans');
    await db.delete('loan_products');
    await db.delete('agents');
    await db.delete('branches');
    await db.delete(
      'loan_applications',
      where: 'status = ?',
      whereArgs: ['SYNCED'],
    );
    await db.delete('collections', where: 'status = ?', whereArgs: ['SYNCED']);
    await db.delete('payments', where: 'status = ?', whereArgs: ['SYNCED']);
    await db.delete(
      'loan_application_media',
      where: 'upload_status = ?',
      whereArgs: ['UPLOADED'],
    );
  }

  /// Get database size in bytes
  Future<int> getDatabaseSize() async {
    final databasePath = await getDatabasesPath();
    final path = join(databasePath, _databaseName);
    final file = await File(path).stat();
    return file.size;
  }

  /// Close database connection
  Future<void> close() async {
    final db = await database;
    await db.close();
    _database = null;
  }

  /// Delete database (for testing or complete reset)
  Future<void> deleteDatabase() async {
    final databasePath = await getDatabasesPath();
    final path = join(databasePath, _databaseName);
    await databaseFactory.deleteDatabase(path);
    _database = null;
  }
}
