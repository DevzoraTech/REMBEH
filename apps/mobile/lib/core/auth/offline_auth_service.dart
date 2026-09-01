import 'dart:convert';
import 'package:bcrypt/bcrypt.dart';
import 'package:sqflite/sqflite.dart';
import '../database/local_database.dart';
import '../../services/session_store.dart';

/// Service for offline authentication
class OfflineAuthService {
  final LocalDatabase _db = LocalDatabase.instance;

  /// Cache user credentials for offline login
  /// Called after successful online login
  Future<void> cacheCredentials({
    required String email,
    required String passwordHash,
    required RembehSession session,
  }) async {
    final database = await _db.database;

    // Store hashed credentials in auth_cache table
    await database.insert('auth_cache', {
      'email': email.trim().toLowerCase(),
      'password_hash': passwordHash,
      'user_id': session.publicId ?? '',
      'user_name': session.userName,
      'role_name': session.roleName ?? '',
      'tenant_id': session.tenantId ?? '',
      'branch_id': session.branchId ?? '',
      'branch_name': session.branchName ?? '',
      'workspace_name': session.workspaceName,
      'permissions': jsonEncode(session.permissions),
      'profile_photo_url': session.profilePhotoUrl ?? '',
      'cached_at': DateTime.now().millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// Verify offline login credentials
  /// Returns cached session data if credentials match
  Future<OfflineAuthResult> verifyOfflineLogin({
    required String email,
    required String password,
  }) async {
    final database = await _db.database;

    // Fetch cached credentials
    final results = await database.query(
      'auth_cache',
      where: 'email = ?',
      whereArgs: [email.trim().toLowerCase()],
      limit: 1,
    );

    if (results.isEmpty) {
      return OfflineAuthResult(
        success: false,
        error:
            'No cached credentials found. Please connect to internet to login.',
      );
    }

    final cached = results.first;
    final storedHash = cached['password_hash'] as String;

    // Verify password hash
    if (!_verifyPasswordHash(password, storedHash)) {
      return OfflineAuthResult(
        success: false,
        error: 'Invalid email or password.',
      );
    }

    // Create offline session
    final offlineSession = OfflineSessionData(
      userId: cached['user_id'] as String,
      userName: cached['user_name'] as String,
      userEmail: email.trim().toLowerCase(),
      roleName: cached['role_name'] as String,
      tenantId: cached['tenant_id'] as String,
      branchId: cached['branch_id'] as String,
      branchName: cached['branch_name'] as String,
      workspaceName: cached['workspace_name'] as String,
      permissions: (jsonDecode(cached['permissions'] as String) as List)
          .map((e) => e.toString())
          .toList(),
      profilePhotoUrl: cached['profile_photo_url'] as String?,
      cachedAt: DateTime.fromMillisecondsSinceEpoch(cached['cached_at'] as int),
    );

    return OfflineAuthResult(success: true, sessionData: offlineSession);
  }

  /// Hash password using bcrypt
  /// Uses bcrypt with default cost factor (10) for secure password hashing
  String hashPassword(String password) {
    return BCrypt.hashpw(password, BCrypt.gensalt());
  }

  /// Verify password against stored bcrypt hash
  bool _verifyPasswordHash(String password, String storedHash) {
    try {
      return BCrypt.checkpw(password, storedHash);
    } catch (e) {
      // If verification fails (e.g., invalid hash format), return false
      return false;
    }
  }

  /// Check if user has cached credentials
  Future<bool> hasCachedCredentials(String email) async {
    final database = await _db.database;
    final results = await database.query(
      'auth_cache',
      where: 'email = ?',
      whereArgs: [email.trim().toLowerCase()],
      limit: 1,
    );
    return results.isNotEmpty;
  }

  /// Clear cached credentials (on logout)
  Future<void> clearCachedCredentials(String email) async {
    final database = await _db.database;
    await database.delete(
      'auth_cache',
      where: 'email = ?',
      whereArgs: [email.trim().toLowerCase()],
    );
  }

  /// Clear all cached credentials
  Future<void> clearAllCachedCredentials() async {
    final database = await _db.database;
    await database.delete('auth_cache');
  }

  /// Get cached user info without authentication
  Future<OfflineSessionData?> getCachedUserInfo(String email) async {
    final database = await _db.database;
    final results = await database.query(
      'auth_cache',
      where: 'email = ?',
      whereArgs: [email.trim().toLowerCase()],
      limit: 1,
    );

    if (results.isEmpty) return null;

    final cached = results.first;
    return OfflineSessionData(
      userId: cached['user_id'] as String,
      userName: cached['user_name'] as String,
      userEmail: email.trim().toLowerCase(),
      roleName: cached['role_name'] as String,
      tenantId: cached['tenant_id'] as String,
      branchId: cached['branch_id'] as String,
      branchName: cached['branch_name'] as String,
      workspaceName: cached['workspace_name'] as String,
      permissions: (jsonDecode(cached['permissions'] as String) as List)
          .map((e) => e.toString())
          .toList(),
      profilePhotoUrl: cached['profile_photo_url'] as String?,
      cachedAt: DateTime.fromMillisecondsSinceEpoch(cached['cached_at'] as int),
    );
  }
}

/// Result of offline authentication attempt
class OfflineAuthResult {
  final bool success;
  final OfflineSessionData? sessionData;
  final String? error;

  OfflineAuthResult({required this.success, this.sessionData, this.error});
}

/// Cached session data for offline use
class OfflineSessionData {
  final String userId;
  final String userName;
  final String userEmail;
  final String roleName;
  final String tenantId;
  final String branchId;
  final String branchName;
  final String workspaceName;
  final List<String> permissions;
  final String? profilePhotoUrl;
  final DateTime cachedAt;

  OfflineSessionData({
    required this.userId,
    required this.userName,
    required this.userEmail,
    required this.roleName,
    required this.tenantId,
    required this.branchId,
    required this.branchName,
    required this.workspaceName,
    required this.permissions,
    this.profilePhotoUrl,
    required this.cachedAt,
  });

  /// Convert to RembehSession for offline use
  /// Note: tokens will be empty strings for offline sessions
  RembehSession toRembehSession() {
    return RembehSession(
      accessToken: 'offline',
      expiresAt: DateTime.now()
          .add(const Duration(days: 365))
          .toIso8601String(),
      tokenType: 'Offline',
      permissions: permissions,
      userName: userName,
      userEmail: userEmail,
      roleName: roleName,
      workspaceName: workspaceName,
      userId: userId,
      tenantId: tenantId,
      branchId: branchId,
      branchName: branchName,
      publicId: userId,
      profilePhotoUrl: profilePhotoUrl,
    );
  }

  bool hasPermission(String permission) => permissions.contains(permission);

  /// Check if cached data is stale (older than 30 days)
  bool get isStale {
    final thirtyDaysAgo = DateTime.now().subtract(const Duration(days: 30));
    return cachedAt.isBefore(thirtyDaysAgo);
  }
}
