import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../services/session_store.dart';
import '../../theme.dart';
import '../network/realtime_client.dart';
import 'branch_relay_crypto.dart';
import 'branch_relay_service.dart';

/// Local-network collaboration screen. A manager keeps this screen open while
/// hosting; iOS and Android may suspend a local server when the app is hidden.
class BranchRelayScreen extends StatefulWidget {
  const BranchRelayScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<BranchRelayScreen> createState() => _BranchRelayScreenState();
}

class _BranchRelayScreenState extends State<BranchRelayScreen> {
  final BranchRelayService _relay = BranchRelayService();
  BranchRelayQrPayload? _pairing;
  bool _working = false;
  String? _message;
  String? _pairedSessionId;
  int? _downloadedRows;
  int? _downloadTotal;

  bool get _canHost => widget.session.canUseBranchWorkspace;

  @override
  void initState() {
    super.initState();
    unawaited(_restorePairedSession());
  }

  Future<void> _restorePairedSession() async {
    if (_canHost) return;
    final session = await _relay.activeClientSession(widget.session);
    if (!mounted || session == null) return;
    setState(() {
      _pairedSessionId = session.sessionId;
      _message =
          'Branch sharing is active. Saved work will be sent to the manager, not directly to the server.';
    });
  }

  @override
  void dispose() {
    unawaited(_relay.stopManagerRelay());
    super.dispose();
  }

  Future<void> _startSharing() async {
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final pairing = await _relay.startManagerRelay(widget.session);
      if (!mounted) return;
      setState(() {
        _pairing = pairing;
        _message =
            'Connected staff can scan this code while on the same Wi-Fi or hotspot.';
      });
    } catch (error) {
      if (mounted) setState(() => _message = error.toString());
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _scanCode() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const _BranchRelayScannerScreen()),
    );
    if (raw == null || raw.isEmpty) return;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final pairing = BranchRelayQrPayload.decode(raw);
      await _relay.joinRelay(payload: pairing, session: widget.session);
      // A paired field officer must not retain an earlier websocket session
      // that can refresh a partial server view while the manager owns branch
      // consolidation for the day.
      RealtimeClient.instance.disconnect();
      if (!mounted) return;
      setState(() {
        _pairedSessionId = pairing.sessionId;
        _message = 'Paired. Downloading the manager\'s current branch data.';
      });
      await _downloadBranchData(pairing.sessionId);
    } catch (error) {
      if (mounted) setState(() => _message = error.toString());
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _downloadBranchData(String sessionId) async {
    try {
      final result = await _relay.downloadBranchSnapshot(
        sessionId: sessionId,
        session: widget.session,
        onProgress: (received, total) {
          if (mounted) {
            setState(() {
              _downloadedRows = received;
              _downloadTotal = total;
            });
          }
        },
      );
      if (mounted) {
        setState(() {
          _message =
              'Branch data is ready (${result.received} records). Send your saved work whenever you finish a batch.';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _message =
              'Branch download paused. Keep the same hotspot connection and tap Download branch data to resume.';
        });
      }
    }
  }

  Future<void> _sendSavedWork() async {
    final sessionId = _pairedSessionId;
    if (sessionId == null) return;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final result = await _relay.sendPendingToManager(
        sessionId: sessionId,
        session: widget.session,
      );
      if (!mounted) return;
      setState(() {
        _message = result.sent == 0
            ? 'There is no saved work waiting to share.'
            : '${result.acknowledged} saved record${result.acknowledged == 1 ? '' : 's'} received by the manager.';
      });
    } catch (error) {
      if (mounted) setState(() => _message = error.toString());
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _endRelayForRecovery() async {
    final sessionId = _pairedSessionId;
    if (sessionId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Use internet recovery?'),
        content: const Text(
          'Only do this when the manager cannot receive your saved work. Your records will be uploaded directly when you next sync and the manager will need to reconcile them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep sharing'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Use recovery'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _relay.endClientRelay(sessionId);
    if (!mounted) return;
    setState(() {
      _pairedSessionId = null;
      _message =
          'Branch sharing ended. Use Sync when you are ready to upload your saved work directly.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final hasPairing = _pairing != null;
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: const Text('Branch sharing'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
        children: [
          _NoticeCard(
            icon: Icons.wifi_tethering_rounded,
            title: 'Works without internet',
            body:
                'Connect all devices to the manager hotspot or local Wi-Fi. Keep this screen open on the manager device while sharing.',
          ),
          const SizedBox(height: 14),
          if (_canHost) ...[
            _SectionCard(
              title: 'Manager sharing',
              child: hasPairing
                  ? Column(
                      children: [
                        QrImageView(
                          data: _pairing!.encode(),
                          size: 230,
                          eyeStyle: const QrEyeStyle(
                            eyeShape: QrEyeShape.square,
                            color: forestEmerald,
                          ),
                        ),
                        Text(
                          'Expires ${_timeLabel(_pairing!.expiresAt)}',
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: _working
                              ? null
                              : () async {
                                  await _relay.stopManagerRelay();
                                  if (mounted) setState(() => _pairing = null);
                                },
                          icon: const Icon(Icons.stop_circle_outlined),
                          label: const Text('Stop sharing'),
                        ),
                      ],
                    )
                  : FilledButton.icon(
                      onPressed: _working ? null : _startSharing,
                      icon: const Icon(Icons.qr_code_2_rounded),
                      label: const Text('Create sharing code'),
                    ),
            ),
            const SizedBox(height: 14),
          ],
          _SectionCard(
            title: _canHost ? 'Receive field work' : 'Field officer sharing',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _canHost
                      ? 'Field officers scan the manager code from their own app. Received work keeps their name, original date and time.'
                      : 'Scan the manager code after joining the branch hotspot, then send your saved work. Acknowledged batches are safe to retry.',
                  style: const TextStyle(color: slateText, height: 1.45),
                ),
                if (!_canHost) ...[
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _working ? null : _scanCode,
                    icon: const Icon(Icons.qr_code_scanner_rounded),
                    label: const Text('Scan manager code'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _working || _pairedSessionId == null
                        ? null
                        : _sendSavedWork,
                    icon: const Icon(Icons.sync_rounded),
                    label: const Text('Send saved work'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _working || _pairedSessionId == null
                        ? null
                        : () => _downloadBranchData(_pairedSessionId!),
                    icon: const Icon(Icons.download_for_offline_outlined),
                    label: Text(
                      _downloadedRows != null && _downloadTotal != null
                          ? 'Download branch data ($_downloadedRows/$_downloadTotal)'
                          : 'Download branch data',
                    ),
                  ),
                  if (_pairedSessionId != null) ...[
                    const SizedBox(height: 18),
                    TextButton(
                      onPressed: _working ? null : _endRelayForRecovery,
                      child: const Text('Use internet recovery instead'),
                    ),
                  ],
                ],
              ],
            ),
          ),
          if (_message != null) ...[
            const SizedBox(height: 14),
            _NoticeCard(
              icon:
                  _message!.startsWith('There is') ||
                      _message!.contains('received')
                  ? Icons.check_circle_outline_rounded
                  : Icons.info_outline_rounded,
              title: 'Sharing status',
              body: _message!,
            ),
          ],
        ],
      ),
    );
  }

  String _timeLabel(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

class _BranchRelayScannerScreen extends StatefulWidget {
  const _BranchRelayScannerScreen();

  @override
  State<_BranchRelayScannerScreen> createState() =>
      _BranchRelayScannerScreenState();
}

class _BranchRelayScannerScreenState extends State<_BranchRelayScannerScreen> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      title: const Text('Scan manager code'),
    ),
    body: MobileScanner(
      onDetect: (capture) {
        if (_handled) return;
        final raw = capture.barcodes.firstOrNull?.rawValue;
        if (raw == null || raw.isEmpty) return;
        _handled = true;
        Navigator.of(context).pop(raw);
      },
    ),
  );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFEFF7F1),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: const Color(0xFFCBE6D2)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: forestEmerald),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(
                body,
                style: const TextStyle(color: slateText, height: 1.35),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
