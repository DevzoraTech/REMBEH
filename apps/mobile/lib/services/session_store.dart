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
    this.refreshToken,
    this.refreshExpiresAt,
    this.branchId,
    this.branchName,
    this.branchAddress,
  });

  final String accessToken;
  final String expiresAt;
  final String tokenType;
  final List<String> permissions;
  final String userName;
  final String userEmail;
  final String? roleName;
  final String workspaceName;
  final String? refreshToken;
  final String? refreshExpiresAt;
  final String? branchId;
  final String? branchName;
  final String? branchAddress;

  bool get isAgent =>
      (roleName ?? '').toLowerCase().contains('agent') ||
      permissions.contains('customer.create');

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
    String? refreshToken,
    String? refreshExpiresAt,
    String? branchId,
    String? branchName,
    String? branchAddress,
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
      refreshToken: refreshToken ?? this.refreshToken,
      refreshExpiresAt: refreshExpiresAt ?? this.refreshExpiresAt,
      branchId: branchId ?? this.branchId,
      branchName: branchName ?? this.branchName,
      branchAddress: branchAddress ?? this.branchAddress,
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
        'refreshToken': refreshToken,
        'refreshExpiresAt': refreshExpiresAt,
        'branchId': branchId,
        'branchName': branchName,
        'branchAddress': branchAddress,
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
        'refreshExpiresAt': refreshExpiresAt,
        'branchId': branchId,
        'branchName': branchName,
        'branchAddress': branchAddress,
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
      refreshToken: json['refreshToken'] as String?,
      refreshExpiresAt: json['refreshExpiresAt'] as String?,
      branchId: json['branchId'] as String?,
      branchName: json['branchName'] as String?,
      branchAddress: json['branchAddress'] as String?,
    );
  }
}

class SessionStore {
  static const _profileKey = 'rembeh_mobile_session_profile';
  static const _legacyKey = 'rembeh_mobile_session';
  static const _accessTokenKey = 'rembeh_mobile_access_token';
  static const _refreshTokenKey = 'rembeh_mobile_refresh_token';

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
  }

  Future<RembehSession?> read() async {
    final prefs = await SharedPreferences.getInstance();

    // Migrate legacy plaintext session blob → secure storage.
    final legacy = prefs.getString(_legacyKey);
    if (legacy != null && legacy.isNotEmpty) {
      try {
        final session =
            RembehSession.fromJson(jsonDecode(legacy) as Map<String, dynamic>);
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
      return RembehSession.fromJson({
        ...profile,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      });
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_profileKey);
    await prefs.remove(_legacyKey);
    await _secure.delete(key: _accessTokenKey);
    await _secure.delete(key: _refreshTokenKey);
  }
}
