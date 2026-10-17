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
  final Map<String, BranchRelayParticipant> _participants = {};
  final Map<String, String> _collectionControls = {};
  final Map<String, _DistributionControl> _distributionControls = {};
  final _participantsController =
      StreamController<List<BranchRelayParticipant>>.broadcast();
  HttpServer? _server;

  static const _deviceIdKey = 'branch_relay.device_id';

  bool get isHosting => _server != null;

  /// Live, local-network-only receiver status for the manager workspace.
  Stream<List<BranchRelayParticipant>> get participantsStream =>
      _participantsController.stream;

  List<BranchRelayParticipant> get participants =>
      _participants.values.toList()
        ..sort((left, right) => right.updatedAt.compareTo(left.updatedAt));

  Future<BranchRelayDistribution?> currentDistribution(
    RembehSession session,
  ) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return null;
    return _repository.latestDistribution(
      tenantId: tenantId,
      branchId: branchId,
    );
  }

  Future<String?> appliedDistributionId(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return null;
    return _repository.appliedDistributionId(
      tenantId: tenantId,
      branchId: branchId,
    );
  }

  Future<String?> appliedDistributionVersion(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return null;
    return _repository.appliedDistributionVersion(
      tenantId: tenantId,
      branchId: branchId,
    );
  }

  Future<List<BranchRelayDistributionOffer>> distributionOffers(
    BranchRelayDistribution distribution,
  ) => _repository.distributionOffers(distribution.distributionId);

  Future<Map<String, int>> pendingRecordCounts(RembehSession session) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return const {};
    final pending = await _repository.pendingForBranch(
      tenantId: tenantId,
      branchId: branchId,
    );
    var repayments = 0;
    var expenses = 0;
    var applications = 0;
    for (final operation in pending) {
      switch (operation.operationType) {
        case OperationType.paymentCreate:
        case OperationType.collectionCreate:
          repayments++;
        case OperationType.loanApplicationCreate:
        case OperationType.loanDisbursementCreate:
          applications++;
        default:
          if (operation.operationType.contains('EXPENSE')) expenses++;
      }
    }
    return {
      'repayments': repayments,
      'expenses': expenses,
      'applications': applications,
    };
  }

  Future<List<BranchRelayCollectionOfficer>> collectionOfficers({
    required RembehSession session,
    required String sessionId,
  }) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return const [];
    final receivedNames = _participants.values
        .where(
          (participant) =>
              participant.phase == 'Work received by manager' ||
              participant.phase == 'Ready for field work',
        )
        .map((participant) => participant.name);
    final participantStatuses = <String, String>{
      for (final participant in _participants.values)
        participant.name.trim().toLowerCase(): switch (participant.phase) {
          'Ready to receive' => 'READY',
          'Receiving records' => 'RECEIVING',
          'Work received by manager' => 'RECEIVED',
          _ => 'WAITING',
        },
    };
    return _repository.collectionOfficers(
      sessionId: sessionId,
      tenantId: tenantId,
      branchId: branchId,
      receivedOfficerNames: receivedNames,
      participantStatusByName: participantStatuses,
    );
  }

  Future<List<BranchRelayEvent>> receivedRecords({
    required RembehSession session,
    required BranchRelayParticipant participant,
  }) async {
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return const [];
    return _repository.receivedEvents(
      tenantId: tenantId,
      branchId: branchId,
      sourceDeviceId: participant.deviceId,
    );
  }

  Future<void> skipCollectionOfficer({
    required String sessionId,
    required String agentId,
  }) => _repository.setCollectionOfficerStatus(
    sessionId: sessionId,
    agentId: agentId,
    status: 'SKIPPED',
  );

  Future<void> receiveCollection(BranchRelayCollectionOfficer officer) async {
    final matches = _participants.values.where(
      (item) =>
          item.name.trim().toLowerCase() == officer.name.trim().toLowerCase(),
    );
    final participant = matches.isEmpty ? null : matches.first;
    if (participant == null) {
      throw StateError('This field officer has not requested to send records.');
    }
    _collectionControls[participant.deviceId] = 'RECEIVING';
    _participants[participant.deviceId] = BranchRelayParticipant(
      deviceId: participant.deviceId,
      userId: participant.userId,
      name: participant.name,
      role: participant.role,
      phase: 'Receiving records',
      received: participant.received,
      total: participant.total,
      updatedAt: DateTime.now(),
    );
    _emitParticipants();
  }

  void stopReceivingCollection(BranchRelayParticipant participant) {
    _collectionControls[participant.deviceId] = 'STOPPED';
    _participants[participant.deviceId] = BranchRelayParticipant(
      deviceId: participant.deviceId,
      userId: participant.userId,
      name: participant.name,
      role: participant.role,
      phase: 'Transfer stopped',
      received: participant.received,
      total: participant.total,
      updatedAt: DateTime.now(),
    );
    _emitParticipants();
  }

  /// Freezes the consolidated manager branch. Distribution uses the saved
  /// package, never the manager's changing live rows, so every officer gets
  /// the same cutoff even if new work is recorded during transfer.
  Future<BranchRelayDistribution> prepareDistribution(
    RembehSession session,
  ) async {
    if (!session.canUseBranchWorkspace ||
        session.tenantId == null ||
        session.branchId == null ||
        session.userId == null) {
      throw StateError('Only a branch manager can prepare a distribution.');
    }
    return _repository.prepareDistribution(
      distributionId: _uuid.v4(),
      tenantId: session.tenantId!,
      branchId: session.branchId!,
      userId: session.userId!,
      cutoffAt: DateTime.now().toUtc(),
    );
  }

  /// Makes one frozen distribution available to a specific paired officer.
  /// The officer must explicitly accept it before pages can be downloaded.
  Future<void> offerDistribution({
    required BranchRelayParticipant participant,
    required BranchRelayDistribution distribution,
  }) async {
    if (_server == null) {
      throw StateError('Keep branch sharing open before sending an update.');
    }
    await _repository.offerDistribution(
      distributionId: distribution.distributionId,
      deviceId: participant.deviceId,
      officerUserId: participant.userId,
      officerName: participant.name,
    );
    _distributionControls[participant.deviceId] = _DistributionControl(
      distributionId: distribution.distributionId,
      status: _DistributionStatus.offered,
    );
    _updateParticipant(participant, phase: 'Waiting for officer to accept');
  }

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

    final server = await HttpServer.bind(
      InternetAddress.anyIPv4,
      0,
      shared: true,
    );
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
    _participants.clear();
    _collectionControls.clear();
    _distributionControls.clear();
    _emitParticipants();
    await server?.close(force: true);
  }

  /// Sends non-financial transfer progress to the manager. Snapshot rows and
  /// work events continue to use their own authenticated transfer endpoints.
  Future<void> reportParticipantProgress({
    required String sessionId,
    required RembehSession session,
    required String phase,
    required int received,
    required int total,
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    if (relaySession?.endpoint == null || secret == null) return;
    final deviceId = await _deviceId();
    final payload = {
      'deviceId': deviceId,
      'userId': session.userId,
      'name': session.userName,
      'role': session.roleName ?? 'Field officer',
      'phase': phase,
      'received': received,
      'total': total,
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: payload,
    );
    final timestamp = DateTime.now().toUtc().toIso8601String();
    try {
      await http
          .post(
            Uri.parse('${relaySession!.endpoint}/v1/participants'),
            headers: {
              HttpHeaders.contentTypeHeader: ContentType.json.mimeType,
              'X-Rembeh-Relay-Session': sessionId,
              'X-Rembeh-Relay-Timestamp': timestamp,
              'X-Rembeh-Relay-Signature': BranchRelayCrypto.sign(
                secret: secret,
                method: 'POST',
                path: '/v1/participants',
                timestamp: timestamp,
                body: jsonEncode(envelope),
              ),
            },
            body: jsonEncode(envelope),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      // Telemetry never blocks the resumable data transfer.
    }
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
    http.Response response;
    try {
      response = await http
          .get(Uri.parse('${payload.endpoint}/v1/health'))
          .timeout(const Duration(seconds: 8));
    } on SocketException {
      throw StateError(
        'Could not reach the manager device. Keep the manager sharing screen open, confirm both devices use the same hotspot or Wi-Fi, then create and scan a new code.',
      );
    } on TimeoutException {
      throw StateError(
        'The manager device did not respond in time. Keep both devices connected to the same hotspot and try again.',
      );
    }
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

  /// Returns an update only when the manager has offered it to this device.
  Future<Map<String, dynamic>?> availableDistribution({
    required String sessionId,
    required RembehSession session,
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (relaySession?.endpoint == null ||
        secret == null ||
        tenantId == null ||
        branchId == null) {
      throw StateError('Branch sharing is not paired on this device.');
    }
    final deviceId = await _deviceId();
    final base = await _repository.appliedDistributionId(
      tenantId: tenantId,
      branchId: branchId,
    );
    final envelope = await _signedGet(
      endpoint: relaySession!.endpoint!,
      sessionId: sessionId,
      secret: secret,
      path:
          '/v1/distribution/manifest?base=${Uri.encodeQueryComponent(base ?? '')}&device=${Uri.encodeQueryComponent(deviceId)}',
    );
    final clear = await BranchRelayCrypto.open(
      secret: secret,
      envelope: envelope,
    );
    return clear['available'] == true ? clear : null;
  }

  Future<void> acceptDistribution({
    required String sessionId,
    required String distributionId,
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    if (relaySession?.endpoint == null || secret == null) {
      throw StateError('Branch sharing is not paired on this device.');
    }
    final body = jsonEncode(
      await BranchRelayCrypto.seal(
        secret: secret,
        payload: {
          'deviceId': await _deviceId(),
          'distributionId': distributionId,
        },
      ),
    );
    await _signedPost(
      endpoint: relaySession!.endpoint!,
      sessionId: sessionId,
      secret: secret,
      path: '/v1/distribution/accept',
      body: body,
    );
  }

  /// Downloads the manager's branch snapshot in small independently
  /// acknowledged pages. A network interruption simply repeats the current
  /// page; already committed pages are skipped on the next attempt.
  Future<RelaySnapshotResult> downloadBranchSnapshot({
    required String sessionId,
    required RembehSession session,
    void Function(int received, int total)? onProgress,
    bool Function()? shouldCancel,
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

    final appliedDistributionId = await _repository.appliedDistributionId(
      tenantId: tenantId,
      branchId: branchId,
    );
    final deviceId = await _deviceId();
    final distribution = await _signedGet(
      endpoint: relaySession.endpoint!,
      sessionId: sessionId,
      secret: secret,
      path:
          '/v1/distribution/manifest?base=${Uri.encodeQueryComponent(appliedDistributionId ?? '')}&device=${Uri.encodeQueryComponent(deviceId)}',
    );
    final clearDistribution = await BranchRelayCrypto.open(
      secret: secret,
      envelope: distribution,
    );
    if (clearDistribution['available'] == true) {
      return _downloadDistribution(
        relaySession: relaySession,
        session: session,
        secret: secret,
        distribution: clearDistribution,
        onProgress: onProgress,
        shouldCancel: shouldCancel,
        deviceId: deviceId,
      );
    }
    throw StateError('No manager update is waiting for this device.');
  }

  Future<RelaySnapshotResult> _downloadDistribution({
    required BranchRelaySession relaySession,
    required RembehSession session,
    required String secret,
    required Map<String, dynamic> distribution,
    void Function(int received, int total)? onProgress,
    bool Function()? shouldCancel,
    required String deviceId,
  }) async {
    final tenantId = session.tenantId!;
    final branchId = session.branchId!;
    final sessionId = relaySession.sessionId;
    final distributionId = distribution['distributionId'] as String;
    final full = distribution['full'] == true;
    final counts = Map<String, dynamic>.from(distribution['counts'] as Map);
    final total = counts.values.fold<int>(
      0,
      (sum, value) => sum + (value as num).toInt(),
    );
    var received = 0;
    const pageSize = 100;
    for (final table in BranchRelayRepository.snapshotTables) {
      final count = (counts[table] as num?)?.toInt() ?? 0;
      for (var offset = 0; offset < count; offset += pageSize) {
        if (shouldCancel?.call() ?? false) {
          throw StateError('Update paused. Keep the connection to resume it.');
        }
        final expectedRows = (count - offset).clamp(0, pageSize).toInt();
        final contentId = 'distribution:$distributionId:$table:$offset';
        final transfer = await _repository.startOrResumeTransfer(
          sessionId: sessionId,
          direction: 'INBOUND',
          contentType: 'DISTRIBUTION_PAGE',
          contentId: contentId,
          totalBytes: 0,
          sha256: '',
          transferId: _uuid.v4(),
        );
        if (transfer.complete &&
            await _repository.hasStagedDistributionPage(
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
            '/v1/distribution/page?distribution=${Uri.encodeQueryComponent(distributionId)}&table=${Uri.encodeQueryComponent(table)}&mode=${full ? 'full' : 'delta'}&offset=$offset&limit=$pageSize&device=${Uri.encodeQueryComponent(deviceId)}';
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
        await _repository.stageDistributionPage(
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
    await _repository.activateStagedDistribution(
      sessionId: sessionId,
      distributionId: distributionId,
      tenantId: tenantId,
      branchId: branchId,
      full: full,
    );
    await _markDistributionComplete(
      relaySession: relaySession,
      secret: secret,
      distributionId: distributionId,
      deviceId: deviceId,
    );
    return RelaySnapshotResult(received: received, total: total);
  }

  Future<void> _markDistributionComplete({
    required BranchRelaySession relaySession,
    required String secret,
    required String distributionId,
    required String deviceId,
  }) async {
    final body = jsonEncode(
      await BranchRelayCrypto.seal(
        secret: secret,
        payload: {'deviceId': deviceId, 'distributionId': distributionId},
      ),
    );
    await _signedPost(
      endpoint: relaySession.endpoint!,
      sessionId: relaySession.sessionId,
      secret: secret,
      path: '/v1/distribution/complete',
      body: body,
    );
  }

  /// Sends only unsynced branch events. Each batch is encrypted, signed and
  /// acknowledged separately; retrying the same batch is safe and resumes at
  /// the last confirmed batch after a connection interruption.
  Future<RelayPushResult> sendPendingToManager({
    required String sessionId,
    required RembehSession session,
    void Function(int sent, int total)? onProgress,
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
      onProgress?.call(0, 0);
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
        onProgress?.call(acknowledged, operations.length);
        continue;
      }

      final timestamp = DateTime.now().toUtc().toIso8601String();
      final path = '/v1/events';
      final permission = await _collectionPermission(
        relaySession: relaySession,
        secret: secret,
        sessionId: sessionId,
        deviceId: deviceId,
      );
      if (permission != 'RECEIVING') {
        throw StateError(
          permission == 'STOPPED'
              ? 'The manager stopped this transfer. Records already received are safe; retry the remaining records later.'
              : 'Waiting for the manager to accept your records.',
        );
      }
      final response = await http
          .post(
            Uri.parse('${relaySession.endpoint}$path'),
            headers: {
              'Content-Type': 'application/json',
              'X-Rembeh-Relay-Session': sessionId,
              'X-Rembeh-Relay-Device': deviceId,
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
      onProgress?.call(acknowledged, operations.length);
    }
    return RelayPushResult(sent: operations.length, acknowledged: acknowledged);
  }

  Future<void> waitForManagerAcceptance({
    required String sessionId,
    Duration timeout = const Duration(minutes: 10),
  }) async {
    final relaySession = await _repository.findSession(sessionId);
    final secret = await _secureStorage.read(key: _secretKey(sessionId));
    if (relaySession?.endpoint == null || secret == null) {
      throw StateError('Branch sharing is not paired on this device.');
    }
    final deviceId = await _deviceId();
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final status = await _collectionPermission(
        relaySession: relaySession!,
        secret: secret,
        sessionId: sessionId,
        deviceId: deviceId,
      );
      if (status == 'RECEIVING') return;
      if (status == 'STOPPED') {
        throw StateError(
          'The manager stopped this transfer. You can request again later.',
        );
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    throw StateError('The manager did not accept the request in time.');
  }

  Future<String> _collectionPermission({
    required BranchRelaySession relaySession,
    required String secret,
    required String sessionId,
    required String deviceId,
  }) async {
    const path = '/v1/collection/permission';
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final response = await http
        .get(
          Uri.parse(
            '${relaySession.endpoint}$path?device=${Uri.encodeQueryComponent(deviceId)}',
          ),
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
        .timeout(const Duration(seconds: 8));
    if (response.statusCode != HttpStatus.ok) return 'WAITING';
    final clear = await BranchRelayCrypto.open(
      secret: secret,
      envelope: Map<String, dynamic>.from(jsonDecode(response.body) as Map),
    );
    return clear['status'] as String? ?? 'WAITING';
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
      if (request.uri.path == '/v1/distribution/manifest' &&
          request.method == 'GET') {
        await _handleDistributionManifest(request, session);
        return;
      }
      if (request.uri.path == '/v1/distribution/page' &&
          request.method == 'GET') {
        await _handleDistributionPage(request, session);
        return;
      }
      if (request.uri.path == '/v1/distribution/accept' &&
          request.method == 'POST') {
        await _handleDistributionAcceptance(request, session);
        return;
      }
      if (request.uri.path == '/v1/distribution/complete' &&
          request.method == 'POST') {
        await _handleDistributionCompletion(request, session);
        return;
      }
      if (request.uri.path == '/v1/snapshot/page' && request.method == 'GET') {
        await _handleSnapshotPage(request, session);
        return;
      }
      if (request.uri.path == '/v1/participants' && request.method == 'POST') {
        await _handleParticipantStatus(request, session);
        return;
      }
      if (request.uri.path == '/v1/collection/permission' &&
          request.method == 'GET') {
        await _handleCollectionPermission(request, session);
        return;
      }
      if (request.uri.path != '/v1/events' || request.method != 'POST') {
        await _writeJson(request.response, HttpStatus.notFound, {
          'message': 'Not found',
        });
        return;
      }
      final deviceId = request.headers.value('X-Rembeh-Relay-Device') ?? '';
      if (_collectionControls[deviceId] != 'RECEIVING') {
        await _writeJson(request.response, HttpStatus.conflict, {
          'message': 'Waiting for the manager to accept this transfer',
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
      final participant = _participants[deviceId];
      if (participant != null) {
        final received = (participant.received + rows.length)
            .clamp(0, participant.total)
            .toInt();
        final complete = participant.total > 0 && received >= participant.total;
        _collectionControls[deviceId] = complete ? 'SUBMITTED' : 'RECEIVING';
        _participants[deviceId] = BranchRelayParticipant(
          deviceId: participant.deviceId,
          userId: participant.userId,
          name: participant.name,
          role: participant.role,
          phase: complete ? 'Work received by manager' : 'Receiving records',
          received: received,
          total: participant.total,
          updatedAt: DateTime.now(),
        );
        _emitParticipants();
      }
    } catch (_) {
      await _writeJson(request.response, HttpStatus.badRequest, {
        'message': 'Transfer could not be processed',
      });
    }
  }

  Future<void> _handleParticipantStatus(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
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
    final participant = BranchRelayParticipant.fromWire(clear);
    _participants[participant.deviceId] = participant;
    _emitParticipants();
    await _writeJson(request.response, HttpStatus.ok, {'received': true});
  }

  Future<void> _handleCollectionPermission(
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
    final deviceId = request.uri.queryParameters['device'] ?? '';
    final status = _collectionControls[deviceId] ?? 'WAITING';
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: {'status': status},
    );
    await _writeJson(request.response, HttpStatus.ok, envelope);
  }

  void _emitParticipants() => _participantsController.add(participants);

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

  Future<void> _handleDistributionManifest(
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
    final latest = await _repository.latestDistribution(
      tenantId: session.tenantId,
      branchId: session.branchId,
    );
    if (latest == null) {
      final envelope = await BranchRelayCrypto.seal(
        secret: secret,
        payload: {'available': false},
      );
      await _writeJson(request.response, HttpStatus.ok, envelope);
      return;
    }
    final deviceId = request.uri.queryParameters['device'] ?? '';
    final storedOffer = await _repository.distributionOffer(
      distributionId: latest.distributionId,
      deviceId: deviceId,
    );
    final control = _distributionControls[deviceId];
    if ((control == null || control.distributionId != latest.distributionId) &&
        storedOffer == null) {
      final envelope = await BranchRelayCrypto.seal(
        secret: secret,
        payload: {'available': false},
      );
      await _writeJson(request.response, HttpStatus.ok, envelope);
      return;
    }
    final base = request.uri.queryParameters['base'];
    final full =
        base == null || base.isEmpty || base != latest.previousDistributionId;
    final counts = await _repository.distributionManifest(
      distributionId: latest.distributionId,
      deltaOnly: !full,
    );
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: {
        'available': true,
        'distributionId': latest.distributionId,
        'versionLabel': latest.versionLabel,
        'full': full,
        'counts': counts,
        'status': control?.status.name ?? storedOffer!.status.toLowerCase(),
      },
    );
    await _writeJson(request.response, HttpStatus.ok, envelope);
  }

  Future<void> _handleDistributionPage(
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
    final distributionId = request.uri.queryParameters['distribution'] ?? '';
    final deviceId = request.uri.queryParameters['device'] ?? '';
    final table = request.uri.queryParameters['table'] ?? '';
    final offset =
        int.tryParse(request.uri.queryParameters['offset'] ?? '') ?? -1;
    final limit = int.tryParse(request.uri.queryParameters['limit'] ?? '') ?? 0;
    if (!BranchRelayRepository.snapshotTables.contains(table) ||
        offset < 0 ||
        limit < 1) {
      await _writeJson(request.response, HttpStatus.badRequest, {
        'message': 'Invalid distribution page',
      });
      return;
    }
    final latest = await _repository.latestDistribution(
      tenantId: session.tenantId,
      branchId: session.branchId,
    );
    if (latest?.distributionId != distributionId) {
      await _writeJson(request.response, HttpStatus.notFound, {
        'message': 'Distribution is unavailable',
      });
      return;
    }
    final storedOffer = await _repository.distributionOffer(
      distributionId: distributionId,
      deviceId: deviceId,
    );
    final control = _distributionControls[deviceId];
    final status = control?.status.name ?? storedOffer?.status.toLowerCase();
    if (((control == null || control.distributionId != distributionId) &&
            storedOffer == null) ||
        status == 'offered' ||
        status == 'OFFERED') {
      await _writeJson(request.response, HttpStatus.forbidden, {
        'message': 'Officer acceptance is required before transfer',
      });
      return;
    }
    _distributionControls[deviceId] = _DistributionControl(
      distributionId: distributionId,
      status: _DistributionStatus.sending,
    );
    await _repository.updateDistributionOfferStatus(
      distributionId: distributionId,
      deviceId: deviceId,
      status: 'SENDING',
    );
    final rows = await _repository.distributionPage(
      distributionId: distributionId,
      table: table,
      deltaOnly: request.uri.queryParameters['mode'] == 'delta',
      offset: offset,
      limit: limit.clamp(1, 100),
    );
    final envelope = await BranchRelayCrypto.seal(
      secret: secret,
      payload: {'rows': rows},
    );
    await _writeJson(request.response, HttpStatus.ok, envelope);
  }

  Future<void> _handleDistributionAcceptance(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
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
    final clear = await BranchRelayCrypto.open(
      secret: secret,
      envelope: Map<String, dynamic>.from(jsonDecode(body) as Map),
    );
    final deviceId = clear['deviceId'] as String? ?? '';
    final distributionId = clear['distributionId'] as String? ?? '';
    final storedOffer = await _repository.distributionOffer(
      distributionId: distributionId,
      deviceId: deviceId,
    );
    final control = _distributionControls[deviceId];
    if ((control == null || control.distributionId != distributionId) &&
        storedOffer == null) {
      await _writeJson(request.response, HttpStatus.notFound, {
        'message': 'This update is no longer available',
      });
      return;
    }
    _distributionControls[deviceId] = _DistributionControl(
      distributionId: distributionId,
      status: _DistributionStatus.accepted,
    );
    await _repository.updateDistributionOfferStatus(
      distributionId: distributionId,
      deviceId: deviceId,
      status: 'ACCEPTED',
    );
    final participant = _participants[deviceId];
    if (participant != null) {
      _updateParticipant(participant, phase: 'Officer accepted update');
    }
    await _writeJson(request.response, HttpStatus.ok, {'accepted': true});
  }

  Future<void> _handleDistributionCompletion(
    HttpRequest request,
    BranchRelaySession session,
  ) async {
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
    final clear = await BranchRelayCrypto.open(
      secret: secret,
      envelope: Map<String, dynamic>.from(jsonDecode(body) as Map),
    );
    final deviceId = clear['deviceId'] as String? ?? '';
    final distributionId = clear['distributionId'] as String? ?? '';
    final offer = await _repository.distributionOffer(
      distributionId: distributionId,
      deviceId: deviceId,
    );
    if (offer == null) {
      await _writeJson(request.response, HttpStatus.notFound, {
        'message': 'This update is no longer available',
      });
      return;
    }
    await _repository.updateDistributionOfferStatus(
      distributionId: distributionId,
      deviceId: deviceId,
      status: 'COMPLETED',
    );
    _distributionControls[deviceId] = _DistributionControl(
      distributionId: distributionId,
      status: _DistributionStatus.updated,
    );
    final participant = _participants[deviceId];
    if (participant != null) {
      _updateParticipant(participant, phase: 'Field work updated');
    }
    await _writeJson(request.response, HttpStatus.ok, {'completed': true});
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

  Future<void> _signedPost({
    required String endpoint,
    required String sessionId,
    required String secret,
    required String path,
    required String body,
  }) async {
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final response = await http
        .post(
          Uri.parse('$endpoint$path'),
          headers: {
            HttpHeaders.contentTypeHeader: ContentType.json.mimeType,
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
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != HttpStatus.ok) {
      throw StateError('The manager could not confirm this update. Try again.');
    }
  }

  void _updateParticipant(
    BranchRelayParticipant participant, {
    required String phase,
  }) {
    _participants[participant.deviceId] = BranchRelayParticipant(
      deviceId: participant.deviceId,
      userId: participant.userId,
      name: participant.name,
      role: participant.role,
      phase: phase,
      received: participant.received,
      total: participant.total,
      updatedAt: DateTime.now(),
    );
    _emitParticipants();
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
    final candidates = <({String name, InternetAddress address})>[];
    for (final interface in interfaces) {
      for (final address in interface.addresses) {
        if (!address.isLoopback && !address.isLinkLocal) {
          candidates.add((
            name: interface.name.toLowerCase(),
            address: address,
          ));
        }
      }
    }
    final private = candidates.where((candidate) {
      final parts = candidate.address.address
          .split('.')
          .map(int.tryParse)
          .toList();
      if (parts.length != 4 || parts.any((part) => part == null)) return false;
      return parts[0] == 10 ||
          (parts[0] == 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
          (parts[0] == 192 && parts[1] == 168);
    }).toList();
    const preferredNames = ['wlan', 'wifi', 'swlan', 'ap', 'en0'];
    final preferred = private.where(
      (candidate) => preferredNames.any(candidate.name.contains),
    );
    if (preferred.isNotEmpty) return preferred.first.address;
    if (private.isNotEmpty) return private.first.address;
    if (candidates.isNotEmpty) return candidates.first.address;
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

enum _DistributionStatus { offered, accepted, sending, updated }

class _DistributionControl {
  const _DistributionControl({
    required this.distributionId,
    required this.status,
  });

  final String distributionId;
  final _DistributionStatus status;
}
