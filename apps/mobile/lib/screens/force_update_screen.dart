import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/update_service.dart';
import '../theme.dart';

class ForceUpdateScreen extends StatefulWidget {
  final UpdateCheckResult updateResult;
  final VoidCallback? onSkip;

  const ForceUpdateScreen({super.key, required this.updateResult, this.onSkip});

  @override
  State<ForceUpdateScreen> createState() => _ForceUpdateScreenState();
}

class _ForceUpdateScreenState extends State<ForceUpdateScreen> {
  late UpdateCheckResult _result;
  bool _isDownloading = false;
  bool _downloadFailed = false;
  bool _needsInstallPermission = false;
  bool _onWifi = false;
  double _progress = 0.0;
  int _receivedBytes = 0;
  int? _totalBytes;
  String? _downloadedPath;
  String _statusText = '';

  bool get _isBlocking => widget.onSkip == null;

  UpdateScreenContent get _screen => _result.screen;

  @override
  void initState() {
    super.initState();
    _result = widget.updateResult;
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final wifi = await UpdateService.isOnWifi();
    if (mounted) setState(() => _onWifi = wifi);
  }

  Future<void> _startUpdate({required bool requestPermissionFirst}) async {
    final fresh = await UpdateService.checkForUpdate();
    if (fresh?.apkUrl != null && mounted) {
      setState(() => _result = fresh!);
    }

    final apkUrl = _result.apkUrl;
    if (apkUrl == null || apkUrl.isEmpty) {
      setState(() {
        _downloadFailed = true;
        _statusText = 'No download URL available.';
      });
      return;
    }

    if (requestPermissionFirst) {
      final canInstall = await UpdateService.canInstallApks();
      if (!mounted) return;
      if (!canInstall) {
        final permissionResult = await UpdateService.requestInstallPermission();
        if (!mounted) return;
        setState(() {
          _isDownloading = false;
          _downloadFailed = permissionResult == InstallPermissionResult.failed;
          _needsInstallPermission =
              permissionResult != InstallPermissionResult.alreadyAllowed;
          _statusText = permissionResult == InstallPermissionResult.failed
              ? 'Open your phone settings and allow installs from REMBEH, then try again.'
              : 'Allow installs from REMBEH, then return and tap Continue update.';
        });
        return;
      }
    }

    setState(() {
      _isDownloading = true;
      _downloadFailed = false;
      _needsInstallPermission = false;
      _progress = 0.0;
      _receivedBytes = 0;
      _totalBytes = _result.apkSizeBytes;
      _statusText = 'Downloading update…';
    });

    final path = await UpdateService.downloadApk(
      apkUrl,
      expectedHash: _result.apkHash,
      expectedSizeBytes: _result.apkSizeBytes,
      refreshUrl: () async {
        final next = await UpdateService.checkForUpdate();
        if (next?.apkUrl != null && mounted) {
          setState(() => _result = next!);
        }
        return next?.apkUrl;
      },
      onProgress: (progress, received, total) {
        if (!mounted) return;
        setState(() {
          _progress = progress;
          _receivedBytes = received;
          _totalBytes = total ?? _totalBytes;
        });
      },
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
      _progress = 1;
      _statusText = 'Download complete. Installing…';
    });

    await _openInstaller();
  }

  Future<void> _openInstaller() async {
    final path = _downloadedPath;
    if (path == null) return;

    setState(() {
      _downloadFailed = false;
      _needsInstallPermission = false;
      _statusText = 'Opening installer…';
    });

    final canInstall = await UpdateService.canInstallApks();
    if (!canInstall) {
      final permissionResult = await UpdateService.requestInstallPermission();
      if (!mounted) return;
      setState(() {
        _isDownloading = false;
        _needsInstallPermission =
            permissionResult != InstallPermissionResult.alreadyAllowed;
        _downloadFailed = permissionResult == InstallPermissionResult.failed;
        _statusText = permissionResult == InstallPermissionResult.failed
            ? 'Open your phone settings and allow installs from REMBEH, then try again.'
            : 'Allow installs from REMBEH, then return and tap Install now.';
      });
      return;
    }

    final result = await UpdateService.installApk(path);
    if (!mounted) return;
    setState(() {
      _isDownloading = false;
      switch (result) {
        case ApkInstallResult.installerOpened:
          _downloadFailed = false;
          _statusText = 'Update will install automatically';
          break;
        case ApkInstallResult.permissionRequired:
          _needsInstallPermission = true;
          _statusText =
              'Allow installs from REMBEH, then return and tap Install now again.';
          break;
        case ApkInstallResult.failed:
          _downloadFailed = true;
          _statusText = 'Could not open the installer. Please try again.';
          break;
      }
    });
  }

  Future<void> _openPromo() async {
    final promo = _screen.promo;
    if (promo == null) return;
    final uri = Uri.tryParse(promo.mediaUrl);
    if (promo.isVideo && uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      return;
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.network(promo.mediaUrl, fit: BoxFit.contain),
        ),
      ),
    );
  }

  List<UpdateWhatsNewItem> get _whatsNew {
    if (_screen.whatsNew.isNotEmpty) return _screen.whatsNew;
    return _result.changelog
        .map((line) => UpdateWhatsNewItem(title: line))
        .toList();
  }

  String _sizeLabel() {
    final total = _totalBytes ?? _result.apkSizeBytes;
    if (total == null || total <= 0) {
      if (_receivedBytes <= 0) return '';
      return 'Downloaded ${_formatMb(_receivedBytes)}';
    }
    return 'Size: ${_formatMb(total)} • ${_onWifi ? 'Using Wi-Fi' : 'Using mobile data'}';
  }

  String _formatMb(int bytes) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    final percent = (_progress * 100).clamp(0, 100).toStringAsFixed(0);
    final whatsNew = _whatsNew.take(6).toList();
    final promo = _screen.promo;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Column(
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F6EE),
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: const Icon(
                          Icons.phonelink_setup_rounded,
                          size: 34,
                          color: forestEmerald,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _isBlocking ? 'Update required' : 'Update available',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: midnightNavy,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F6EE),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          'Version ${r.latestVersion ?? '?'}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: forestEmerald,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        _screen.readyMessage?.trim().isNotEmpty == true
                            ? _screen.readyMessage!
                            : (r.message ?? 'A new REMBEH update is ready.'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 15,
                          color: slateText,
                          height: 1.4,
                        ),
                      ),
                      if (_isBlocking) ...[
                        const SizedBox(height: 8),
                        Text(
                          _screen.requiredMessage?.trim().isNotEmpty == true
                              ? _screen.requiredMessage!
                              : 'This update is required to continue using REMBEH.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xFFDC2626),
                            fontWeight: FontWeight.w700,
                            height: 1.4,
                          ),
                        ),
                      ],
                      if (whatsNew.isNotEmpty) ...[
                        const SizedBox(height: 20),
                        _WhatsNewCard(
                          title:
                              _screen.whatsNewTitle?.trim().isNotEmpty == true
                              ? _screen.whatsNewTitle!
                              : "What's new in this update",
                          items: whatsNew,
                        ),
                      ],
                      if (promo != null) ...[
                        const SizedBox(height: 14),
                        _PromoCard(promo: promo, onOpen: _openPromo),
                      ],
                      const SizedBox(height: 14),
                      _ProgressCard(
                        progress: _progress,
                        percentLabel: percent,
                        statusText: _isDownloading
                            ? '$percent% — $_statusText'
                            : _statusText.isNotEmpty
                            ? _statusText
                            : 'Preparing download…',
                        sizeLabel: _sizeLabel(),
                        failed: _downloadFailed,
                      ),
                      const SizedBox(height: 12),
                      _StayConnectedBanner(screen: _screen),
                      const SizedBox(height: 16),
                      const Text(
                        'Update will install automatically',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: midnightNavy,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.verified_user_rounded,
                            size: 14,
                            color: forestEmerald,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Your data is safe and secure',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF64748B),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                children: [
                  if (_downloadFailed || _needsInstallPermission)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(
                        _statusText,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: _downloadFailed
                              ? const Color(0xFFB91C1C)
                              : const Color(0xFF92400E),
                        ),
                      ),
                    ),
                  if (!_isDownloading)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _downloadedPath != null
                            ? _openInstaller
                            : () => _startUpdate(requestPermissionFirst: true),
                        icon: Icon(
                          _downloadedPath != null
                              ? Icons.install_mobile_rounded
                              : (_needsInstallPermission
                                    ? Icons.verified_user_rounded
                                    : (_downloadFailed
                                          ? Icons.refresh_rounded
                                          : Icons.download_rounded)),
                          size: 20,
                        ),
                        label: Text(
                          _downloadedPath != null
                              ? 'Install now'
                              : (_needsInstallPermission
                                    ? 'Continue update'
                                    : (_downloadFailed
                                          ? 'Retry download'
                                          : 'Update now')),
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
                    const SizedBox(height: 4),
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
          ],
        ),
      ),
    );
  }
}

class _WhatsNewCard extends StatelessWidget {
  const _WhatsNewCard({required this.title, required this.items});

  final String title;
  final List<UpdateWhatsNewItem> items;

  static const _icons = [
    Icons.wifi_off_rounded,
    Icons.cloud_sync_rounded,
    Icons.verified_rounded,
    Icons.person_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6ECE8)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A0F172A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: midnightNavy,
            ),
          ),
          const SizedBox(height: 10),
          ...items.asMap().entries.map((entry) {
            final item = entry.value;
            final icon = _icons[entry.key % _icons.length];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F6EE),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 18, color: forestEmerald),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: midnightNavy,
                          ),
                        ),
                        if (item.body != null && item.body!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              item.body!,
                              style: const TextStyle(
                                fontSize: 12,
                                height: 1.35,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.promo, required this.onOpen});

  final UpdatePromo promo;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFECF8F1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 92,
                  height: 92,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      promo.isVideo
                          ? Container(
                              color: const Color(0xFFD7EFE2),
                              child: const Icon(
                                Icons.play_circle_fill_rounded,
                                size: 42,
                                color: forestEmerald,
                              ),
                            )
                          : Image.network(
                              promo.mediaUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Container(
                                color: const Color(0xFFD7EFE2),
                                child: const Icon(
                                  Icons.image_rounded,
                                  color: forestEmerald,
                                ),
                              ),
                            ),
                      if (promo.isVideo)
                        const Center(
                          child: Icon(
                            Icons.play_circle_fill_rounded,
                            size: 40,
                            color: Color(0xE0065B24),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      promo.title?.trim().isNotEmpty == true
                          ? promo.title!
                          : "See what's new",
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: midnightNavy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      promo.body?.trim().isNotEmpty == true
                          ? promo.body!
                          : 'Watch a quick video to see how this update makes REMBEH better.',
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: Color(0xFF475569),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: onOpen,
              icon: Icon(
                promo.isVideo
                    ? Icons.play_arrow_rounded
                    : Icons.image_outlined,
                size: 18,
              ),
              label: Text(promo.ctaLabel?.trim().isNotEmpty == true
                  ? promo.ctaLabel!
                  : (promo.isVideo ? 'Watch video' : 'View')),
              style: OutlinedButton.styleFrom(
                foregroundColor: forestEmerald,
                side: const BorderSide(color: forestEmerald),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.progress,
    required this.percentLabel,
    required this.statusText,
    required this.sizeLabel,
    required this.failed,
  });

  final double progress;
  final String percentLabel;
  final String statusText;
  final String sizeLabel;
  final bool failed;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6ECE8)),
      ),
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress <= 0 ? null : progress,
              minHeight: 8,
              backgroundColor: const Color(0xFFE5E7EB),
              valueColor: AlwaysStoppedAnimation(
                failed ? const Color(0xFFDC2626) : forestEmerald,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            statusText,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF475569),
            ),
          ),
          if (sizeLabel.isNotEmpty) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.cloud_download_rounded, size: 14, color: forestEmerald),
                const SizedBox(width: 6),
                Text(
                  sizeLabel,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StayConnectedBanner extends StatelessWidget {
  const _StayConnectedBanner({required this.screen});

  final UpdateScreenContent screen;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFECF8F1),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(Icons.wifi_rounded, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  screen.stayConnectedTitle?.trim().isNotEmpty == true
                      ? screen.stayConnectedTitle!
                      : 'Stay connected',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: midnightNavy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  screen.stayConnectedBody?.trim().isNotEmpty == true
                      ? screen.stayConnectedBody!
                      : 'Keep REMBEH open and stay on Wi-Fi for a faster update.',
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    color: Color(0xFF475569),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
