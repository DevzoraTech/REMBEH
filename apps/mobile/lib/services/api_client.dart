import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'session_store.dart';

class ApiClient {
  ApiClient(this._sessionStore);

  final SessionStore _sessionStore;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/auth/login');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email.trim(), 'password': password}),
    );

    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    final session = _sessionFromLoginBody(body, email);
    await _sessionStore.save(session);
    return body;
  }

  /// Refresh access token using the stored refresh token.
  /// Returns the updated session, or null if refresh is impossible.
  Future<RembehSession?> refreshSession(RembehSession current) async {
    if (!current.canRefresh) return null;

    final uri = Uri.parse('$rembehApiBaseUrl/auth/refresh');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': current.refreshToken}),
    );
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }

    final sessionPayload = body['session'] as Map<String, dynamic>?;
    if (sessionPayload == null) return null;

    final updated = current.copyWith(
      accessToken: sessionPayload['accessToken'] as String,
      expiresAt: sessionPayload['expiresAt'] as String,
      refreshToken: sessionPayload['refreshToken'] as String? ?? current.refreshToken,
      refreshExpiresAt: sessionPayload['refreshExpiresAt'] as String? ??
          current.refreshExpiresAt,
      tokenType: sessionPayload['tokenType'] as String? ?? current.tokenType,
      permissions: (sessionPayload['permissions'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .toList() ??
          current.permissions,
    );
    await _sessionStore.save(updated);
    return updated;
  }

  Future<List<Map<String, dynamic>>> listCustomers(RembehSession session) async {
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/customers'),
      headers: _authHeaders(session),
    );
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_message(body));
    }
    final customers = body['customers'] as List<dynamic>? ?? const [];
    return customers.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> createCustomer({
    required RembehSession session,
    required String fullName,
    required String phone,
    String? nationalId,
  }) async {
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/customers'),
      headers: {
        ..._authHeaders(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'fullName': fullName.trim(),
        'phone': phone.trim(),
        if (nationalId != null && nationalId.trim().isNotEmpty)
          'nationalId': nationalId.trim(),
      }),
    );
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_message(body));
    }
    return body;
  }

  RembehSession _sessionFromLoginBody(
    Map<String, dynamic> body,
    String emailFallback,
  ) {
    final sessionPayload = body['session'] as Map<String, dynamic>;
    final user = body['user'] as Map<String, dynamic>;
    final workspace = body['workspace'] as Map<String, dynamic>;
    final branch = body['branch'] as Map<String, dynamic>?;

    return RembehSession(
      accessToken: sessionPayload['accessToken'] as String,
      expiresAt: sessionPayload['expiresAt'] as String,
      tokenType: sessionPayload['tokenType'] as String? ?? 'Bearer',
      permissions: (sessionPayload['permissions'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      userName: user['name'] as String? ?? '',
      userEmail: user['email'] as String? ?? emailFallback,
      roleName: user['roleName'] as String?,
      workspaceName: workspace['name'] as String? ?? '',
      refreshToken: sessionPayload['refreshToken'] as String?,
      refreshExpiresAt: sessionPayload['refreshExpiresAt'] as String?,
      branchId: branch?['id'] as String? ?? user['branchId'] as String?,
      branchName: branch?['name'] as String?,
      branchAddress: branch?['address'] as String?,
      publicId: user['publicId'] as String?,
    );
  }

  Map<String, String> _authHeaders(RembehSession session) => {
        'Authorization': '${session.tokenType} ${session.accessToken}',
      };

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    return <String, dynamic>{};
  }

  String _message(Map<String, dynamic> body) {
    final message = body['message'];
    if (message is List) return message.join(' ');
    if (message is String) return message;
    return 'Request failed.';
  }

  String _failureMessage(
    Map<String, dynamic> body,
    int statusCode,
    Uri uri,
  ) {
    final message = _message(body);
    if (statusCode == 404 || message.startsWith('Cannot POST')) {
      return '$message → $uri';
    }
    return message;
  }
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}
