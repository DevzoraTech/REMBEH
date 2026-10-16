import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../database/models/pending_operation.dart';
import '../../services/session_store.dart';
import 'branch_relay_crypto.dart';
import 'branch_relay_models.dart';
import 'branch_relay_repository.dart';

class BranchRelayService {
  BranchRelayService({
    BranchRelayRepository? repository,
    FlutterSecureStorage? secureStorage,
  }) : _repository = repository ?? BranchRelayRepository(),
       _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final BranchRelayRepository _repository;
  final FlutterSecureStorage _secureStorage;
  final Uuid _uuid = const Uuid();
  HttpServer? _server;

  static const _deviceIdKey = 'branch_relay.device_id';

  bool get isHosting => _server != null;

  Future<BranchRelaySession?> activeClientSession(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return null;
    return _repository.activeClientSession(
      tenantId: tenantId,
      branchId: branchId,
    );
  }

  Future<void> endClientRelay(String sessionId) =>
      _repository.endClientSession(sessionId);

  Future<BranchRelayQrPayload> startManagerRelay(RembehSession session) async {
    if (!session.canUseBranchWorkspace ||
        session.tenantId == null ||
        session.branchId == null ||
        session.userId == null) {
      throw StateError(
        'Only a signed-in branch manager can start branch sharing.',
      );
    }
    await stopManagerRelay();

    final server = await HttpServer.bind(InternetAddress.anyIPv4, 0);
    final now = DateTime.now().toUtc();
    // Pairing codes are intentionally short-lived, but once an officer has
    // joined, the manager must remain able to receive the officer's work for
    // the rest of the working day. These are separate lifetimes.
    final qrExpiresAt = now.add(const Duration(minutes: 10));
    final relayExpiresAt = now.add(const Duration(hours: 24));
    final sessionId = _uuid.v4();
    final secret = BranchRelayCrypto.randomKey();
    final address = await _bestLocalAddress();
    final endpoint = 'http://${address.address}:${server.port}';
    final relaySession = BranchRelaySession(
      sessionId: sessionId,
      tenantId: session.tenantId!,
      branchId: session.branchId!,
      hostUserId: session.userId!,
      hostName: session.userName,
      role: 'HOST',
      endpoint: endpoint,
      createdAt: now,
      expiresAt: relayExpiresAt,
      status: 'PAIRING',
    );
    await _repository.saveSession(relaySession);
    await _secureStorage.write(key: _secretKey(sessionId), value: secret);
    _server = server;
    unawaited(_listen(server, relaySession));

    return BranchRelayQrPayload(
      version: 1,
      sessionId: sessionId,
      tenantId: session.tenantId!,
      branchId: session.branchId!,
      endpoint: endpoint,
      secret: secret,
      expiresAt: qrExpiresAt,
    );
  }

  Future<void> stopManagerRelay() async {
    final server = _server;
    _server = null;
    await server?.close(force: true);
  }

  Future<void> joinRelay({
    required BranchRelayQrPayload payload,
    required RembehSession session,
  }) async {
    if (payload.isExpired) {
      throw StateError(
        'This branch sharing code has expired. Ask the manager for a new code.',
      );
    }
    if (payload.tenantId != session.tenantId ||
        payload.branchId != session.branchId) {
      throw StateError('This code belongs to a different branch.');
    }
    final response = await http
        .get(Uri.parse('${payload.endpoint}/v1/health'))
        .timeout(const Duration(seconds: 8));
    if (response.statusCode != HttpStatus.ok) {
      throw StateError('Could not reach the manager on this Wi-Fi network.');
    }
    final now = DateTime.now().toUtc();
    // The QR proves the manager was present at pairing time and stays valid
    // for only ten minutes. The officer's relay policy intentionally lasts
    // through the working day so later cellular coverage cannot upload a
    // partial branch view straight to the server.
    final workdayExpiry = now.add(const Duration(hours: 24));
    await _repository.endActiveClientSessions(
      tenantId: payload.tenantId,
      branchId: payload.branchId,
    );
    await _repository.saveSession(
      BranchRelaySession(
        sessionId: payload.sessionId,
        tenantId: payload.tenantId,
        branchId: payload.branchId,
        hostUserId: '',
        hostName: 'Branch manager',
        role: 'CLIENT',
        endpoint: payload.endpoint,
        createdAt: now,
        expiresAt: workdayExpiry,
        pairedAt: now,
        lastActivityAt: now,
        status: 'PAIRED',
      ),
    );
    await _secureStorage.write(
      key: _secretKey(payload.sessionId),
      value: payload.secret,
    );
  }

  /// Downloads the manager's branch snapshot in small independently
  /// acknowledged pages. A network interruption simply repeats the current
  /// page; already committed pages are skipped on the next attempt.
  Future<RelaySnapshotResult> downloadBranchSnapshot({
    required String sessionId,
    required RembehSession session,
    void Function(int received, int total)? onProgress,
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    if (relaySession == null ||
        relaySession.endpoint == null ||
        secret == null) {
      throw StateError('Branch sharing is not paired on this device.');
    }
    if (tenantId == null || branchId == null || relaySession.isExpired) {
      throw StateError('This sharing session has expired. Scan a new code.');
    }

    final manifest = await _signedGet(
      endpoint: relaySession.endpoint!,
      sessionId: sessionId,
      secret: secret,
      path: '/v1/snapshot/manifest',
    );
    final clearManifest = await BranchRelayCrypto.open(
      secret: secret,
      envelope: manifest,
    );
    final counts = Map<String, dynamic>.from(clearManifest['counts'] as Map);
    final total = counts.values.fold<int>(
      0,
      (sum, value) => sum + (value as num).toInt(),
    );
    var received = 0;
    const pageSize = 100;
    for (final table in BranchRelayRepository.snapshotTables) {
      final count = (counts[table] as num?)?.toInt() ?? 0;
      for (var offset = 0; offset < count; offset += pageSize) {
        final contentId = 'snapshot:$table:$offset';
        final transfer = await _repository.startOrResumeTransfer(
          sessionId: sessionId,
          direction: 'INBOUND',
          contentType: 'SNAPSHOT_PAGE',
          contentId: contentId,
          totalBytes: 0,
          sha256: '',
          transferId: _uuid.v4(),
        );
        final expectedRows = (count - offset).clamp(0, pageSize).toInt();
        if (transfer.complete &&
            await _repository.hasStagedSnapshotPage(
              sessionId: sessionId,
              table: table,
              offset: offset,
              expectedRows: expectedRows,
            )) {
          received += expectedRows;
          onProgress?.call(received, total);
          continue;
        }
        final path =
            '/v1/snapshot/page?table=${Uri.encodeQueryComponent(table)}&offset=$offset&limit=$pageSize';
        final envelope = await _signedGet(
          endpoint: relaySession.endpoint!,
          sessionId: sessionId,
          secret: secret,
          path: path,
        );
        final clear = await BranchRelayCrypto.open(
          secret: secret,
          envelope: envelope,
        );
        final rows = (clear['rows'] as List)
            .map((row) => Map<String, dynamic>.from(row as Map))
            .toList();
        await _repository.stageSnapshotPage(
          sessionId: sessionId,
          table: table,
          offset: offset,
          rows: rows,
        );
        await _repository.acknowledgeTransfer(
          transferId: transfer.transferId,
          acknowledgedBytes: utf8.encode(jsonEncode(rows)).length,
          completed: true,
        );
        received += rows.length;
        onProgress?.call(received, total);
      }
    }
    await _repository.activateStagedSnapshot(
      sessionId: sessionId,
      tenantId: tenantId,
      branchId: branchId,
    );
    return RelaySnapshotResult(received: received, total: total);
  }

  /// Sends only unsynced branch events. Each batch is encrypted, signed and
  /// acknowledged separately; retrying the same batch is safe and resumes at
  /// the last confirmed batch after a connection interruption.
  Future<RelayPushResult> sendPendingToManager({
    required String sessionId,
    required RembehSession session,
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    if (relaySession == null || relaySession.endpoint == null) {
      throw StateError('Branch sharing is not paired on this device.');
    }
    if (relaySession.isExpired) {
      throw StateError('Branch sharing has expired. Scan a new code.');
    }
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    if (secret == null) {
      throw StateError('Branch sharing key is unavailable. Scan again.');
    }
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    final userId = session.userId;
    if (tenantId == null || branchId == null || userId == null) {
      throw StateError('Your branch identity is unavailable.');
    }

    final operations = await _repository.pendingForBranch(
      tenantId: tenantId,
      branchId: branchId,
    );
    if (operations.isEmpty) {
      return const RelayPushResult(sent: 0, acknowledged: 0);
    }

    final deviceId = await _deviceId();
    var acknowledged = 0;
    for (var offset = 0; offset < operations.length; offset += 20) {
      final batch = operations.skip(offset).take(20).toList();
      final events = batch
          .map(
            (operation) => _eventFromOperation(
              operation: operation,
              sessionId: sessionId,
              actorUserId: operation.userId ?? userId,
              tenantId: tenantId,
              branchId: branchId,
              deviceId: deviceId,
            ),
          )
          .toList();
      final body = jsonEncode(
        await BranchRelayCrypto.seal(
          secret: secret,
          payload: {'events': events.map((event) => event.toWire()).toList()},
        ),
      );
      final transfer = await _repository.startOrResumeTransfer(
        sessionId: sessionId,
        direction: 'OUTBOUND',
        contentType: 'EVENT_BATCH',
        contentId: BranchRelayCrypto.digest(
          events.map((e) => e.eventId).join(','),
        ),
        totalBytes: utf8.encode(body).length,
        sha256: BranchRelayCrypto.digest(body),
        transferId: _uuid.v4(),
      );
      if (transfer.complete) {
        acknowledged += events.length;
        continue;
      }

      final timestamp = DateTime.now().toUtc().toIso8601String();
      final path = '/v1/events';
      final response = await http
          .post(
            Uri.parse('${relaySession.endpoint}$path'),
            headers: {
              'Content-Type': 'application/json',
              'X-Rembeh-Relay-Session': sessionId,
              'X-Rembeh-Relay-Timestamp': timestamp,
              'X-Rembeh-Relay-Signature': BranchRelayCrypto.sign(
                secret: secret,
                method: 'POST',
                path: path,
                timestamp: timestamp,
                body: body,
              ),
            },
            body: body,
          )
          .timeout(const Duration(seconds: 30));
      if (response.statusCode != HttpStatus.ok) {
        throw StateError(
          'The manager did not accept this batch. Keep both devices connected and retry.',
        );
      }
      final result = Map<String, dynamic>.from(
        jsonDecode(response.body) as Map,
      );
      final count = (result['acknowledged'] as num?)?.toInt() ?? 0;
      acknowledged += count;
      await _repository.acknowledgeTransfer(
        transferId: transfer.transferId,
        acknowledgedBytes: utf8.encode(body).length,
        completed: true,
      );
      // The manager has durably queued these events. Marking them as relayed
      // prevents a later direct internet sync from creating a duplicate.
      for (final operation in batch) {
        if (operation.id != null) {
          await _repository.markOperationRelayed(operation.id!);
        }
      }
    }
    return RelayPushResult(sent: operations.length, acknowledged: acknowledged);
  }

  Future<void> _listen(HttpServer server, BranchRelaySession session) async {
    await for (final request in server) {
      unawaited(_handleRequest(request, session));
    }
  }

  Future<void> _handleRequest(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
    try {
      if (request.uri.path == '/v1/health' && request.method == 'GET') {
        await _writeJson(request.response, HttpStatus.ok, {'status': 'ready'});
        return;
      }
      if (request.uri.path == '/v1/snapshot/manifest' &&
          request.method == 'GET') {
        await _handleSnapshotManifest(request, session);
        return;
      }
      if (request.uri.path == '/v1/snapshot/page' && request.method == 'GET') {
        await _handleSnapshotPage(request, session);
        return;
      }
      if (request.uri.path != '/v1/events' || request.method != 'POST') {
        await _writeJson(request.response, HttpStatus.notFound, {
          'message': 'Not found',
        });
        return;
      }
      final body = await utf8.decoder.bind(request).join();
      final secret = await _secureStorage.read(
        key: _secretKey(session.sessionId),
      );
      if (secret == null || !_authorised(request, secret, body, session)) {
        await _writeJson(request.response, HttpStatus.unauthorized, {
          'message': 'Pairing is invalid or expired',
        });
        return;
      }
      final envelope = Map<String, dynamic>.from(jsonDecode(body) as Map);
      final clear = await BranchRelayCrypto.open(
        secret: secret,
        envelope: envelope,
      );
      final rows = clear['events'];
      if (rows is! List) throw const FormatException('Events are required.');
      var accepted = 0;
      for (final row in rows) {
        final event = BranchRelayEvent.fromWire(
          sessionId: session.sessionId,
          json: Map<String, dynamic>.from(row as Map),
        );
        _validateEventScope(event, session);
        if (BranchRelayCrypto.digest(jsonEncode(event.payload)) !=
            event.payloadHash) {
          throw const FormatException('Event integrity check failed.');
        }
        if (await _repository.receiveEvent(event)) accepted++;
      }
      await _writeJson(request.response, HttpStatus.ok, {
        'acknowledged': rows.length,
        'newEvents': accepted,
      });
    } catch (_) {
      await _writeJson(request.response, HttpStatus.badRequest, {
        'message': 'Transfer could not be processed',
      });
    }
  }

  Future<void> _handleSnapshotManifest(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
    final secret = await _secureStorage.read(
      key: _secretKey(session.sessionId),
    );
    if (secret == null || !_authorised(request, secret, '', session)) {
      await _writeJson(request.response, HttpStatus.unauthorized, {
        'message': 'Pairing is invalid or expired',
      });
      return;
    }
    final counts = await _repository.snapshotManifest(
      tenantId: session.tenantId,
      branchId: session.branchId,
    );
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: {
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'counts': counts,
      },
    );
    await _writeJson(request.response, HttpStatus.ok, envelope);
  }

  Future<void> _handleSnapshotPage(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
    final secret = await _secureStorage.read(
      key: _secretKey(session.sessionId),
    );
    if (secret == null || !_authorised(request, secret, '', session)) {
      await _writeJson(request.response, HttpStatus.unauthorized, {
        'message': 'Pairing is invalid or expired',
      });
      return;
    }
    final table = request.uri.queryParameters['table'] ?? '';
    final offset =
        int.tryParse(request.uri.queryParameters['offset'] ?? '') ?? -1;
    final requestedLimit =
        int.tryParse(request.uri.queryParameters['limit'] ?? '') ?? 0;
    if (!BranchRelayRepository.snapshotTables.contains(table) ||
        offset < 0 ||
        requestedLimit < 1) {
      await _writeJson(request.response, HttpStatus.badRequest, {
        'message': 'Invalid snapshot page',
      });
      return;
    }
    final rows = await _repository.snapshotPage(
      table: table,
      tenantId: session.tenantId,
      branchId: session.branchId,
      offset: offset,
      limit: requestedLimit.clamp(1, 100),
    );
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: {'table': table, 'offset': offset, 'rows': rows},
    );
    await _writeJson(request.response, HttpStatus.ok, envelope);
  }

  bool _authorised(
    HttpRequest request,
    String secret,
    String body,
    BranchRelaySession session,
  ) {
    final sessionId = request.headers.value('X-Rembeh-Relay-Session');
    final timestamp = request.headers.value('X-Rembeh-Relay-Timestamp');
    final signature = request.headers.value('X-Rembeh-Relay-Signature');
    if (sessionId != session.sessionId ||
        timestamp == null ||
        signature == null ||
        session.isExpired) {
      return false;
    }
    final issued = DateTime.tryParse(timestamp)?.toUtc();
    if (issued == null ||
        DateTime.now().toUtc().difference(issued).abs() >
            const Duration(minutes: 5)) {
      return false;
    }
    return BranchRelayCrypto.validSignature(
      provided: signature,
      expected: BranchRelayCrypto.sign(
        secret: secret,
        method: request.method,
        path: _requestPath(request),
        timestamp: timestamp,
        body: body,
      ),
    );
  }

  String _requestPath(HttpRequest request) => request.uri.hasQuery
      ? '${request.uri.path}?${request.uri.query}'
      : request.uri.path;

  Future<Map<String, dynamic>> _signedGet({
    required String endpoint,
    required String sessionId,
    required String secret,
    required String path,
  }) async {
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final response = await http
        .get(
          Uri.parse('$endpoint$path'),
          headers: {
            'X-Rembeh-Relay-Session': sessionId,
            'X-Rembeh-Relay-Timestamp': timestamp,
            'X-Rembeh-Relay-Signature': BranchRelayCrypto.sign(
              secret: secret,
              method: 'GET',
              path: path,
              timestamp: timestamp,
              body: '',
            ),
          },
        )
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != HttpStatus.ok) {
      throw StateError(
        'Could not continue the branch download. Keep both devices connected and retry.',
      );
    }
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }

  void _validateEventScope(BranchRelayEvent event, BranchRelaySession session) {
    if (event.tenantId != session.tenantId ||
        event.branchId != session.branchId) {
      throw const FormatException('Event belongs to a different branch.');
    }
    if (event.occurredAt.isAfter(
      DateTime.now().toUtc().add(const Duration(minutes: 5)),
    )) {
      throw const FormatException('Event time cannot be in the future.');
    }
  }

  BranchRelayEvent _eventFromOperation({
    required PendingOperation operation,
    required String sessionId,
    required String actorUserId,
    required String tenantId,
    required String branchId,
    required String deviceId,
  }) {
    final payload = Map<String, dynamic>.from(
      jsonDecode(operation.payload) as Map,
    );
    return BranchRelayEvent(
      eventId: _uuid.v5(
        Namespace.url.value,
        '$deviceId:${operation.operationType}:${operation.localEntityId}',
      ),
      sessionId: sessionId,
      tenantId: tenantId,
      branchId: branchId,
      actorUserId: actorUserId,
      operationType: operation.operationType,
      localEntityId: operation.localEntityId,
      occurredAt: operation.createdAt.toUtc(),
      payload: payload,
      payloadHash: BranchRelayCrypto.digest(jsonEncode(payload)),
      sourceDeviceId: deviceId,
      status: 'OUTBOUND',
    );
  }

  Future<String> _deviceId() async {
    final current = await _secureStorage.read(key: _deviceIdKey);
    if (current != null && current.isNotEmpty) return current;
    final generated = _uuid.v4();
    await _secureStorage.write(key: _deviceIdKey, value: generated);
    return generated;
  }

  Future<InternetAddress> _bestLocalAddress() async {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    for (final interface in interfaces) {
      for (final address in interface.addresses) {
        if (!address.isLoopback && !address.isLinkLocal) return address;
      }
    }
    throw StateError(
      'No local Wi-Fi address is available. Connect to the branch hotspot first.',
    );
  }

  Future<void> _writeJson(
    HttpResponse response,
    int status,
    Map<String, dynamic> body,
  ) async {
    response.statusCode = status;
    response.headers.contentType = ContentType.json;
    response.write(jsonEncode(body));
    await response.close();
  }

  String _secretKey(String sessionId) => 'branch_relay.session.$sessionId';
}

class RelayPushResult {
  const RelayPushResult({required this.sent, required this.acknowledged});

  final int sent;
  final int acknowledged;
}

class RelaySnapshotResult {
  const RelaySnapshotResult({required this.received, required this.total});

  final int received;
  final int total;
}
