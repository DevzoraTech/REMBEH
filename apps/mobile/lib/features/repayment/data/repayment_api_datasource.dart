import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../config.dart';
import '../../../services/api_client.dart';
import '../../../services/session_store.dart';

class RepaymentApiDatasource {
  RepaymentApiDatasource(this._sessionStore);

  final SessionStore _sessionStore;

  Future<Map<String, dynamic>> getSummary() async {
    final session = await _requireSession();
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/collections/summary'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> listRepayments({String? filter}) async {
    final session = await _requireSession();
    final uri = Uri.parse('$rembehApiBaseUrl/collections/repayments').replace(
      queryParameters: {
        if (filter != null && filter.isNotEmpty) 'filter': filter,
      },
    );
    final response = await http.get(uri, headers: _headers(session));
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> listDueToday() async {
    final session = await _requireSession();
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/collections/due-today'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> searchClients(String query) async {
    final session = await _requireSession();
    final uri = Uri.parse('$rembehApiBaseUrl/collections/clients/search')
        .replace(queryParameters: {'q': query});
    final response = await http.get(uri, headers: _headers(session));
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> getLoanDetail(String loanId) async {
    final session = await _requireSession();
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/collections/loans/$loanId'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> recordRepayment({
    required String loanId,
    required int amount,
    String method = 'CASH',
    String? note,
    DateTime? paidAt,
  }) async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/collections/repayments'),
      headers: {
        ..._headers(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'loanId': loanId,
        'amount': amount,
        'method': method,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (paidAt != null) 'paidAt': paidAt.toUtc().toIso8601String(),
      }),
    );
    return _decodeOk(response);
  }

  Map<String, String> _headers(RembehSession session) => {
        'Authorization': '${session.tokenType} ${session.accessToken}',
        'Accept': 'application/json',
      };

  Future<RembehSession> _requireSession() async {
    var session = await _sessionStore.read();
    if (session == null) {
      throw ApiException('Not signed in.');
    }
    if (session.isAccessExpired && session.canRefresh) {
      final refreshed = await ApiClient(_sessionStore).refreshSession(session);
      if (refreshed != null) return refreshed;
    }
    if (session.isAccessExpired) {
      throw ApiException('Session expired. Please sign in again.');
    }
    return session;
  }

  Map<String, dynamic> _decodeOk(http.Response response) {
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_message(body));
    }
    return body;
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    return <String, dynamic>{};
  }

  String _message(Map<String, dynamic> body) {
    final message = body['message'];
    if (message is String && message.isNotEmpty) return message;
    if (message is List && message.isNotEmpty) {
      return message.map((item) => item.toString()).join(', ');
    }
    return 'Request failed.';
  }
}
