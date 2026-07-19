import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../shared/camera_capture/camera_capture.dart';
import '../../theme.dart';
import '../agent_shell.dart';

/// Mandatory professional selfie on first mobile login (or when missing).
class AgentSelfieCaptureScreen extends StatefulWidget {
  const AgentSelfieCaptureScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<AgentSelfieCaptureScreen> createState() =>
      _AgentSelfieCaptureScreenState();
}

class _AgentSelfieCaptureScreenState extends State<AgentSelfieCaptureScreen> {
  late RembehSession _session;
  late final ApiClient _api;
  Uint8List? _preview;
  String? _mimeType;
  String? _fileName;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    _api = ApiClient(SessionStore());
  }

  Future<void> _capture() async {
    setState(() => _error = null);
    final capture = await captureImageWithPermission(context);
    if (!mounted || capture == null) return;
    setState(() {
      _preview = capture.bytes;
      _mimeType = capture.mimeType;
      _fileName = capture.fileName;
    });
  }

  Future<void> _submit() async {
    final bytes = _preview;
    final mime = _mimeType;
    if (bytes == null || mime == null) {
      setState(() => _error = 'Capture your selfie before continuing.');
      return;
    }

    setState(() {
      _uploading = true;
      _error = null;
    });

    try {
      final updated = await _api.uploadProfilePhoto(
        session: _session,
        bytes: bytes,
        mimeType: mime,
        fileName: _fileName,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => AgentShell(session: updated)),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: softIvory,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Agent photo required',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 24,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Take a professional selfie once. It is attached to loans and repayments you record.',
                  style: TextStyle(color: slateText, fontSize: 14, height: 1.35),
                ),
                const SizedBox(height: 18),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: line),
                    ),
                    child: preview == null
                        ? const _GuidancePanel()
                        : Image.memory(
                            preview,
                            fit: BoxFit.cover,
                            width: double.infinity,
                          ),
                  ),
                ),
                const SizedBox(height: 14),
                const _TipRow(
                  icon: Icons.wb_sunny_outlined,
                  text: 'Face a window or bright light — avoid harsh shadows.',
                ),
                const SizedBox(height: 6),
                const _TipRow(
                  icon: Icons.center_focus_strong_outlined,
                  text: 'Center your face; look straight at the camera.',
                ),
                const SizedBox(height: 6),
                const _TipRow(
                  icon: Icons.badge_outlined,
                  text: 'Use a neutral, professional expression (no filters).',
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _uploading ? null : _capture,
                  icon: Icon(
                    preview == null
                        ? Icons.photo_camera_outlined
                        : Icons.refresh,
                  ),
                  label: Text(preview == null ? 'Open camera' : 'Retake selfie'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: forestEmerald,
                    side: const BorderSide(color: forestEmerald),
                    minimumSize: const Size.fromHeight(48),
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: _uploading || preview == null ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: forestEmerald,
                    minimumSize: const Size.fromHeight(50),
                  ),
                  child: _uploading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Save and continue',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GuidancePanel extends StatelessWidget {
  const _GuidancePanel();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: forestEmerald, width: 2),
                color: sage.withValues(alpha: 0.35),
              ),
              child: const Icon(
                Icons.person_outline,
                size: 48,
                color: forestEmerald,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Front-facing camera',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Hold the phone at eye level. Keep shoulders visible. Gallery picks are not used for authenticity.',
              textAlign: TextAlign.center,
              style: TextStyle(color: slateText, fontSize: 13, height: 1.35),
            ),
          ],
        ),
      ),
    );
  }
}

class _TipRow extends StatelessWidget {
  const _TipRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: forestEmerald),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: slateText, fontSize: 12.5, height: 1.3),
          ),
        ),
      ],
    );
  }
}
