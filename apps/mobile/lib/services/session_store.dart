import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RembehSession {
  RembehSession({
    required this.accessToken,
    required this.expiresAt,
    required this.tokenType,
    required this.permissions,
    required this.userName,
    required this.userEmail,
    required this.roleName,
    required this.workspaceName,
    this.userId,
    this.tenantId,
    this.refreshToken,
    this.refreshExpiresAt,
    this.branchId,
    this.branchName,
    this.branchAddress,
    this.publicId,
    this.hasProfilePhoto = false,
    this.profilePhotoUrl,
    this.profilePhotoStorageKey,
  });

  final String accessToken;
  final String expiresAt;
  final String tokenType;
  final List<String> permissions;
  final String userName;
  final String userEmail;
  final String? roleName;
  final String workspaceName;
  final String? userId;

  /// Organisation / tenant id from auth (workspace.id).
  final String? tenantId;
  final String? refreshToken;
  final String? refreshExpiresAt;
  final String? branchId;
  final String? branchName;
  final String? branchAddress;

  /// Human-reportable agent id (e.g. A-48291).
  final String? publicId;
  final bool hasProfilePhoto;
  final String? profilePhotoUrl;
  final String? profilePhotoStorageKey;

  /// Field and branch staff who use the mobile app for loans and collections.
  bool get isFieldStaff {
    final role = (roleName ?? '').toLowerCase();
    return role.contains('agent') ||
        role.contains('field officer') ||
        role.contains('loan officer') ||
        role.contains('cashier') ||
        role.contains('supervisor') ||
        role.contains('manager') ||
        role.contains('recovery') ||
        permissions.contains('customer.create') ||
        permissions.contains('loan.create') ||
        permissions.contains('collection.create');
  }

  bool hasPermission(String permission) => permissions.contains(permission);

  bool get usesFieldOfficerFloatForLoans {
    if (isOrganisationOwner) return false;
    final role = (roleName ?? '').toLowerCase();
    if (role.contains('manager') || role.contains('cashier')) {
      return false;
    }

    return !permissions.contains('operation.float.manage');
  }

  bool get isOrganisationOwner => permissions.contains('branch.create');

  bool get canUseBranchWorkspace {
    if (isOrganisationOwner) return false;
    final role = (roleName ?? '').toLowerCase();
    return role.contains('manager') ||
        role.contains('cashier') ||
        role.contains('supervisor') ||
        permissions.any(
          (permission) =>
              permission == 'operation.read' ||
              permission == 'operation.open' ||
              permission == 'operation.cash.topup' ||
              permission == 'operation.float.manage' ||
              permission == 'operation.float.return' ||
              permission == 'operation.expense.create' ||
              permission == 'operation.close' ||
              permission == 'operation.report.review',
        );
  }

  bool get canUseFieldWorkspace {
    final role = (roleName ?? '').toLowerCase();
    return role.contains('agent') ||
        role.contains('field officer') ||
        role.contains('loan officer') ||
        role.contains('recovery') ||
        permissions.contains('customer.create') ||
        permissions.contains('loan.create') ||
        permissions.contains('collection.create');
  }

  /// Legacy alias for field users invited under older role names.
  bool get isAgent =>
      isFieldStaff ||
      (roleName ?? '').toLowerCase().contains('agent') ||
      permissions.contains('customer.create');

  /// Profile selfie required for dedicated field agents, not branch managers/cashiers.
  bool get requiresProfilePhoto {
    final role = (roleName ?? '').toLowerCase();
    if (role.contains('manager') || role.contains('cashier')) return false;
    return role.contains('agent') ||
        role.contains('field officer') ||
        role.contains('loan officer') ||
        role.contains('recovery') ||
        permissions.contains('customer.create');
  }

  /// Access token expired (30s buffer).
  bool get isAccessExpired {
    final expiry = DateTime.tryParse(expiresAt);
    if (expiry == null) return true;
    return !expiry.isAfter(DateTime.now().add(const Duration(seconds: 30)));
  }

  /// Refresh token still usable.
  bool get canRefresh {
    final token = refreshToken;
    if (token == null || token.isEmpty) return false;
    final expiry = DateTime.tryParse(refreshExpiresAt ?? '');
    if (expiry == null) return true;
    return expiry.isAfter(DateTime.now().add(const Duration(seconds: 30)));
  }

  /// Back-compat: true when access is expired and refresh is unavailable.
  bool get isExpired => isAccessExpired && !canRefresh;

  RembehSession copyWith({
    String? accessToken,
    String? expiresAt,
    String? tokenType,
    List<String>? permissions,
    String? userName,
    String? userEmail,
    String? roleName,
    String? workspaceName,
    String? userId,
    String? tenantId,
    String? refreshToken,
    String? refreshExpiresAt,
    String? branchId,
    String? branchName,
    String? branchAddress,
    String? publicId,
    bool? hasProfilePhoto,
    String? profilePhotoUrl,
    String? profilePhotoStorageKey,
  }) {
    return RembehSession(
      accessToken: accessToken ?? this.accessToken,
      expiresAt: expiresAt ?? this.expiresAt,
      tokenType: tokenType ?? this.tokenType,
      permissions: permissions ?? this.permissions,
      userName: userName ?? this.userName,
      userEmail: userEmail ?? this.userEmail,
      roleName: roleName ?? this.roleName,
      workspaceName: workspaceName ?? this.workspaceName,
      userId: userId ?? this.userId,
      tenantId: tenantId ?? this.tenantId,
      refreshToken: refreshToken ?? this.refreshToken,
      refreshExpiresAt: refreshExpiresAt ?? this.refreshExpiresAt,
      branchId: branchId ?? this.branchId,
      branchName: branchName ?? this.branchName,
      branchAddress: branchAddress ?? this.branchAddress,
      publicId: publicId ?? this.publicId,
      hasProfilePhoto: hasProfilePhoto ?? this.hasProfilePhoto,
      profilePhotoUrl: profilePhotoUrl ?? this.profilePhotoUrl,
      profilePhotoStorageKey:
          profilePhotoStorageKey ?? this.profilePhotoStorageKey,
    );
  }

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'expiresAt': expiresAt,
    'tokenType': tokenType,
    'permissions': permissions,
    'userName': userName,
    'userEmail': userEmail,
    'roleName': roleName,
    'workspaceName': workspaceName,
    'userId': userId,
    'tenantId': tenantId,
    'refreshToken': refreshToken,
    'refreshExpiresAt': refreshExpiresAt,
    'branchId': branchId,
    'branchName': branchName,
    'branchAddress': branchAddress,
    'publicId': publicId,
    'hasProfilePhoto': hasProfilePhoto,
    'profilePhotoUrl': profilePhotoUrl,
    'profilePhotoStorageKey': profilePhotoStorageKey,
  };

  /// Non-secret profile fields kept in SharedPreferences.
  Map<String, dynamic> toProfileJson() => {
    'expiresAt': expiresAt,
    'tokenType': tokenType,
    'permissions': permissions,
    'userName': userName,
    'userEmail': userEmail,
    'roleName': roleName,
    'workspaceName': workspaceName,
    'userId': userId,
    'tenantId': tenantId,
    'refreshExpiresAt': refreshExpiresAt,
    'branchId': branchId,
    'branchName': branchName,
    'branchAddress': branchAddress,
    'publicId': publicId,
    'hasProfilePhoto': hasProfilePhoto,
    'profilePhotoUrl': profilePhotoUrl,
    'profilePhotoStorageKey': profilePhotoStorageKey,
  };

  factory RembehSession.fromJson(Map<String, dynamic> json) {
    return RembehSession(
      accessToken: json['accessToken'] as String? ?? '',
      expiresAt: json['expiresAt'] as String? ?? '',
      tokenType: json['tokenType'] as String? ?? 'Bearer',
      permissions: (json['permissions'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      userName: json['userName'] as String? ?? '',
      userEmail: json['userEmail'] as String? ?? '',
      roleName: json['roleName'] as String?,
      workspaceName: json['workspaceName'] as String? ?? '',
      userId: json['userId'] as String?,
      tenantId: json['tenantId'] as String?,
      refreshToken: json['refreshToken'] as String?,
      refreshExpiresAt: json['refreshExpiresAt'] as String?,
      branchId: json['branchId'] as String?,
      branchName: json['branchName'] as String?,
      branchAddress: json['branchAddress'] as String?,
      publicId: json['publicId'] as String?,
      hasProfilePhoto: json['hasProfilePhoto'] as bool? ?? false,
      profilePhotoUrl: json['profilePhotoUrl'] as String?,
      profilePhotoStorageKey: json['profilePhotoStorageKey'] as String?,
    );
  }
}

String? tenantIdFromAccessToken(String token) {
  final parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    var segment = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    final pad = (4 - segment.length % 4) % 4;
    if (pad != 0) {
      segment = '$segment${'=' * pad}';
    }
    final payload = jsonDecode(utf8.decode(base64Decode(segment)));
    if (payload is! Map) return null;
    final value = payload['tenantId']?.toString().trim();
    if (value == null || value.isEmpty) return null;
    return value;
  } catch (_) {
    return null;
  }
}

class SessionStore {
  static const _profileKey = 'rembeh_mobile_session_profile';
  static const _legacyKey = 'rembeh_mobile_session';
  static const _accessTokenKey = 'rembeh_mobile_access_token';
  static const _refreshTokenKey = 'rembeh_mobile_refresh_token';
  static const _lastActivityKey = 'rembeh_mobile_last_activity_at';

  static const _secure = FlutterSecureStorage();

  Future<void> save(RembehSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_profileKey, jsonEncode(session.toProfileJson()));
    await _secure.write(key: _accessTokenKey, value: session.accessToken);
    if (session.refreshToken != null && session.refreshToken!.isNotEmpty) {
      await _secure.write(key: _refreshTokenKey, value: session.refreshToken);
    } else {
      await _secure.delete(key: _refreshTokenKey);
    }
    await prefs.remove(_legacyKey);
    await markActivity(DateTime.now());
  }

  Future<void> markActivity(DateTime at) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastActivityKey, at.toIso8601String());
  }

  Future<DateTime?> readLastActivityAt() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_lastActivityKey);
    if (raw == null || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }

  Future<RembehSession?> read() async {
    final prefs = await SharedPreferences.getInstance();

    // Migrate legacy plaintext session blob → secure storage.
    final legacy = prefs.getString(_legacyKey);
    if (legacy != null && legacy.isNotEmpty) {
      try {
        final session = RembehSession.fromJson(
          jsonDecode(legacy) as Map<String, dynamic>,
        );
        if (session.accessToken.isNotEmpty) {
          await save(session);
          return session;
        }
      } catch (_) {
        await prefs.remove(_legacyKey);
      }
    }

    final profileRaw = prefs.getString(_profileKey);
    final accessToken = await _secure.read(key: _accessTokenKey);
    if (profileRaw == null ||
        profileRaw.isEmpty ||
        accessToken == null ||
        accessToken.isEmpty) {
      return null;
    }

    try {
      final profile = jsonDecode(profileRaw) as Map<String, dynamic>;
      final refreshToken = await _secure.read(key: _refreshTokenKey);
      final session = RembehSession.fromJson({
        ...profile,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      });
      final storedTenant = session.tenantId?.trim();
      if (storedTenant != null && storedTenant.isNotEmpty) {
        return session;
      }
      final tokenTenant = tenantIdFromAccessToken(session.accessToken);
      if (tokenTenant == null) return session;
      final hydrated = session.copyWith(tenantId: tokenTenant);
      await save(hydrated);
      return hydrated;
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_profileKey);
    await prefs.remove(_legacyKey);
    await prefs.remove(_lastActivityKey);
    await _secure.delete(key: _accessTokenKey);
    await _secure.delete(key: _refreshTokenKey);
  }
}
