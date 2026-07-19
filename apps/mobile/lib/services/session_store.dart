import 'dart:convert';

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
  final String? branchId;
  final String? branchName;
  final String? branchAddress;

  bool get isAgent =>
      (roleName ?? '').toLowerCase().contains('agent') ||
      permissions.contains('customer.create');

  bool get isExpired {
    final expiry = DateTime.tryParse(expiresAt);
    if (expiry == null) return true;
    return !expiry.isAfter(DateTime.now().add(const Duration(seconds: 30)));
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
        'branchId': branchId,
        'branchName': branchName,
        'branchAddress': branchAddress,
      };

  factory RembehSession.fromJson(Map<String, dynamic> json) {
    return RembehSession(
      accessToken: json['accessToken'] as String,
      expiresAt: json['expiresAt'] as String,
      tokenType: json['tokenType'] as String? ?? 'Bearer',
      permissions: (json['permissions'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      userName: json['userName'] as String? ?? '',
      userEmail: json['userEmail'] as String? ?? '',
      roleName: json['roleName'] as String?,
      workspaceName: json['workspaceName'] as String? ?? '',
      branchId: json['branchId'] as String?,
      branchName: json['branchName'] as String?,
      branchAddress: json['branchAddress'] as String?,
    );
  }
}

class SessionStore {
  static const _key = 'rembeh_mobile_session';

  Future<void> save(RembehSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(session.toJson()));
  }

  Future<RembehSession?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return RembehSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
