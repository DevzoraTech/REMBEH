import 'package:flutter/material.dart';

import '../../../core/network/realtime_client.dart';
import '../../../models/agent_day_status.dart';
import '../../../services/api_client.dart';
import '../../../services/session_store.dart';
import '../../../utils/account_access.dart';
import '../../../utils/friendly_errors.dart';

class AgentDayStatusStore extends ChangeNotifier {
  AgentDayStatusStore._();

  static final AgentDayStatusStore instance = AgentDayStatusStore._();

  final _api = ApiClient(SessionStore());
  RembehSession? _session;
  AgentDayStatus? _status;
  bool _loading = false;
  bool _listening = false;
  String? _error;
  String? _accountBlockedMessage;

  AgentDayStatus? get status => _status;
  bool get loading => _loading;
  String? get error => _error;
  String? get accountBlockedMessage => _accountBlockedMessage;

  Future<void> start(RembehSession session) async {
    final sessionChanged =
        _session?.tenantId != session.tenantId ||
        _session?.branchId != session.branchId ||
        _session?.userEmail != session.userEmail;
    if (sessionChanged) {
      clearSessionState();
    }

    _session = session;
    await refresh();
    await RealtimeClient.instance.connect(session);
    if (_listening) return;
    _listening = true;

    final client = RealtimeClient.instance;
    client
      ..on('operation.branch_opened', _onDayEvent)
      ..on('operation.branch_closed', _onDayEvent)
      ..on('operation.float_updated', _onDayEvent)
      ..on('operation.float_returned', _onDayEvent)
      ..on('payment.made', _onDayEvent)
      ..on('loan_application.submitted', _onDayEvent)
      ..on('loan_application.updated', _onDayEvent);
  }

  Future<void> refresh() async {
    final session = _session;
    if (session == null) return;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _status = await _api.getAgentDayStatus(session);
      _error = null;
      _accountBlockedMessage = null;
    } catch (error) {
      final message = friendlyErrorMessage(
        error,
        fallback: 'We could not check your branch day. Please refresh.',
      );
      if (isAccountAccessBlockedMessage(message)) {
        _accountBlockedMessage = message;
        _error = message;
      } else {
        _error = message;
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void clearSessionState() {
    final client = RealtimeClient.instance;
    client
      ..off('operation.branch_opened', _onDayEvent)
      ..off('operation.branch_closed', _onDayEvent)
      ..off('operation.float_updated', _onDayEvent)
      ..off('operation.float_returned', _onDayEvent)
      ..off('payment.made', _onDayEvent)
      ..off('loan_application.submitted', _onDayEvent)
      ..off('loan_application.updated', _onDayEvent);
    _session = null;
    _status = null;
    _error = null;
    _accountBlockedMessage = null;
    _loading = false;
    _listening = false;
    notifyListeners();
  }

  void _onDayEvent(Map<String, dynamic> payload) {
    final session = _session;
    if (session == null) return;

    final payloadTenant = payload['tenantId'] as String?;
    final payloadBranch = payload['branchId'] as String?;
    if (payloadTenant != null && payloadTenant != session.tenantId) return;
    if (payloadBranch != null && payloadBranch != session.branchId) return;

    // ignore: discarded_futures
    refresh();
  }
}
