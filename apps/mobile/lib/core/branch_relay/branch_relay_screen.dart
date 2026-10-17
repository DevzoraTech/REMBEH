import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../services/session_store.dart';
import '../../services/network_status_store.dart';
import '../../theme.dart';
import '../database/models/pending_operation.dart';
import '../database/local_database.dart';
import '../network/realtime_client.dart';
import 'branch_relay_crypto.dart';
import 'branch_relay_models.dart';
import 'branch_relay_service.dart';

/// Keep the manager screen in the foreground while hosting a local relay.
class BranchRelayScreen extends StatefulWidget {
  const BranchRelayScreen({super.key, required this.session, this.onUseLiveData, this.onDownloadBranchSnapshot});
  final RembehSession session;
  final Future<void> Function()? onUseLiveData;
  /// Must download and verify the full server branch snapshot, without overwriting pending local operations.
  final Future<void> Function()? onDownloadBranchSnapshot;

  @override
  State<BranchRelayScreen> createState() => _BranchRelayScreenState();
}

class _BranchRelayScreenState extends State<BranchRelayScreen> {
  final BranchRelayService _relay = BranchRelayService();
  BranchRelayQrPayload? _pairing;
  String? _pairedSessionId;
  String? _message;
  bool _working = false;
  bool? _serverReachable;
  bool _managerTransferApproved = false;
  bool _snapshotReady = false;
  bool _snapshotDownloading = false;
  bool _showPairingCode = false;
  bool _sendTab = true;
  bool _receivingUpdate = false;
  bool _stopDownloadRequested = false;
  int? _downloadedRows;
  int? _downloadTotal;
  int _sentRecords = 0;
  int _totalRecords = 0;
  String _sendPhase = 'Ready to send';
  String? _distributionVersion;
  Map<String, int> _pendingCounts = const {};
  Map<String, dynamic>? _availableDistribution;
  List<BranchRelayParticipant> _participants = const [];
  List<BranchRelayCollectionOfficer> _collectionOfficers = const [];
  List<BranchRelayDistributionOffer> _distributionOffers = const [];
  StreamSubscription<List<BranchRelayParticipant>>? _participantsSubscription;
  Timer? _distributionTimer;
  Timer? _officerTimer;

  bool get _canHost => widget.session.canUseBranchWorkspace;
  bool get _collectionReady =>
      _collectionOfficers.isNotEmpty &&
      _collectionOfficers.every((officer) => officer.isResolved);
  int get _pendingTotal =>
      _pendingCounts.values.fold<int>(0, (sum, count) => sum + count);

  @override
  void initState() {
    super.initState();
    if (_canHost) {
      _participantsSubscription = _relay.participantsStream.listen((items) {
        if (!mounted) return;
        setState(() => _participants = items);
        unawaited(_loadCollectionOfficers());
      });
    }
    unawaited(_restorePairedSession());
    unawaited(_checkLiveAvailability());
    unawaited(_loadSyncState());
    if (_canHost) unawaited(_restoreManagerSnapshotReadiness());
  }

  @override
  void dispose() {
    _participantsSubscription?.cancel();
    _distributionTimer?.cancel();
    _officerTimer?.cancel();
    if (_canHost) unawaited(_relay.stopManagerRelay());
    super.dispose();
  }

  Future<void> _loadSyncState() async {
    try {
      final counts = await _relay.pendingRecordCounts(widget.session);
      final distribution = _canHost
          ? await _relay.currentDistribution(widget.session)
          : null;
      final version = _canHost
          ? distribution?.versionLabel
          : await _relay.appliedDistributionVersion(widget.session);
      final offers = distribution == null
          ? <BranchRelayDistributionOffer>[]
          : await _relay.distributionOffers(distribution);
      if (!mounted) return;
      setState(() {
        _pendingCounts = counts;
        _distributionVersion = version;
        _distributionOffers = offers;
      });
    } catch (error) {
      _showError(error);
    }
  }

  Future<void> _refreshDistributionState() async {
    if (!_canHost || _pairing == null) return;
    try {
      final distribution = await _relay.currentDistribution(widget.session);
      final offers = distribution == null
          ? <BranchRelayDistributionOffer>[]
          : await _relay.distributionOffers(distribution);
      if (!mounted) return;
      setState(() {
        _distributionVersion = distribution?.versionLabel;
        _distributionOffers = offers;
      });
    } catch (_) {
      // Preserve the last verified local state during temporary disconnection.
    }
  }

  Future<void> _loadCollectionOfficers() async {
    final sessionId = _pairing?.sessionId;
    if (!_canHost || sessionId == null) return;
    try {
      final officers = await _relay.collectionOfficers(
        session: widget.session,
        sessionId: sessionId,
      );
      if (mounted) setState(() => _collectionOfficers = officers);
    } catch (_) {}
  }

  Future<void> _checkLiveAvailability() async {
    try {
      final online = await NetworkStatusStore.instance.checkNow();
      if (mounted) setState(() => _serverReachable = online);
    } catch (_) {
      if (mounted) setState(() => _serverReachable = false);
    }
  }

  Future<void> _restorePairedSession() async {
    if (_canHost) return;
    try {
      final session = await _relay.activeClientSession(widget.session);
      if (!mounted || session == null) return;
      setState(() => _pairedSessionId = session.sessionId);
      await _loadSyncState();
      await _checkAvailableDistribution();
      _startOfficerWatcher();
    } catch (_) {}
  }

  void _startManagerWatcher() {
    _distributionTimer?.cancel();
    _distributionTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      unawaited(_refreshDistributionState());
      unawaited(_loadCollectionOfficers());
    });
  }

  void _startOfficerWatcher() {
    _officerTimer?.cancel();
    _officerTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_pairedSessionId != null && !_receivingUpdate && !_working) {
        unawaited(_checkAvailableDistribution());
      }
    });
  }

  /// A previously verified branch snapshot can be used without internet.
  /// Never infer readiness from a snapshot belonging to another branch.
  Future<void> _restoreManagerSnapshotReadiness() async {
    final tenant = widget.session.tenantId;
    final branch = widget.session.branchId;
    if (tenant == null || tenant.isEmpty || branch == null || branch.isEmpty) return;
    try {
      final db = LocalDatabase.instance;
      final scope = await db.getSnapshotScope();
      final lastSync = await db.getLastSyncTimestamp();
      if (!mounted) return;
      setState(() => _snapshotReady = scope == '$tenant:$branch' && lastSync != null);
    } catch (_) {
      // Do not enable sharing without verified local metadata.
    }
  }

  Future<void> _downloadManagerSnapshot() async {
    if (_working || widget.onDownloadBranchSnapshot == null) return;
    setState(() { _working = true; _snapshotDownloading = true; _message = null; });
    try {
      await widget.onDownloadBranchSnapshot!();
      final db = LocalDatabase.instance;
      final expected = '${widget.session.tenantId}:${widget.session.branchId}';
      if (await db.getSnapshotScope() != expected ||
          await db.getLastSyncTimestamp() == null) {
        throw StateError('The server snapshot could not be verified for this branch.');
      }
      if (!mounted) return;
      setState(() { _snapshotReady = true; _message = 'Branch database synchronized. You can start sharing.'; });
    } catch (error) {
      if (mounted) setState(() { _message = 'Database download failed: $error'; });
    } finally {
      if (mounted) setState(() { _working = false; _snapshotDownloading = false; });
    }
  }

  Future<void> _openDistribution() async {
    if (!mounted) return;
    await Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => _ManagerDistributionRoute(
        relay: _relay,
        managerSessionId: _pairing!.sessionId,
        session: widget.session,
        onPublish: _prepareDistribution,
        onOffer: _offerDistribution,
      ),
    ));
    if (mounted) { await _loadSyncState(); await _loadCollectionOfficers(); }
  }

  Future<void> _startSharing() async {
    if (!_snapshotReady) {
      setState(() => _message = 'Download the verified branch database before starting local sharing.');
      return;
    }

    if (_working) return;
    setState(() { _working = true; _message = null; });
    try {
      final pairing = await _relay.startManagerRelay(widget.session);
      if (!mounted) return;
      setState(() { _pairing = pairing; _showPairingCode = false; });
      await _loadSyncState();
      await _loadCollectionOfficers();
      _startManagerWatcher();
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _stopSharing() async {
    final confirmed = await _ask(
      'Stop branch sharing?',
      'Officers will not be able to transfer records until you start sharing again.',
      confirm: 'Stop sharing',
      destructive: true,
    );
    if (!confirmed) return;
    setState(() => _working = true);
    try {
      await _relay.stopManagerRelay();
      _distributionTimer?.cancel();
      if (mounted) {
        setState(() {
          _pairing = null;
          _participants = const [];
          _collectionOfficers = const [];
          _distributionOffers = const [];
        });
      }
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _scanCode() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const _BranchRelayScannerScreen()),
    );
    if (!mounted || raw == null || raw.isEmpty) return;
    final online = await NetworkStatusStore.instance.checkNow();
    if (!mounted) return;
    if (online && !_managerTransferApproved) {
      final proceed = await _ask(
        'Live branch data is available',
        'Live sync is normally preferred. Only use manager transfer when the branch is deliberately operating in offline mode.',
        confirm: 'Use manager transfer',
      );
      if (!proceed) {
        await _useLiveData();
        return;
      }
      _managerTransferApproved = true;
    } else if (!online) {
      final proceed = await _ask(
        'Connect to offline branch?',
        'Keep both devices on the same manager hotspot or local Wi-Fi throughout the transfer.',
        confirm: 'Continue',
      );
      if (!proceed) return;
    }
    setState(() { _working = true; _message = null; });
    try {
      final pairing = BranchRelayQrPayload.decode(raw);
      await _relay.joinRelay(payload: pairing, session: widget.session);
      RealtimeClient.instance.disconnect();
      if (!mounted) return;
      setState(() => _pairedSessionId = pairing.sessionId);
      await _relay.reportParticipantProgress(
        sessionId: pairing.sessionId,
        session: widget.session,
        phase: 'Connected', received: 0, total: 0,
      );
      await _loadSyncState();
      await _checkAvailableDistribution();
      _startOfficerWatcher();
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _useLiveData() async {
    if (!mounted) return;
    setState(() => _working = true);
    try {
      await widget.onUseLiveData?.call();
      if (mounted) setState(() => _message = 'Live branch data is ready.');
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _checkAvailableDistribution() async {
    final sessionId = _pairedSessionId;
    if (sessionId == null) return;
    try {
      final available = await _relay.availableDistribution(
        sessionId: sessionId, session: widget.session,
      );
      if (mounted) setState(() => _availableDistribution = available);
    } catch (_) {
      // Do not clear a previously offered update during a hotspot interruption.
    }
  }

  Future<bool> _downloadBranchData(String sessionId) async {
    _stopDownloadRequested = false;
    try {
      final result = await _relay.downloadBranchSnapshot(
        sessionId: sessionId,
        session: widget.session,
        shouldCancel: () => _stopDownloadRequested,
        onProgress: (received, total) {
          if (!mounted) return;
          setState(() {
            _downloadedRows = received;
            _downloadTotal = total;
          });
          unawaited(_relay.reportParticipantProgress(
            sessionId: sessionId,
            session: widget.session,
            phase: 'Receiving branch update',
            received: received, total: total,
          ));
        },
      );
      await _relay.reportParticipantProgress(
        sessionId: sessionId, session: widget.session,
        phase: 'Ready for field work',
        received: result.received, total: result.total,
      );
      if (mounted) setState(() => _message = 'Branch update received and verified.');
      return true;
    } catch (error) {
      if (mounted) {
        setState(() => _message =
            'Transfer paused. Reconnect to the manager and accept the update to resume.');
      }
      unawaited(_relay.reportParticipantProgress(
        sessionId: sessionId, session: widget.session,
        phase: 'Transfer paused',
        received: _downloadedRows ?? 0, total: _downloadTotal ?? 0,
      ));
      return false;
    }
  }

  Future<void> _confirmReceiveUpdate() async {
    final sessionId = _pairedSessionId;
    final available = _availableDistribution;
    if (sessionId == null || available == null || _working) return;
    final distributionId = available['distributionId']?.toString();
    if (distributionId == null || distributionId.isEmpty) return;
    final version = available['versionLabel']?.toString() ?? 'the latest version';
    if (!await _ask('Receive branch update?',
        'Receive $version from your branch manager?', confirm: 'Accept')) return;
    if (!mounted) return;
    setState(() {
      _working = true;
      _receivingUpdate = true;
      _downloadedRows = 0;
      _downloadTotal = null;
    });
    try {
      await _relay.acceptDistribution(
        sessionId: sessionId, distributionId: distributionId,
      );
      final success = await _downloadBranchData(sessionId);
      if (success) {
        await _loadSyncState();
        await _checkAvailableDistribution();
      }
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) {
        setState(() { _working = false; _receivingUpdate = false; });
      }
    }
  }

  Future<void> _confirmNotNow() async {
    final confirmed = await _ask(
      'Receive this update later?',
      'You can continue using your current branch version and receive the new update later.',
      confirm: 'Not now',
    );
    if (confirmed && mounted) {
      setState(() => _availableDistribution = null);
    }
  }

  Future<void> _confirmAndSend() async {
    await _loadSyncState();
    if (!mounted || _pendingTotal == 0 || _working) return;
    final confirmed = await _ask(
      'Send Records',
      'Are you sure you want to send $_pendingTotal records to ${widget.session.branchName ?? 'your branch'}?',
      confirm: 'Confirm',
    );
    if (confirmed) await _sendSavedWork();
  }

  Future<void> _sendSavedWork() async {
    final sessionId = _pairedSessionId;
    if (sessionId == null || _working) return;
    setState(() {
      _working = true;
      _message = null;
      _sendPhase = 'Waiting for manager to accept';
      _sentRecords = 0;
      _totalRecords = _pendingTotal;
    });
    try {
      await _relay.reportParticipantProgress(
        sessionId: sessionId, session: widget.session,
        phase: 'Ready to receive', received: 0, total: _totalRecords,
      );
      await _relay.waitForManagerAcceptance(sessionId: sessionId);
      final result = await _relay.sendPendingToManager(
        sessionId: sessionId,
        session: widget.session,
        onProgress: (sent, total) {
          if (!mounted) return;
          setState(() {
            _sendPhase = 'Sending records';
            _sentRecords = sent;
            _totalRecords = total;
          });
          unawaited(_relay.reportParticipantProgress(
            sessionId: sessionId, session: widget.session,
            phase: 'Sending saved work', received: sent, total: total,
          ));
        },
      );
      if (!mounted) return;
      setState(() {
        _sendPhase = result.sent == 0 ? 'No records to send' : 'Records sent';
        _sentRecords = result.acknowledged;
        _totalRecords = result.sent;
        _message = result.sent == 0
            ? 'There are no records waiting to send.'
            : '${result.acknowledged} records received by the manager.';
      });
      await _loadSyncState();
      await _relay.reportParticipantProgress(
        sessionId: sessionId, session: widget.session,
        phase: result.sent == 0 ? 'Ready for field work' : 'Work received by manager',
        received: result.acknowledged, total: result.sent,
      );
    } catch (error) {
      _showError(error);
      if (mounted) setState(() => _sendPhase = 'Transfer paused');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _prepareDistribution() async {
    if (_working) return;
    if (!_collectionReady) {
      setState(() => _message =
          'Receive or skip every assigned officer before publishing a branch update.');
      return;
    }
    setState(() => _working = true);
    try {
      final distribution = await _relay.prepareDistribution(widget.session);
      if (!mounted) return;
      setState(() => _distributionVersion = distribution.versionLabel);
      await _refreshDistributionState();
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _offerDistribution(BranchRelayParticipant participant) async {
    if (_working) return;
    final distribution = await _relay.currentDistribution(widget.session);
    if (distribution == null) {
      if (mounted) setState(() => _message = 'Generate a distribution first.');
      return;
    }
    setState(() => _working = true);
    try {
      await _relay.offerDistribution(
        participant: participant, distribution: distribution,
      );
      await _refreshDistributionState();
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _skipCollectionOfficer(BranchRelayCollectionOfficer officer) async {
    final sessionId = _pairing?.sessionId;
    if (sessionId == null) return;
    if (!await _ask('Skip ${officer.name}?',
        'Only skip this officer if they have no records to submit for this collection cycle.',
        confirm: 'Skip officer')) return;
    try {
      await _relay.skipCollectionOfficer(
        sessionId: sessionId, agentId: officer.agentId,
      );
      await _loadCollectionOfficers();
    } catch (error) { _showError(error); }
  }

  Future<void> _receiveCollectionOfficer(BranchRelayCollectionOfficer officer) async {
    if (_working) return;
    setState(() => _working = true);
    try {
      await _relay.receiveCollection(officer);
      await _loadCollectionOfficers();
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  BranchRelayParticipant? _participantFor(String name) {
    final key = _normalise(name);
    for (final participant in _participants) {
      if (_normalise(participant.name) == key) return participant;
    }
    return null;
  }

  Future<void> _stopReceivingCollectionOfficer(BranchRelayCollectionOfficer officer) async {
    final participant = _participantFor(officer.name);
    if (participant == null) return;
    if (!await _ask('Stop receiving records?',
        'Verified records already received from ${officer.name} will be kept.',
        confirm: 'Stop receiving', destructive: true)) return;
    _relay.stopReceivingCollection(participant);
    await _loadCollectionOfficers();
  }

  Future<void> _viewReceivedRecords(BranchRelayCollectionOfficer officer) async {
    final participant = _participantFor(officer.name);
    if (participant == null) {
      if (mounted) setState(() => _message =
          'The officer is not currently connected. Reconnect to view their received records.');
      return;
    }
    try {
      final records = await _relay.receivedRecords(
        session: widget.session, participant: participant,
      );
      if (!mounted) return;
      await Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (_) => _ReceivedRelayRecordsScreen(
          officerName: officer.name, records: records,
        ),
      ));
    } catch (error) { _showError(error); }
  }

  Future<void> _endRelayForRecovery() async {
    final sessionId = _pairedSessionId;
    if (sessionId == null) return;
    if (!await _ask('Use internet recovery?',
        'Only use this if the manager cannot receive your saved work. Direct uploads will require manager reconciliation.',
        confirm: 'Use recovery')) return;
    try {
      await _relay.endClientRelay(sessionId);
      _officerTimer?.cancel();
      if (mounted) {
        setState(() {
          _pairedSessionId = null;
          _availableDistribution = null;
          _message = 'Branch sharing ended. Direct sync is available again.';
        });
      }
    } catch (error) { _showError(error); }
  }

  Future<bool> _ask(String title, String description,
      {required String confirm, bool destructive = false}) async {
    if (!mounted) return false;
    return await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            24, 14, 24, 24 + MediaQuery.viewInsetsOf(sheetContext).bottom,
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 40, height: 4,
                decoration: BoxDecoration(color: line,
                    borderRadius: BorderRadius.circular(20))),
            const SizedBox(height: 24),
            Icon(destructive ? Icons.warning_amber_rounded : Icons.sync_rounded,
                color: destructive ? const Color(0xFFD92D20) : forestEmerald,
                size: 36),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800,
                    color: midnightNavy)),
            const SizedBox(height: 9),
            Text(description, textAlign: TextAlign.center,
                style: const TextStyle(color: slateText, height: 1.45)),
            const SizedBox(height: 24),
            SizedBox(width: double.infinity, height: 48,
              child: FilledButton(
                style: destructive ? FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFD92D20)) : null,
                onPressed: () => Navigator.pop(sheetContext, true),
                child: Text(confirm),
              ),
            ),
            const SizedBox(height: 9),
            SizedBox(width: double.infinity, height: 46,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(sheetContext, false),
                child: const Text('Cancel'),
              ),
            ),
          ]),
        ),
      ),
    ) ?? false;
  }

  void _showError(Object error) {
    if (!mounted) return;
    final text = error.toString();
    setState(() => _message =
        text.contains('SocketException') || text.contains('Could not reach')
            ? 'Cannot reach the manager. Check the hotspot and keep the manager screen open.'
            : text);
  }

  String _timeLabel(DateTime date) {
    final local = date.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final hosting = _pairing != null;
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text('Sync Centre'),
        backgroundColor: Colors.white,
        foregroundColor: midnightNavy,
        elevation: 0,
      ),
      body: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            if (_serverReachable == true && !hosting && _pairedSessionId == null) ...[
              _Banner(
                icon: Icons.cloud_done_outlined,
                title: 'Live branch data available',
                message: 'Normal sync is available. Use offline branch sharing only when needed.',
              ),
              const SizedBox(height: 14),
            ],
            if (_canHost) ...[
              Text(widget.session.branchName ?? 'Your branch',
                  style: const TextStyle(fontSize: 23,
                      fontWeight: FontWeight.w800, color: midnightNavy)),
              const SizedBox(height: 5),
              _ConnectionBadge(connected: hosting, label: hosting
                  ? 'Branch sharing active' : 'Branch sharing stopped'),
              const SizedBox(height: 16),
              if (!hosting) ...[
                _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('1. Download branch database', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  Text(_snapshotReady ? 'Verified database is ready on this device.' :
                    'Synchronize the full branch database before sharing. A verified local copy can also be used offline.',
                    style: const TextStyle(fontSize: 12, color: slateText)),
                  const SizedBox(height: 10),
                  _PrimaryButton(_snapshotDownloading ? 'Downloading…' : _snapshotReady ? 'Download again' : 'Download database',
                    icon: Icons.cloud_download_outlined,
                    onPressed: _working || widget.onDownloadBranchSnapshot == null ? null : _downloadManagerSnapshot),
                  if (widget.onDownloadBranchSnapshot == null) const Padding(
                    padding: EdgeInsets.only(top: 8), child: Text(
                      'Database synchronization is unavailable from this entry point.',
                      style: TextStyle(color: slateText, fontSize: 11))),
                  const SizedBox(height: 15),
                  const Text('2. Start branch sharing', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 9),
                  _PrimaryButton('Start sharing', icon: Icons.wifi_tethering_rounded,
                    onPressed: _working || !_snapshotReady ? null : _startSharing),
                ])),
              ] else ...[
                _Panel(child: Column(children: [
                  InkWell(
                    onTap: () => setState(() => _showPairingCode = !_showPairingCode),
                    child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [
                      const Icon(Icons.qr_code_2_rounded, color: forestEmerald),
                      const SizedBox(width: 10),
                      const Expanded(child: Text('Connect field officers',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
                      Icon(_showPairingCode ? Icons.expand_less : Icons.expand_more),
                    ])),
                  ),
                  if (_showPairingCode) ...[
                    const SizedBox(height: 10),
                    const Text('Scan with the officer’s device', style: TextStyle(fontSize: 12, color: slateText)),
                    const SizedBox(height: 10),
                    Center(child: RepaintBoundary(child: QrImageView(data: _pairing!.encode(), size: 188,
                      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: forestEmerald)))),
                    const SizedBox(height: 6),
                    Text('Code expires ${_timeLabel(_pairing!.expiresAt)}',
                      style: const TextStyle(color: forestEmerald, fontSize: 12, fontWeight: FontWeight.w700)),
                  ],
                ])),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: OutlinedButton.icon(
                    onPressed: null, icon: const Icon(Icons.move_to_inbox_outlined, size: 17),
                    label: const Text('Collection'))),
                  const SizedBox(width: 8),
                  Expanded(child: FilledButton.icon(
                    onPressed: _openDistribution, icon: const Icon(Icons.outbox_outlined, size: 17),
                    label: const Text('Distribution'))),
                ]),
                const SizedBox(height: 12),
                _MetricRow(items: [
                  _Metric('Officers', '${_collectionOfficers.length}', Icons.groups_2_outlined,
                    const Color(0xFFEAF3FF), const Color(0xFF2770B8)),
                  _Metric('Connected', '${_participants.length}', Icons.wifi_rounded,
                    const Color(0xFFE7F8ED), forestEmerald),
                  _Metric('Submitted', '${_collectionOfficers.where((e) => e.isReceived).length}',
                    Icons.check_circle_outline, const Color(0xFFFFF6DD), const Color(0xFFC77800)),
                ]),
                const SizedBox(height: 12),
                _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _SectionTitle('Collection readiness',
                    '${_collectionOfficers.where((e) => e.isResolved).length}/${_collectionOfficers.length}'),
                  const SizedBox(height: 5),
                  const Text('Receive each officer’s records or skip officers who did not work.',
                    style: TextStyle(color: slateText, fontSize: 12)),
                  const SizedBox(height: 8),
                  if (_collectionOfficers.isEmpty)
                    const _EmptyState(icon: Icons.groups_outlined, title: 'No assigned officers',
                      message: 'Assigned officers will appear here when available.')
                  else
                    ..._collectionOfficers.map((officer) => _CollectionOfficerTile(
                      officer: officer,
                      onReceive: _working || !officer.isReady ? null : () => _receiveCollectionOfficer(officer),
                      onSkip: _working || officer.isResolved ? null : () => _skipCollectionOfficer(officer),
                      onStop: _working || !officer.isReceiving ? null : () => _stopReceivingCollectionOfficer(officer),
                      onView: !officer.isReceived ? null : () => _viewReceivedRecords(officer),
                    )),
                ])),
                const SizedBox(height: 10),
                _PrimaryButton('Open Distribution', icon: Icons.arrow_forward_rounded,
                  onPressed: _openDistribution),
                const SizedBox(height: 8),
                Text(_collectionReady ? 'Collection complete. Ready to publish.' :
                  'Receive or skip every officer before publishing.',
                  textAlign: TextAlign.center, style: const TextStyle(color: slateText, fontSize: 11)),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _working ? null : () async {
                    await _loadSyncState();
                    await _loadCollectionOfficers();
                  },
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Refresh branch status'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _working ? null : _stopSharing,
                  icon: const Icon(Icons.stop_circle_outlined),
                  label: const Text('Stop sharing'),
                ),
              ],
            ] else ...[
              _OfficerSyncCentre(
                branchName: widget.session.branchName ?? 'Your branch',
                connected: _pairedSessionId != null,
                version: _distributionVersion,
                sendRecordsTab: _sendTab,
                counts: _pendingCounts,
                working: _working,
                sent: _sentRecords,
                total: _totalRecords,
                phase: _sendPhase,
                received: _downloadedRows,
                receiveTotal: _downloadTotal,
                availableDistribution: _availableDistribution,
                receivingUpdate: _receivingUpdate,
                onTabChanged: (send) => setState(() => _sendTab = send),
                onScan: _scanCode,
                onSend: _confirmAndSend,
                onCheckUpdate: _checkAvailableDistribution,
                onAcceptUpdate: _confirmReceiveUpdate,
                onNotNow: _confirmNotNow,
                onStopReceive: () async {
                  if (await _ask('Stop receiving?',
                      'Your downloaded progress will be preserved where supported.',
                      confirm: 'Stop transfer', destructive: true)) {
                    _stopDownloadRequested = true;
                  }
                },
                onRecovery: _endRelayForRecovery,
              ),
            ],
            if (_message != null) ...[
              const SizedBox(height: 14),
              _Banner(icon: Icons.info_outline, title: 'Sharing status',
                  message: _message!),
            ],

        ],
          ),
      ),
    );
  }
}


  class _ManagerDistributionRoute extends StatefulWidget {
  const _ManagerDistributionRoute({required this.relay, required this.session,
    required this.onPublish, required this.onOffer, required this.managerSessionId});
  final String managerSessionId;
  final BranchRelayService relay;
  final RembehSession session;
  final Future<void> Function() onPublish;
  final Future<void> Function(BranchRelayParticipant) onOffer;
  @override
  State<_ManagerDistributionRoute> createState() => _ManagerDistributionRouteState();
}

class _ManagerDistributionRouteState extends State<_ManagerDistributionRoute> {
  List<BranchRelayCollectionOfficer> officers = const [];
  List<BranchRelayParticipant> participants = const [];
  List<BranchRelayDistributionOffer> offers = const [];
  String? version;
  bool busy = false;
  Timer? timer;
  StreamSubscription<List<BranchRelayParticipant>>? subscription;

  @override
  void initState() {
    super.initState();

    subscription = widget.relay.participantsStream.listen((value) {
      if (mounted) setState(() => participants = value);
    });
    unawaited(refresh());
    timer = Timer.periodic(const Duration(seconds: 3), (_) => unawaited(refresh()));
  }
  @override
  void dispose() { timer?.cancel(); subscription?.cancel(); super.dispose(); }
  Future<void> refresh() async {
    try {
      final distribution = await widget.relay.currentDistribution(widget.session);
      final nextOffers = distribution == null ? <BranchRelayDistributionOffer>[] :
        await widget.relay.distributionOffers(distribution);
      // Collection roster is already resolved by the parent before publishing.
      final nextOfficers = await widget.relay.collectionOfficers(
        session: widget.session, sessionId: widget.managerSessionId);
      if (mounted) setState(() { version = distribution?.versionLabel;
        offers = nextOffers; officers = nextOfficers; });
    } catch (_) {}
  }
  @override
  Widget build(BuildContext context) {
    final ready = officers.isNotEmpty && officers.every((o) => o.isResolved);
    return Scaffold(backgroundColor: softIvory,
      appBar: AppBar(title: const Text('Distribution'), backgroundColor: Colors.white,
        foregroundColor: midnightNavy),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _ManagerDistributionPanel(participants: participants, officers: officers,
          offers: offers, version: version, generating: busy,
          onGenerate: !busy && ready ? () async {
            setState(() => busy = true);
            try { await widget.onPublish(); await refresh(); }
            finally { if (mounted) setState(() => busy = false); }
          } : null,
          onSend: (participant) async {
            setState(() => busy = true);
            try { await widget.onOffer(participant); await refresh(); }
            finally { if (mounted) setState(() => busy = false); }
          }),
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: refresh, icon: const Icon(Icons.refresh),
          label: const Text('Refresh status')),
      ]),
    );
  }
}

String _normalise(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

class _Panel extends StatelessWidget {
  const _Panel({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Colors.white,
      border: Border.all(color: line), borderRadius: BorderRadius.circular(14)),
    child: child,
  );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.title, required this.message});
  final IconData icon;
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: const Color(0xFFEFF7F1),
      border: Border.all(color: const Color(0xFFCBE6D2)),
      borderRadius: BorderRadius.circular(12)),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, color: forestEmerald, size: 21),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800,
              color: midnightNavy)),
          const SizedBox(height: 3),
          Text(message, style: const TextStyle(color: slateText,
              fontSize: 12, height: 1.35)),
        ],
      )),
    ]),
  );
}

class _ConnectionBadge extends StatelessWidget {
  const _ConnectionBadge({required this.connected, required this.label});
  final bool connected;
  final String label;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: connected ? const Color(0xFFE7F8ED) : const Color(0xFFF0F2F5),
        borderRadius: BorderRadius.circular(50)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(connected ? Icons.wifi_rounded : Icons.wifi_off_rounded,
          size: 16, color: connected ? forestEmerald : slateText),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
            color: connected ? forestEmerald : slateText)),
      ]),
    ),
  );
}

class _TabBar extends StatelessWidget {
  const _TabBar({required this.left, required this.right,
      required this.rightSelected, required this.onChanged});
  final String left;
  final String right;
  final bool rightSelected;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => Container(
    height: 48,
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(color: const Color(0xFFF0F2F5),
        borderRadius: BorderRadius.circular(12)),
    child: Row(children: [
      _Tab(label: left, active: !rightSelected, onTap: () => onChanged(false)),
      _Tab(label: right, active: rightSelected, onTap: () => onChanged(true)),
    ]),
  );
}

class _Tab extends StatelessWidget {
  const _Tab({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Material(
      color: active ? forestEmerald : Colors.transparent,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap, borderRadius: BorderRadius.circular(9),
        child: Center(child: Text(label, maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800,
              color: active ? Colors.white : slateText))),
      ),
    ),
  );
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton(this.label, {required this.onPressed, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity, height: 48,
    child: icon == null
      ? FilledButton(onPressed: onPressed, child: Text(label))
      : FilledButton.icon(onPressed: onPressed, icon: Icon(icon, size: 19),
          label: Text(label)),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, this.trailing);
  final String title;
  final String trailing;
  @override
  Widget build(BuildContext context) => Row(children: [
    Expanded(child: Text(title,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800,
          color: midnightNavy))),
    Text(trailing, style: const TextStyle(color: forestEmerald,
        fontSize: 12, fontWeight: FontWeight.w800)),
  ]);
}

class _Metric {
  const _Metric(this.label, this.value, this.icon, this.background, this.color);
  final String label;
  final String value;
  final IconData icon;
  final Color background;
  final Color color;
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.items});
  final List<_Metric> items;
  @override
  Widget build(BuildContext context) => Row(children: [
    for (var i = 0; i < items.length; i++) ...[
      if (i > 0) const SizedBox(width: 8),
      Expanded(child: Container(
        constraints: const BoxConstraints(minHeight: 94),
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 10),
        decoration: BoxDecoration(color: items[i].background,
            borderRadius: BorderRadius.circular(12)),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(items[i].icon, size: 20, color: items[i].color),
          const SizedBox(height: 5),
          Text(items[i].value, style: const TextStyle(fontSize: 21,
              fontWeight: FontWeight.w800, color: midnightNavy)),
          const SizedBox(height: 3),
          SizedBox(height: 30, child: Center(child: Text(items[i].label,
            maxLines: 2, textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, color: slateText)))),
        ]),
      )),
    ],
  ]);
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.title,
      required this.message});
  final IconData icon;
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 10),
    child: Column(children: [
      Icon(icon, size: 38, color: forestEmerald),
      const SizedBox(height: 10),
      Text(title, textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
      const SizedBox(height: 5),
      Text(message, textAlign: TextAlign.center,
        style: const TextStyle(color: slateText, height: 1.4, fontSize: 13)),
    ]),
  );
}

class _CollectionOfficerTile extends StatelessWidget {
  const _CollectionOfficerTile({required this.officer,
    this.onReceive, this.onSkip, this.onStop, this.onView});
  final BranchRelayCollectionOfficer officer;
  final VoidCallback? onReceive;
  final VoidCallback? onSkip;
  final VoidCallback? onStop;
  final VoidCallback? onView;
  @override
  Widget build(BuildContext context) {
    final status = officer.isReceived ? 'Submitted'
        : officer.isSkipped ? 'Skipped'
        : officer.isReceiving ? 'Receiving'
        : officer.isReady ? 'Ready to receive' : 'Awaiting request';
    final color = officer.isReceived ? forestEmerald
        : officer.isReceiving ? const Color(0xFF2770B8)
        : officer.isSkipped ? const Color(0xFFC77800) : slateText;
    final VoidCallback? action = officer.isReceived ? onView
        : officer.isReceiving ? onStop
        : officer.isReady ? onReceive : onSkip;
    final actionText = officer.isReceived ? 'View'
        : officer.isReceiving ? 'Stop'
        : officer.isReady ? 'Receive' : 'Skip';
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFFAFBFC),
        border: Border.all(color: line), borderRadius: BorderRadius.circular(11)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(radius: 18, backgroundColor: const Color(0xFFE7F8ED),
            child: Text(officer.name.isEmpty ? '?' : officer.name[0].toUpperCase(),
              style: const TextStyle(color: forestEmerald,
                  fontWeight: FontWeight.w800))),
          const SizedBox(width: 10),
          Expanded(child: Text(officer.name, maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800))),
          if (!officer.isSkipped)
            OutlinedButton(onPressed: action,
              style: OutlinedButton.styleFrom(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 12)),
              child: Text(actionText)),
        ]),
        const SizedBox(height: 6),
        Text(status, style: TextStyle(color: color, fontSize: 12,
            fontWeight: FontWeight.w700)),
        if (officer.isReceiving) ...[
          const SizedBox(height: 9),
          const LinearProgressIndicator(minHeight: 5),
        ],
      ]),
    );
  }
}

class _ManagerDistributionPanel extends StatelessWidget {
  const _ManagerDistributionPanel({super.key, required this.participants,
    required this.officers, required this.offers, required this.version,
    required this.generating, required this.onGenerate, required this.onSend});
  final List<BranchRelayParticipant> participants;
  final List<BranchRelayCollectionOfficer> officers;
  final List<BranchRelayDistributionOffer> offers;
  final String? version;
  final bool generating;
  final Future<void> Function()? onGenerate;
  final Future<void> Function(BranchRelayParticipant) onSend;

  BranchRelayParticipant? _participantFor(BranchRelayCollectionOfficer officer) {
    for (final participant in participants) {
      if (_normalise(participant.name) == _normalise(officer.name)) {
        return participant;
      }
    }
    return null;
  }

  BranchRelayDistributionOffer? _offerFor(BranchRelayCollectionOfficer officer,
      BranchRelayParticipant? participant) {
    for (final offer in offers) {
      if ((participant != null && offer.deviceId == participant.deviceId) ||
          offer.officerUserId == officer.agentId ||
          _normalise(offer.officerName ?? '') == _normalise(officer.name)) {
        return offer;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final updated = officers.where((officer) =>
        _offerFor(officer, _participantFor(officer))?.status.toUpperCase()
            == 'COMPLETED').length;
    final connected = officers.where((officer) => _participantFor(officer) != null).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _MetricRow(items: [
        _Metric('Officers', '${officers.length}', Icons.groups_2_outlined,
            const Color(0xFFEAF3FF), const Color(0xFF2770B8)),
        _Metric('Connected', '$connected', Icons.wifi_rounded,
            const Color(0xFFE7F8ED), forestEmerald),
        _Metric('Updated', '$updated', Icons.sync_rounded,
            const Color(0xFFFFF6DD), const Color(0xFFC77800)),
        _Metric('Offline', '${officers.length - connected}', Icons.wifi_off_rounded,
            const Color(0xFFFFEEEE), const Color(0xFFD92D20)),
      ]),
      const SizedBox(height: 14),
      _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Current distribution',
              style: TextStyle(color: slateText, fontSize: 12)),
          const SizedBox(height: 5),
          Text(version ?? 'No distribution published yet',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800,
                  color: midnightNavy)),
          const SizedBox(height: 7),
          Text(generating ? 'Publishing snapshot…'
              : version == null ? 'Complete collection before publishing'
              : 'Ready to distribute',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                  color: version == null ? slateText : forestEmerald)),
          const SizedBox(height: 14),
          _PrimaryButton(version == null ? 'Publish Snapshot' : 'Publish New Version',
              icon: Icons.publish_outlined,
              onPressed: generating ? null : onGenerate),
        ],
      )),
      const SizedBox(height: 12),
      if (onGenerate == null)
        const _Banner(icon: Icons.info_outline,
          title: 'Collection not complete',
          message: 'Receive or skip each assigned officer before publishing a new snapshot.'),
      const SizedBox(height: 18),
      _SectionTitle('Assigned Officers', '$updated of ${officers.length} updated'),
      const SizedBox(height: 8),
      if (officers.isEmpty)
        const _Panel(child: _EmptyState(icon: Icons.groups_outlined,
            title: 'No assigned officers',
            message: 'Assign field officers to start distributing updates.'))
      else
        ...officers.map((officer) {
          final participant = _participantFor(officer);
          final offer = _offerFor(officer, participant);
          final status = offer?.status.toUpperCase();
          final canSend = participant != null && version != null && !generating &&
              status != 'OFFERED' && status != 'ACCEPTED' &&
              status != 'SENDING' && status != 'COMPLETED';
          return _DistributionOfficerTile(
            name: officer.name,
            participant: participant,
            offer: offer,
            onSend: canSend ? () => onSend(participant) : null,
          );
        }),
    ]);
  }
}

class _DistributionOfficerTile extends StatelessWidget {
  const _DistributionOfficerTile({required this.name, required this.participant,
      required this.offer, required this.onSend});
  final String name;
  final BranchRelayParticipant? participant;
  final BranchRelayDistributionOffer? offer;
  final VoidCallback? onSend;
  @override
  Widget build(BuildContext context) {
    final status = offer?.status.toUpperCase();
    final phase = participant?.phase.toLowerCase() ?? '';
    final updated = status == 'COMPLETED';
    final waiting = status == 'OFFERED';
    final transferring = status == 'ACCEPTED' || status == 'SENDING' ||
        (!updated && (phase.contains('accepted') || phase.contains('receiving')));
    final label = updated ? 'Updated'
        : transferring ? 'Sending'
        : waiting ? 'Waiting for officer to accept'
        : participant == null ? 'Offline' : 'Ready to update';
    final progressKnown = participant != null && participant!.total > 0;
    final progress = progressKnown ? participant!.progress.clamp(0.0, 1.0).toDouble() : 0.0;
    return Container(
      margin: const EdgeInsets.only(bottom: 9),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(color: Colors.white,
          border: Border.all(color: line), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(radius: 19, backgroundColor: const Color(0xFFE7F8ED),
            child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
              style: const TextStyle(color: forestEmerald,
                  fontWeight: FontWeight.w800))),
          const SizedBox(width: 10),
          Expanded(child: Text(name, maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800,
                  color: midnightNavy))),
          if (onSend != null)
            FilledButton.tonalIcon(
              onPressed: onSend,
              icon: const Icon(Icons.near_me_outlined, size: 16),
              label: const Text('Send'),
              style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
            ),
          if (updated) const Icon(Icons.check_circle_rounded, color: forestEmerald),
        ]),
        const SizedBox(height: 8),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
            color: updated ? forestEmerald : waiting
                ? const Color(0xFFC77800) : transferring
                ? const Color(0xFF2770B8) : slateText)),
        if (waiting || transferring) ...[
          const SizedBox(height: 9),
          ClipRRect(borderRadius: BorderRadius.circular(12),
            child: LinearProgressIndicator(
              value: waiting ? 0 : progressKnown ? progress : null,
              minHeight: 6, backgroundColor: const Color(0xFFE7ECE9),
              color: forestEmerald,
            )),
          const SizedBox(height: 6),
          Row(children: [
            Expanded(child: Text(waiting ? 'Waiting for acceptance' : 'Sending records',
                style: const TextStyle(color: slateText, fontSize: 12))),
            if (transferring && progressKnown)
              Text('${(progress * 100).round()}%',
                  style: const TextStyle(color: forestEmerald,
                      fontWeight: FontWeight.w800, fontSize: 12)),
          ]),
        ],
      ]),
    );
  }
}

class _OfficerSyncCentre extends StatelessWidget {
  const _OfficerSyncCentre({required this.branchName, required this.connected,
    required this.version, required this.sendRecordsTab, required this.counts,
    required this.working, required this.sent, required this.total,
    required this.phase, required this.received, required this.receiveTotal,
    required this.availableDistribution, required this.receivingUpdate,
    required this.onTabChanged, required this.onScan, required this.onSend,
    required this.onCheckUpdate, required this.onAcceptUpdate,
    required this.onNotNow, required this.onStopReceive, required this.onRecovery});
  final String branchName;
  final bool connected;
  final String? version;
  final bool sendRecordsTab;
  final Map<String, int> counts;
  final bool working;
  final int sent;
  final int total;
  final String phase;
  final int? received;
  final int? receiveTotal;
  final Map<String, dynamic>? availableDistribution;
  final bool receivingUpdate;
  final ValueChanged<bool> onTabChanged;
  final Future<void> Function() onScan;
  final Future<void> Function() onSend;
  final Future<void> Function() onCheckUpdate;
  final Future<void> Function() onAcceptUpdate;
  final Future<void> Function() onNotNow;
  final Future<void> Function() onStopReceive;
  final Future<void> Function() onRecovery;

  @override
  Widget build(BuildContext context) {
    final recordCount = counts.values.fold<int>(0, (sum, count) => sum + count);
    final transferActive = working &&
        (phase == 'Waiting for manager to accept' || phase == 'Sending records');
    final hasUpdate = availableDistribution != null;
    final versionLabel = availableDistribution?['versionLabel']?.toString() ??
        'New branch version';
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(branchName, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800,
                color: midnightNavy)),
            const SizedBox(height: 3),
            Text(connected ? 'Connected to branch manager' : 'Manager connection required',
              style: const TextStyle(color: slateText, fontSize: 12)),
          ])),
        const SizedBox(width: 8),
        _ConnectionBadge(connected: connected,
          label: connected ? 'Connected' : 'Offline'),
      ]),
      const SizedBox(height: 11),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: const Color(0xFFF0F5F2),
          borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          const Icon(Icons.storage_outlined, color: forestEmerald, size: 20),
          const SizedBox(width: 9),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Branch database version',
                style: TextStyle(color: slateText, fontSize: 11)),
              Text(version ?? 'Not downloaded', maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800,
                  color: midnightNavy)),
            ])),
          if (connected)
            IconButton(tooltip: 'Scan another manager code',
              visualDensity: VisualDensity.compact,
              onPressed: working ? null : onScan,
              icon: const Icon(Icons.qr_code_scanner_rounded,
                color: forestEmerald, size: 21)),
        ]),
      ),
      const SizedBox(height: 12),
      _TabBar(left: 'Send Records', right: 'Receive Update',
        rightSelected: !sendRecordsTab,
        onChanged: (right) => onTabChanged(!right)),
      const SizedBox(height: 14),
      if (sendRecordsTab) ...[
        _SectionTitle('Records to send', '$recordCount pending'),
        const SizedBox(height: 8),
        _Panel(child: Column(children: [
          _CountRow(Icons.account_balance_wallet_outlined, 'Repayments',
            counts['repayments'] ?? 0, forestEmerald),
          const Divider(height: 13),
          _CountRow(Icons.receipt_long_outlined, 'Expenses',
            counts['expenses'] ?? 0, const Color(0xFFC77800)),
          const Divider(height: 13),
          _CountRow(Icons.description_outlined, 'Loan applications',
            counts['applications'] ?? 0, const Color(0xFF2770B8)),
        ])),
        const SizedBox(height: 12),
        _PrimaryButton(connected ? 'Send $recordCount records' : 'Connect to manager',
          icon: connected ? Icons.north_east_rounded : Icons.qr_code_scanner_rounded,
          onPressed: working ? null : connected
            ? (recordCount == 0 ? null : onSend) : onScan),
        if (transferActive || phase == 'Records sent' ||
            phase == 'Transfer paused') ...[
          const SizedBox(height: 12),
          _TransferProgress(
            title: phase == 'Records sent' ? 'Records sent' : phase,
            detail: phase == 'Waiting for manager to accept'
              ? 'Waiting for the manager to accept your records.'
              : phase == 'Records sent'
                ? 'Manager acknowledged $sent records.'
                : '$sent of $total records transferred',
            received: sent, total: total,
            waiting: phase == 'Waiting for manager to accept',
          ),
          if (phase == 'Transfer paused') ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: onRecovery,
              icon: const Icon(Icons.cloud_sync_outlined),
              label: const Text('Internet recovery')),
          ],
        ],
      ] else if (!connected) ...[
        const _Panel(child: _EmptyState(
          icon: Icons.qr_code_scanner_rounded,
          title: 'Connect to your manager',
          message: 'Join the manager hotspot or local Wi-Fi, then scan their code.')),
        const SizedBox(height: 10),
        _PrimaryButton('Scan manager code',
          icon: Icons.qr_code_scanner_rounded,
          onPressed: working ? null : onScan),
      ] else if (receivingUpdate) ...[
        _TransferProgress(title: 'Receiving branch database',
          detail: 'Keep both devices connected until verification finishes.',
          received: received ?? 0, total: receiveTotal ?? 0),
        const SizedBox(height: 10),
        OutlinedButton.icon(onPressed: onStopReceive,
          icon: const Icon(Icons.stop_circle_outlined),
          label: const Text('Stop transfer')),
      ] else if (hasUpdate) ...[
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const CircleAvatar(radius: 19,
                backgroundColor: Color(0xFFE7F8ED),
                child: Icon(Icons.cloud_download_outlined,
                  color: forestEmerald, size: 22)),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(version == null ? 'Branch database available'
                    : 'Branch update available',
                    style: const TextStyle(fontSize: 15,
                      fontWeight: FontWeight.w800, color: midnightNavy)),
                  const SizedBox(height: 2),
                  Text(versionLabel, maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: forestEmerald,
                      fontSize: 13, fontWeight: FontWeight.w700)),
                ])),
            ]),
            const SizedBox(height: 9),
            const Text('Published by your manager. Accept to receive the verified branch data.',
              style: TextStyle(color: slateText, fontSize: 12, height: 1.35)),
            const SizedBox(height: 12),
            _PrimaryButton(version == null ? 'Download database' : 'Receive update',
              icon: Icons.download_rounded,
              onPressed: working ? null : onAcceptUpdate),
            const SizedBox(height: 4),
            Center(child: TextButton(onPressed: working ? null : onNotNow,
              child: const Text('Not Now'))),
          ])),
      ] else ...[
        _Panel(child: Column(children: [
          const _EmptyState(icon: Icons.cloud_download_outlined,
            title: 'Waiting for branch update',
            message: 'No new database distribution published yet.'),
          const SizedBox(height: 5),
          OutlinedButton.icon(onPressed: working ? null : onCheckUpdate,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Check for update')),
        ])),
      ],
    ]);
  }
}

class _CountRow extends StatelessWidget {
  const _CountRow(this.icon, this.label, this.count, this.color);
  final IconData icon;
  final String label;
  final int count;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(children: [
    CircleAvatar(radius: 18, backgroundColor: color.withValues(alpha: .10),
        child: Icon(icon, color: color, size: 20)),
    const SizedBox(width: 11),
    Expanded(child: Text(label,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
    Text('$count', style: const TextStyle(fontSize: 18,
        fontWeight: FontWeight.w800, color: midnightNavy)),
  ]);
}

class _TransferProgress extends StatelessWidget {
  const _TransferProgress({required this.title, required this.detail,
      required this.received, required this.total, this.waiting = false});
  final String title;
  final String detail;
  final int received;
  final int total;
  final bool waiting;
  @override
  Widget build(BuildContext context) {
    final progress = total > 0
        ? (received / total).clamp(0.0, 1.0).toDouble() : 0.0;
    return _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 16,
            fontWeight: FontWeight.w800, color: midnightNavy)),
        const SizedBox(height: 5),
        Text(detail, style: const TextStyle(color: slateText,
            fontSize: 12, height: 1.35)),
        const SizedBox(height: 12),
        ClipRRect(borderRadius: BorderRadius.circular(20),
          child: LinearProgressIndicator(
            value: waiting ? 0 : total > 0 ? progress : null,
            minHeight: 7, backgroundColor: const Color(0xFFE6EBE7),
            color: forestEmerald,
          )),
        const SizedBox(height: 7),
        Row(children: [
          Expanded(child: Text(waiting ? 'Waiting for acceptance' :
              '$received of $total records',
              style: const TextStyle(color: slateText, fontSize: 12))),
          if (!waiting && total > 0)
            Text('${(progress * 100).round()}%',
                style: const TextStyle(color: forestEmerald,
                    fontWeight: FontWeight.w800, fontSize: 12)),
        ]),
      ],
    ));
  }
}

class _BranchRelayScannerScreen extends StatefulWidget {
  const _BranchRelayScannerScreen();
  @override
  State<_BranchRelayScannerScreen> createState() => _BranchRelayScannerScreenState();
}

class _BranchRelayScannerScreenState extends State<_BranchRelayScannerScreen> {
  bool _handled = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(title: const Text('Scan manager code'),
        backgroundColor: Colors.black, foregroundColor: Colors.white),
    body: MobileScanner(onDetect: (capture) {
      if (_handled || capture.barcodes.isEmpty) return;
      final raw = capture.barcodes.first.rawValue;
      if (raw == null || raw.isEmpty) return;
      _handled = true;
      Navigator.of(context).pop(raw);
    }),
  );
}

enum _ReceivedRecordTab { repayments, loans, expenses }

class _ReceivedRelayRecordsScreen extends StatefulWidget {
  const _ReceivedRelayRecordsScreen({required this.officerName,
      required this.records});
  final String officerName;
  final List<BranchRelayEvent> records;
  @override
  State<_ReceivedRelayRecordsScreen> createState() =>
      _ReceivedRelayRecordsScreenState();
}

class _ReceivedRelayRecordsScreenState extends State<_ReceivedRelayRecordsScreen> {
  _ReceivedRecordTab _tab = _ReceivedRecordTab.repayments;
  List<BranchRelayEvent> get _visible => widget.records.where((record) =>
      switch (_tab) {
        _ReceivedRecordTab.repayments =>
          record.operationType == OperationType.paymentCreate ||
              record.operationType == OperationType.collectionCreate,
        _ReceivedRecordTab.loans =>
          record.operationType == OperationType.loanApplicationCreate,
        _ReceivedRecordTab.expenses =>
          record.operationType.toUpperCase().contains('EXPENSE'),
      }).toList();

  String _label(BranchRelayEvent event) {
    final data = event.payload;
    final direct = data['borrowerName'] ?? data['customerName'] ??
        data['applicantName'] ?? data['expenseName'] ?? data['name'] ??
        data['description'];
    if (direct != null && direct.toString().trim().isNotEmpty) {
      return direct.toString().trim();
    }
    final names = [data['applicantFirstName'], data['applicantLastName']]
        .where((part) => part != null && part.toString().trim().isNotEmpty)
        .map((part) => part.toString().trim()).join(' ');
    return names.isEmpty ? 'Recorded transaction' : names;
  }

  String _amount(BranchRelayEvent event) {
    final value = event.payload['amount'] ?? event.payload['requestedAmount'] ?? 0;
    final amount = value is num ? value.toDouble() :
        double.tryParse(value.toString()) ?? 0;
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'), (match) => ',');
    return 'UGX $formatted';
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible;
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(title: const Text('Received Records'),
          backgroundColor: Colors.white, foregroundColor: midnightNavy),
      body: SafeArea(child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.officerName,
              style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800,
                  color: midnightNavy)),
          const SizedBox(height: 4),
          Text('${widget.records.length} records received',
              style: const TextStyle(color: slateText)),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity,
            child: SegmentedButton<_ReceivedRecordTab>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: _ReceivedRecordTab.repayments,
                    label: Text('Repayments')),
                ButtonSegment(value: _ReceivedRecordTab.loans,
                    label: Text('Loans issued')),
                ButtonSegment(value: _ReceivedRecordTab.expenses,
                    label: Text('Expenses')),
              ],
              selected: {_tab},
              onSelectionChanged: (values) => setState(() => _tab = values.first),
            ),
          ),
          const SizedBox(height: 14),
          Expanded(child: Container(
            decoration: BoxDecoration(color: Colors.white,
                border: Border.all(color: line),
                borderRadius: BorderRadius.circular(12)),
            child: Column(children: [
              Container(padding: const EdgeInsets.all(14),
                decoration: const BoxDecoration(
                  color: Color(0xFFF4F6F8),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(11))),
                child: const Row(children: [
                  Expanded(child: Text('Record',
                      style: TextStyle(fontWeight: FontWeight.w800))),
                  Text('Amount', style: TextStyle(fontWeight: FontWeight.w800)),
                ]),
              ),
              Expanded(child: visible.isEmpty
                  ? const _EmptyState(icon: Icons.inbox_outlined,
                      title: 'No records',
                      message: 'No records of this type were received.')
                  : ListView.separated(
                      itemCount: visible.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) => Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 14),
                        child: Row(children: [
                          Expanded(child: Text(_label(visible[index]),
                              maxLines: 2, overflow: TextOverflow.ellipsis)),
                          const SizedBox(width: 10),
                          Text(_amount(visible[index]),
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                        ]),
                      ),
                    )),
            ]),
          )),
        ]),
      )),
    );
  }
}
