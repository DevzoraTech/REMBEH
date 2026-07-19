import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../../../config.dart';
import '../../../services/api_client.dart';
import '../../../services/session_store.dart';

class LoanApplicationApiDatasource {
  LoanApplicationApiDatasource(this._sessionStore);

  final SessionStore _sessionStore;

  Future<Map<String, dynamic>> createDraft() async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/loan-applications'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> getById(String id) async {
    final session = await _requireSession();
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> update(String id, Map<String, dynamic> body) async {
    final session = await _requireSession();
    final response = await http.patch(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id'),
      headers: {
        ..._headers(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> verifyApplicant(
    String id,
    Map<String, dynamic> body,
  ) async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id/verify-applicant'),
      headers: {
        ..._headers(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> presignMedia(
    String id,
    Map<String, dynamic> body,
  ) async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id/media/presign'),
      headers: {
        ..._headers(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );
    return _decodeOk(response);
  }

  Future<void> uploadToPresignedUrl({
    required String uploadUrl,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    final response = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': mimeType},
      body: bytes,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('Media upload failed (${response.statusCode}).');
    }
  }

  Future<Map<String, dynamic>> confirmMedia(
    String id,
    Map<String, dynamic> body,
  ) async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id/media/confirm'),
      headers: {
        ..._headers(session),
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> submit(String id) async {
    final session = await _requireSession();
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/loan-applications/$id/submit'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<Map<String, dynamic>> list() async {
    final session = await _requireSession();
    final response = await http.get(
      Uri.parse('$rembehApiBaseUrl/loan-applications'),
      headers: _headers(session),
    );
    return _decodeOk(response);
  }

  Future<RembehSession> _requireSession() async {
    final session = await _sessionStore.read();
    if (session == null) {
      throw ApiException('You are not signed in.');
    }
    return session;
  }

  Map<String, String> _headers(RembehSession session) => {
        'Authorization': '${session.tokenType} ${session.accessToken}',
      };

  Map<String, dynamic> _decodeOk(http.Response response) {
    final body = response.body.isEmpty
        ? <String, dynamic>{}
        : (jsonDecode(response.body) as Map<String, dynamic>);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = body['message'];
      if (message is List) {
        throw ApiException(message.join(' '));
      }
      if (message is String) {
        throw ApiException(message);
      }
      throw ApiException('Request failed.');
    }
    return body;
  }
}
