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

    final sessionPayload = body['session'] as Map<String, dynamic>;
    final user = body['user'] as Map<String, dynamic>;
    final workspace = body['workspace'] as Map<String, dynamic>;
    final branch = body['branch'] as Map<String, dynamic>?;

    final session = RembehSession(
      accessToken: sessionPayload['accessToken'] as String,
      expiresAt: sessionPayload['expiresAt'] as String,
      tokenType: sessionPayload['tokenType'] as String? ?? 'Bearer',
      permissions: (sessionPayload['permissions'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      userName: user['name'] as String? ?? '',
      userEmail: user['email'] as String? ?? email,
      roleName: user['roleName'] as String?,
      workspaceName: workspace['name'] as String? ?? '',
      branchId: branch?['id'] as String? ?? user['branchId'] as String?,
      branchName: branch?['name'] as String?,
      branchAddress: branch?['address'] as String?,
    );

    await _sessionStore.save(session);
    return body;
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
    // Surface the full URL on Nest Express 404s so a missing `/api/v1` is obvious.
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
