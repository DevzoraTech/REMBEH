import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../config.dart';
import '../../services/session_store.dart';

typedef RealtimeHandler = void Function(Map<String, dynamic> payload);

class RealtimeClient {
  RealtimeClient._();

  static final RealtimeClient instance = RealtimeClient._();

  io.Socket? _socket;
  String? _connectedTenantId;
  String? _connectedToken;
  final Map<String, List<RealtimeHandler>> _handlers = {};

  String get _socketBase {
    final api = rembehApiBaseUrl;
    if (api.endsWith('/api/v1')) {
      return api.substring(0, api.length - '/api/v1'.length);
    }
    return api;
  }

  Future<void> connect(RembehSession session) async {
    final tenantId = session.tenantId ?? '';
    final token = session.accessToken;
    if (_socket?.connected == true &&
        _connectedTenantId == tenantId &&
        _connectedToken == token) {
      return;
    }

    disconnect();
    _connectedTenantId = tenantId;
    _connectedToken = token;
    _socket = io.io(
      '$_socketBase/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _socket?.emit('subscribe', {
          if (session.branchId != null) 'branchId': session.branchId,
        });
      })
      ..on('loan_application.submitted', (data) => _dispatch(
            'loan_application.submitted',
            data,
          ))
      ..on('loan_application.updated', (data) => _dispatch(
            'loan_application.updated',
            data,
          ))
      ..on('loan_application.media_uploaded', (data) => _dispatch(
            'loan_application.media_uploaded',
            data,
          ))
      ..on('payment.made', (data) => _dispatch('payment.made', data))
      ..connect();
  }

  void on(String event, RealtimeHandler handler) {
    _handlers.putIfAbsent(event, () => []).add(handler);
  }

  void off(String event, RealtimeHandler handler) {
    _handlers[event]?.remove(handler);
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connectedTenantId = null;
    _connectedToken = null;
  }

  void _dispatch(String event, dynamic data) {
    final payload = data is Map
        ? Map<String, dynamic>.from(data)
        : <String, dynamic>{};
    for (final handler in _handlers[event] ?? const []) {
      handler(payload);
    }
  }
}
