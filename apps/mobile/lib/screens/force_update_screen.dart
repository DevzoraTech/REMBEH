import 'package:flutter/material.dart';

import '../services/update_service.dart';
import '../theme.dart';

class ForceUpdateScreen extends StatefulWidget {
  final UpdateCheckResult updateResult;
  final VoidCallback? onSkip;

  const ForceUpdateScreen({
    super.key,
    required this.updateResult,
    this.onSkip,
  });

  @override
  State<ForceUpdateScreen> createState() => _ForceUpdateScreenState();
}

class _ForceUpdateScreenState extends State<ForceUpdateScreen> {
  bool _isDownloading = false;
  bool _downloadFailed = false;
  double _progress = 0.0;
  String? _downloadedPath;
  String _statusText = '';

  bool get _isBlocking => widget.onSkip == null;

  Future<void> _startUpdate() async {
    final apkUrl = widget.updateResult.apkUrl;
    if (apkUrl == null || apkUrl.isEmpty) {
      setState(() {
        _downloadFailed = true;
        _statusText = 'No download URL available.';
      });
      return;
    }

    setState(() {
      _isDownloading = true;
      _downloadFailed = false;
      _progress = 0.0;
      _statusText = 'Downloading update…';
    });

    final path = await UpdateService.downloadApk(
      apkUrl,
      onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      },
      expectedHash: widget.updateResult.apkHash,
    );

    if (!mounted) return;

    if (path == null) {
      setState(() {
        _isDownloading = false;
        _downloadFailed = true;
        _statusText = 'Download failed. Check your connection and try again.';
      });
      return;
    }

    setState(() {
      _downloadedPath = path;
      _statusText = 'Download complete. Installing…';
    });

    await UpdateService.installApk(path);

    if (mounted) {
      setState(() {
        _isDownloading = false;
        _statusText = 'Install prompted. Follow the system installer.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.updateResult;

    return Scaffold(
      backgroundColor: softIvory,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: forestEmerald.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.system_update_rounded,
                      size: 40,
                      color: forestEmerald,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    _isBlocking ? 'Update required' : 'Update available',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: midnightNavy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: sage,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'v${r.latestVersion ?? '?'}  •  Build ${r.latestBuild}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: slateText,
                      ),
                    ),
                  ),
                  if (r.message != null && r.message!.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      r.message!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 15,
                        color: slateText,
                        height: 1.5,
                      ),
                    ),
                  ],
                  if (_isBlocking) ...[
                    const SizedBox(height: 12),
                    const Text(
                      'This update is required to continue using REMBEH.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFFB91C1C),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                  if (r.changelog.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: line),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "What's new",
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: midnightNavy,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ...r.changelog.take(8).map(
                                (item) => Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        '  •  ',
                                        style: TextStyle(color: forestEmerald),
                                      ),
                                      Expanded(
                                        child: Text(
                                          item,
                                          style: const TextStyle(
                                            fontSize: 13,
                                            color: slateText,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 28),
                  if (_isDownloading) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: _progress,
                        minHeight: 8,
                        backgroundColor: line,
                        valueColor:
                            const AlwaysStoppedAnimation(forestEmerald),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${(_progress * 100).toStringAsFixed(0)}%  —  $_statusText',
                      style: const TextStyle(fontSize: 12, color: slateText),
                    ),
                    const SizedBox(height: 20),
                  ],
                  if (_downloadFailed) ...[
                    Text(
                      _statusText,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFFB91C1C),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (!_isDownloading)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _downloadedPath != null
                            ? () => UpdateService.installApk(_downloadedPath!)
                            : _startUpdate,
                        icon: Icon(
                          _downloadedPath != null
                              ? Icons.install_mobile_rounded
                              : (_downloadFailed
                                  ? Icons.refresh_rounded
                                  : Icons.download_rounded),
                          size: 20,
                        ),
                        label: Text(
                          _downloadedPath != null
                              ? 'Install now'
                              : (_downloadFailed
                                  ? 'Retry download'
                                  : 'Update now'),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: forestEmerald,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                      ),
                    ),
                  if (!_isBlocking && !_isDownloading) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: widget.onSkip,
                      child: const Text(
                        'Skip for now',
                        style: TextStyle(
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
