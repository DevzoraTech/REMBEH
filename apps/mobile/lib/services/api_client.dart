import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/agent_day_status.dart';
import '../utils/account_access.dart';
import '../utils/friendly_errors.dart';
import 'device_identity.dart';
import 'session_store.dart';

class ApiClient {
  ApiClient(this._sessionStore);

  final SessionStore _sessionStore;

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final device = await resolveDeviceIdentity();
    final uri = Uri.parse('$rembehApiBaseUrl/auth/login');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email.trim(),
        'password': password,
        ...device.toJson(),
      }),
    );

    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    final session = _sessionFromLoginBody(body, email);
    await _sessionStore.save(session);
    return body;
  }

  Future<RembehSession> uploadProfilePhoto({
    required RembehSession session,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  }) async {
    final extension = mimeType.contains('png')
        ? 'png'
        : mimeType.contains('webp')
        ? 'webp'
        : 'jpg';
    final presignUri = Uri.parse(
      '$rembehApiBaseUrl/auth/profile-photo/presign',
    );
    final presignResponse = await http.post(
      presignUri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        'mimeType': mimeType,
        'extension': extension,
        'fileName': ?fileName,
      }),
    );
    final presignBody = _decode(presignResponse);
    if (presignResponse.statusCode < 200 || presignResponse.statusCode >= 300) {
      throw ApiException(
        _failureMessage(presignBody, presignResponse.statusCode, presignUri),
      );
    }

    final uploadUrl = presignBody['uploadUrl'] as String?;
    final storageKey = presignBody['storageKey'] as String?;
    if (uploadUrl == null || storageKey == null) {
      throw ApiException('Profile photo upload could not be prepared.');
    }

    final putResponse = await http.put(
      Uri.parse(uploadUrl),
      headers: {'Content-Type': mimeType},
      body: bytes,
    );
    if (putResponse.statusCode < 200 || putResponse.statusCode >= 300) {
      throw ApiException('Profile photo upload failed. Please try again.');
    }

    final confirmUri = Uri.parse(
      '$rembehApiBaseUrl/auth/profile-photo/confirm',
    );
    final confirmResponse = await http.post(
      confirmUri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        'storageKey': storageKey,
        'mimeType': mimeType,
        'byteSize': bytes.length,
      }),
    );
    final confirmBody = _decode(confirmResponse);
    if (confirmResponse.statusCode < 200 || confirmResponse.statusCode >= 300) {
      throw ApiException(
        _failureMessage(confirmBody, confirmResponse.statusCode, confirmUri),
      );
    }

    final user = confirmBody['user'] as Map<String, dynamic>? ?? const {};
    final updated = session.copyWith(
      hasProfilePhoto: user['hasProfilePhoto'] as bool? ?? true,
      profilePhotoUrl: user['profilePhotoUrl'] as String?,
      profilePhotoStorageKey: user['profilePhotoStorageKey'] as String?,
    );
    await _sessionStore.save(updated);
    return updated;
  }

  /// Refresh access token using the stored refresh token.
  /// Returns the updated session, or null if refresh is impossible.
  /// Throws [ApiException] when the account itself is suspended/deactivated.
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
      final message = _message(body);
      if (isAccountAccessBlockedMessage(message)) {
        throw ApiException(message);
      }
      return null;
    }

    final sessionPayload = body['session'] as Map<String, dynamic>?;
    if (sessionPayload == null) return null;

    final updated = current.copyWith(
      accessToken: sessionPayload['accessToken'] as String,
      expiresAt: sessionPayload['expiresAt'] as String,
      refreshToken:
          sessionPayload['refreshToken'] as String? ?? current.refreshToken,
      refreshExpiresAt:
          sessionPayload['refreshExpiresAt'] as String? ??
          current.refreshExpiresAt,
      tokenType: sessionPayload['tokenType'] as String? ?? current.tokenType,
      permissions:
          (sessionPayload['permissions'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .toList() ??
          current.permissions,
    );
    await _sessionStore.save(updated);
    return updated;
  }

  Future<List<Map<String, dynamic>>> listCustomers(
    RembehSession session,
  ) async {
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

  Future<List<Map<String, dynamic>>> listLoans(RembehSession session) async {
    final uri = Uri.parse('$rembehApiBaseUrl/loans');
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final loans = body['loans'] as List<dynamic>? ?? const [];
    return loans.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getCollectionSummary(
    RembehSession session,
  ) async {
    final uri = Uri.parse('$rembehApiBaseUrl/collections/summary');
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> listRepayments(
    RembehSession session, {
    String? filter,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/collections/repayments').replace(
      queryParameters: filter == null || filter.isEmpty
          ? null
          : {'filter': filter},
    );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final repayments = body['repayments'] as List<dynamic>? ?? const [];
    return repayments.cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> listOperationReports({
    required RembehSession session,
    String? branchId,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/operations/reports').replace(
      queryParameters: branchId == null || branchId.isEmpty
          ? null
          : {'branchId': branchId},
    );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final reports = body['reports'] as List<dynamic>? ?? const [];
    return reports.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getOperationReport({
    required RembehSession session,
    required String reportId,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/operations/reports/$reportId');

    final response = await http.get(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<List<Map<String, dynamic>>> listCashShortages({
    required RembehSession session,
    String? branchId,
    String? userId,
    String? status,
  }) async {
    final query = <String, String>{
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (userId != null && userId.isNotEmpty) 'userId': userId,
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final uri = Uri.parse(
      '$rembehApiBaseUrl/cash-shortages',
    ).replace(queryParameters: query.isEmpty ? null : query);
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final shortages = body['shortages'] as List<dynamic>? ?? const [];
    return shortages.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getCashShortage({
    required RembehSession session,
    required String shortageId,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/cash-shortages/$shortageId');
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final shortage = body['shortage'];
    if (shortage is Map<String, dynamic>) {
      return shortage;
    }
    throw ApiException('Shortage details could not be loaded.');
  }

  Future<Map<String, dynamic>> recordCashShortagePayment({
    required RembehSession session,
    required String shortageId,
    required num amount,
    String method = 'CASH',
    String? notes,
  }) async {
    final uri = Uri.parse(
      '$rembehApiBaseUrl/cash-shortages/$shortageId/payments',
    );
    final response = await http.post(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        'method': method,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      }),
    );
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final shortage = body['shortage'];
    if (shortage is Map<String, dynamic>) {
      return shortage;
    }
    throw ApiException('Shortage settlement could not be recorded.');
  }

  Future<AgentDayStatus> getAgentDayStatus(RembehSession session) async {
    final uri = Uri.parse('$rembehApiBaseUrl/operations/agent-today');
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return AgentDayStatus.fromApi(body);
  }

  Future<Map<String, dynamic>> getBranchOperation({
    required RembehSession session,
    String? branchId,
    String? date,
  }) async {
    final query = <String, String>{
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (date != null && date.isNotEmpty) 'date': date,
    };
    final uri = Uri.parse(
      '$rembehApiBaseUrl/operations/today',
    ).replace(queryParameters: query.isEmpty ? null : query);
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> listBranchAgents({
    required RembehSession session,
    String? date,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/agents').replace(
      queryParameters: date == null || date.isEmpty ? null : {'date': date},
    );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final agents = body['agents'] as List<dynamic>? ?? const [];
    return agents.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> listAgentsOverview({
    required RembehSession session,
    String? search,
    String? date,
  }) async {
    final query = <String, String>{
      if (search != null && search.trim().isNotEmpty) 'q': search.trim(),
      if (date != null && date.isNotEmpty) 'date': date,
    };

    final uri = Uri.parse(
      '$rembehApiBaseUrl/agents',
    ).replace(queryParameters: query.isEmpty ? null : query);

    final response = await http.get(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> getAgentDetail({
    required RembehSession session,
    required String agentId,
    String? date,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/agents/$agentId').replace(
      queryParameters: date == null || date.isEmpty ? null : {'date': date},
    );

    final response = await http.get(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> getAgentActivity({
    required RembehSession session,
    required String agentId,
    String? date,
    String? range,
  }) async {
    final query = <String, String>{
      if (date != null && date.isNotEmpty) 'date': date,
      if (range != null && range.isNotEmpty) 'range': range,
    };

    final uri = Uri.parse(
      '$rembehApiBaseUrl/agents/$agentId/activity',
    ).replace(queryParameters: query.isEmpty ? null : query);

    final response = await http.get(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> getAgentAccount({
    required RembehSession session,
    required String agentId,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/agents/$agentId/account');

    final response = await http.get(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> updateAgentStatus({
    required RembehSession session,
    required String agentId,
    required String status,
    String? reason,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/agents/$agentId/status');

    final response = await http.patch(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        'status': status,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      }),
    );

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> updateAgentProfile({
    required RembehSession session,
    required String agentId,
    String? displayName,
    String? email,
    String? phone,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/agents/$agentId');

    final response = await http.patch(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        if (displayName != null) 'displayName': displayName.trim(),
        if (email != null) 'email': email.trim(),
        if (phone != null) 'phone': phone.trim(),
      }),
    );

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> revokeAgentSession({
    required RembehSession session,
    required String agentId,
    required String sessionId,
  }) async {
    final uri = Uri.parse(
      '$rembehApiBaseUrl/agents/$agentId/sessions/$sessionId',
    );

    final response = await http.delete(uri, headers: _authHeaders(session));

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> revokeAllAgentSessions({
    required RembehSession session,
    required String agentId,
  }) {
    return _postJson(
      session: session,
      path: '/agents/$agentId/sessions/revoke-all',
      body: const {},
    );
  }

  Future<Map<String, dynamic>> getSalariesDashboard({
    required RembehSession session,
    String? branchId,
    String? cycleStart,
    String? search,
  }) async {
    final query = <String, String>{
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (cycleStart != null && cycleStart.isNotEmpty) 'cycleStart': cycleStart,
      if (search != null && search.trim().isNotEmpty) 'q': search.trim(),
    };
    final uri = Uri.parse(
      '$rembehApiBaseUrl/salaries',
    ).replace(queryParameters: query.isEmpty ? null : query);
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> listSalaryAgentCandidates({
    required RembehSession session,
    String? branchId,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/salaries/agent-candidates')
        .replace(
          queryParameters: branchId == null || branchId.isEmpty
              ? null
              : {'branchId': branchId},
        );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    final agents = body['agents'] as List<dynamic>? ?? const [];
    return agents.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> createSalaryEmployee({
    required RembehSession session,
    required Map<String, dynamic> body,
  }) {
    return _postJson(session: session, path: '/salaries/employees', body: body);
  }

  Future<Map<String, dynamic>> getSalaryEmployee({
    required RembehSession session,
    required String employeeId,
    String? cycleStart,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/salaries/employees/$employeeId')
        .replace(
          queryParameters: cycleStart == null || cycleStart.isEmpty
              ? null
              : {'cycleStart': cycleStart},
        );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return body;
  }

  Future<Map<String, dynamic>> updateSalaryEmployee({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> body,
  }) {
    return _patchJson(
      session: session,
      path: '/salaries/employees/$employeeId',
      body: body,
    );
  }

  Future<Map<String, dynamic>> getSalaryHistory({
    required RembehSession session,
    required String employeeId,
  }) async {
    final uri = Uri.parse(
      '$rembehApiBaseUrl/salaries/employees/$employeeId/history',
    );
    final response = await http.get(uri, headers: _authHeaders(session));
    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }
    return body;
  }

  Future<Map<String, dynamic>> recordSalaryPayment({
    required RembehSession session,
    required String employeeId,
    required Map<String, dynamic> body,
    String? cycleStart,
  }) {
    final suffix = cycleStart == null || cycleStart.isEmpty
        ? ''
        : '?cycleStart=$cycleStart';
    return _postJson(
      session: session,
      path: '/salaries/employees/$employeeId/payments$suffix',
      body: body,
    );
  }

  Future<Map<String, dynamic>> reverseSalaryPayment({
    required RembehSession session,
    required String paymentId,
    String? reason,
  }) {
    return _postJson(
      session: session,
      path: '/salaries/payments/$paymentId/reverse',
      body: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> inviteBranchAgent({
    required RembehSession session,
    required String branchId,
    required String displayName,
    required String email,
  }) {
    return _postJson(
      session: session,
      path: '/branches/$branchId/staff-invitations',
      body: {
        'displayName': displayName.trim(),
        'email': email.trim(),
        'roleName': 'Agent',
      },
    );
  }

  Future<Map<String, dynamic>> openBranchOperation({
    required RembehSession session,
    String? branchId,
    required String date,
    num? openingBalance,
    num? cashAddedToday,
    String? notes,
  }) {
    final body = <String, dynamic>{
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      'date': date,
    };
    if (openingBalance != null) body['openingBalance'] = openingBalance;
    if (cashAddedToday != null) body['cashAddedToday'] = cashAddedToday;
    if (notes != null && notes.trim().isNotEmpty) {
      body['notes'] = notes.trim();
    }
    return _postJson(session: session, path: '/operations/open', body: body);
  }

  Future<Map<String, dynamic>> recordBranchTopUp({
    required RembehSession session,
    String? branchId,
    required String date,
    required num amount,
    String? description,
  }) {
    return _postJson(
      session: session,
      path: '/operations/top-ups',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        'amount': amount,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> updateBranchExpense({
    required RembehSession session,
    required String expenseId,
    String? category,
    num? amount,
    String? description,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl/operations/expenses/$expenseId');

    final response = await http.patch(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode({
        if (category != null && category.isNotEmpty) 'category': category,
        'amount': ?amount,
        if (description != null) 'description': description.trim(),
      }),
    );

    final body = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(body, response.statusCode, uri));
    }

    return body;
  }

  Future<Map<String, dynamic>> voidBranchExpense({
    required RembehSession session,
    required String expenseId,
    String? reason,
  }) {
    return _postJson(
      session: session,
      path: '/operations/expenses/$expenseId/void',
      body: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> recordBranchExpense({
    required RembehSession session,
    String? branchId,
    required String date,
    required String category,
    required num amount,
    String? description,
  }) {
    return _postJson(
      session: session,
      path: '/operations/expenses',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        'category': category,
        'amount': amount,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> recordAgentFloat({
    required RembehSession session,
    required String agentId,
    required String date,
    required num amount,
    String? notes,
    bool addMore = false,
  }) {
    final action = addMore ? 'floats/top-ups' : 'floats';
    return _postJson(
      session: session,
      path: '/agents/$agentId/$action',
      body: {
        'date': date,
        'amountGiven': amount,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> recordAgentReturn({
    required RembehSession session,
    String? branchId,
    required String date,
    required String agentId,
    required num amountReturned,
    String? shortageReason,
    String? notes,
  }) {
    return _postJson(
      session: session,
      path: '/operations/agent-returns',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        'agentId': agentId,
        'amountReturned': amountReturned,
        if (shortageReason != null && shortageReason.isNotEmpty)
          'shortageReason': shortageReason,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> startOperationReconciliation({
    required RembehSession session,
    String? branchId,
    required String date,
  }) {
    return _postJson(
      session: session,
      path: '/operations/reconciliation/start',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
      },
    );
  }

  Future<Map<String, dynamic>> updateOperationReconciliationCashCount({
    required RembehSession session,
    String? branchId,
    required String date,
    required num countedCash,
    String? notes,
  }) {
    return _postJson(
      session: session,
      path: '/operations/reconciliation/cash-count',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        'countedCash': countedCash,
        if (notes != null) 'notes': notes.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> updateOperationReconciliationNotes({
    required RembehSession session,
    String? branchId,
    required String date,
    required String notes,
  }) {
    return _postJson(
      session: session,
      path: '/operations/reconciliation/notes',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        'notes': notes.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> submitOperationReconciliation({
    required RembehSession session,
    String? branchId,
    required String date,
    String? notes,
    String? shortageResponsibleUserId,
  }) {
    return _postJson(
      session: session,
      path: '/operations/reconciliation/submit',
      body: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        'date': date,
        if (notes != null) 'notes': notes.trim(),
        if (shortageResponsibleUserId != null &&
            shortageResponsibleUserId.isNotEmpty)
          'shortageResponsibleUserId': shortageResponsibleUserId,
      },
    );
  }

  Future<Map<String, dynamic>> managerConfirmOperationReport({
    required RembehSession session,
    required String reportId,
    String? notes,
  }) {
    return _postJson(
      session: session,
      path: '/operations/reports/$reportId/manager-confirm',
      body: {
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
  }

  Future<Map<String, dynamic>> createCustomer({
    required RembehSession session,
    required String fullName,
    required String phone,
    String? nationalId,
  }) async {
    final response = await http.post(
      Uri.parse('$rembehApiBaseUrl/customers'),
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
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
      tenantId: workspace['id'] as String?,
      refreshToken: sessionPayload['refreshToken'] as String?,
      refreshExpiresAt: sessionPayload['refreshExpiresAt'] as String?,
      branchId: branch?['id'] as String? ?? user['branchId'] as String?,
      branchName: branch?['name'] as String?,
      branchAddress: branch?['address'] as String?,
      publicId: user['publicId'] as String?,
      hasProfilePhoto:
          user['hasProfilePhoto'] as bool? ??
          (user['profilePhotoStorageKey'] as String?)?.isNotEmpty == true,
      profilePhotoUrl: user['profilePhotoUrl'] as String?,
      profilePhotoStorageKey: user['profilePhotoStorageKey'] as String?,
    );
  }

  Map<String, String> _authHeaders(RembehSession session) => {
    'Authorization': '${session.tokenType} ${session.accessToken}',
  };

  Future<Map<String, dynamic>> _postJson({
    required RembehSession session,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl$path');
    final response = await http.post(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    final payload = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(payload, response.statusCode, uri));
    }
    return payload;
  }

  Future<Map<String, dynamic>> _patchJson({
    required RembehSession session,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final uri = Uri.parse('$rembehApiBaseUrl$path');
    final response = await http.patch(
      uri,
      headers: {..._authHeaders(session), 'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    final payload = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_failureMessage(payload, response.statusCode, uri));
    }
    return payload;
  }

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

  String _failureMessage(Map<String, dynamic> body, int statusCode, Uri uri) {
    final message = _message(body);
    if (isAccountAccessBlockedMessage(message)) {
      return message;
    }
    if (statusCode == 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (statusCode == 403) {
      return 'You do not have access to do that. Contact your manager.';
    }
    if (statusCode == 404 || message.toLowerCase().startsWith('cannot ')) {
      return 'We could not complete that request. Please refresh and try again.';
    }
    return friendlyErrorMessage(message);
  }
}

class ApiException implements Exception {
  ApiException(String message) : message = friendlyErrorMessage(message);
  final String message;

  @override
  String toString() => message;
}
