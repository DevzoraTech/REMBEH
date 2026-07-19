import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:syncfusion_flutter_signaturepad/signaturepad.dart';

import '../../features/loan_application/domain/entities/signature_capture.dart';
import '../../features/loan_application/domain/signature_validation.dart';
import '../../theme.dart';

/// Full-screen landscape electronic signature capture with Syncfusion pad.
Future<SignatureCaptureResult?> openElectronicSignatureScreen(
  BuildContext context, {
  required String title,
  required String signerName,
  required String signerRole,
  required String loanApplicationId,
}) {
  return Navigator.of(context).push<SignatureCaptureResult>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => ElectronicSignatureScreen(
        title: title,
        signerName: signerName,
        signerRole: signerRole,
        loanApplicationId: loanApplicationId,
      ),
    ),
  );
}

class ElectronicSignatureScreen extends StatefulWidget {
  const ElectronicSignatureScreen({
    super.key,
    required this.title,
    required this.signerName,
    required this.signerRole,
    required this.loanApplicationId,
  });

  final String title;
  final String signerName;
  final String signerRole;
  final String loanApplicationId;

  @override
  State<ElectronicSignatureScreen> createState() =>
      _ElectronicSignatureScreenState();
}

class _ElectronicSignatureScreenState extends State<ElectronicSignatureScreen> {
  final GlobalKey<SfSignaturePadState> _padKey = GlobalKey();
  final GlobalKey _exportBoundaryKey = GlobalKey();
  final List<SignatureStroke> _committedStrokes = [];
  final List<SignatureStrokePoint> _activePoints = [];
  String _activePointerKind = 'touch';
  bool _consentAccepted = false;
  bool _saving = false;
  bool _padEnabled = false;
  DateTime? _sessionStartedAt;
  DateTime? _firstStrokeAt;

  static const _orientationsAll = [
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ];

  @override
  void initState() {
    super.initState();
    _sessionStartedAt = DateTime.now();
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations(_orientationsAll);
    super.dispose();
  }

  void _onConsentChanged(bool? value) {
    final accepted = value ?? false;
    setState(() {
      _consentAccepted = accepted;
      _padEnabled = accepted;
    });
  }

  void _clear() {
    _padKey.currentState?.clear();
    setState(() {
      _committedStrokes.clear();
      _activePoints.clear();
      _firstStrokeAt = null;
    });
  }

  void _undo() {
    if (_activePoints.isNotEmpty) {
      _padKey.currentState?.clear();
      setState(() => _activePoints.clear());
      return;
    }
    if (_committedStrokes.isEmpty) return;
    setState(() {
      _committedStrokes.removeLast();
    });
    // Keep Syncfusion clear; CustomPaint redraws remaining strokes.
    _padKey.currentState?.clear();
  }

  void _handlePointerDown(PointerDownEvent event) {
    if (!_padEnabled) return;
    _firstStrokeAt ??= DateTime.now();
    _activePointerKind = _kindLabel(event.kind);
    _activePoints
      ..clear()
      ..add(_pointFrom(event));
  }

  void _handlePointerMove(PointerMoveEvent event) {
    if (!_padEnabled || _activePoints.isEmpty) return;
    _activePoints.add(_pointFrom(event));
  }

  void _handlePointerUp(PointerUpEvent event) {
    if (!_padEnabled || _activePoints.isEmpty) return;
    _activePoints.add(_pointFrom(event));
    if (_activePoints.length >= 2) {
      final stroke = SignatureStroke(
        points: List<SignatureStrokePoint>.from(_activePoints),
        pointerKind: _activePointerKind,
      );
      setState(() {
        _committedStrokes.add(stroke);
        _activePoints.clear();
      });
      // Clear live Syncfusion ink after CustomPaint has committed strokes.
      // Do NOT clear before setState — that caused ink to vanish on lift.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _padKey.currentState?.clear();
      });
    } else {
      _activePoints.clear();
      _padKey.currentState?.clear();
    }
  }

  SignatureStrokePoint _pointFrom(PointerEvent event) {
    return SignatureStrokePoint(
      x: event.localPosition.dx,
      y: event.localPosition.dy,
      t: DateTime.now().millisecondsSinceEpoch,
      pressure: event.pressure == 0 ? null : event.pressure,
    );
  }

  String _kindLabel(PointerDeviceKind kind) {
    switch (kind) {
      case PointerDeviceKind.stylus:
      case PointerDeviceKind.invertedStylus:
        return 'stylus';
      case PointerDeviceKind.mouse:
        return 'mouse';
      case PointerDeviceKind.trackpad:
        return 'trackpad';
      case PointerDeviceKind.touch:
      case PointerDeviceKind.unknown:
        return 'touch';
    }
  }

  Future<void> _save() async {
    final strokes = List<SignatureStroke>.from(_committedStrokes);
    if (_activePoints.length >= 2) {
      strokes.add(
        SignatureStroke(
          points: List<SignatureStrokePoint>.from(_activePoints),
          pointerKind: _activePointerKind,
        ),
      );
    }

    final validation = SignatureValidator.validate(strokes);
    if (!validation.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validation.error!)),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      // Prefer compositing CustomPaint + live Syncfusion via RepaintBoundary
      // at high pixel ratio; fall back to Syncfusion toImage alone.
      Uint8List? png = await _exportBoundaryPng(pixelRatio: 4.0);
      if (png == null) {
        final padState = _padKey.currentState;
        if (padState != null) {
          final image = await padState.toImage(pixelRatio: 4.0);
          png = await _imageToPng(image);
        }
      }
      if (png == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not export signature image.')),
        );
        return;
      }

      png = await _ensureMinResolution(png, minWidth: 1080, minHeight: 500);

      final deviceMeta = await _collectDeviceMetadata();
      final now = DateTime.now();
      final started = _firstStrokeAt ?? _sessionStartedAt ?? now;
      final durationMs = now.difference(started).inMilliseconds;
      final pointCount =
          strokes.fold<int>(0, (sum, s) => sum + s.points.length);
      final pathLength = _totalPathLength(strokes);
      final speed =
          durationMs > 0 ? (pathLength / (durationMs / 1000.0)) : 0.0;

      final audit = SignatureAuditExtras(
        signingDurationMs: durationMs,
        strokeCount: strokes.length,
        pointCount: pointCount,
        approximateWritingSpeedPxPerSec:
            double.parse(speed.toStringAsFixed(2)),
      );

      final metadata = <String, dynamic>{
        'signerName': widget.signerName,
        'signerRole': widget.signerRole,
        'timestamp': now.toUtc().toIso8601String(),
        'timezone': now.timeZoneName,
        'timezoneOffsetMinutes': now.timeZoneOffset.inMinutes,
        'deviceModel': deviceMeta['deviceModel'],
        'osVersion': deviceMeta['osVersion'],
        'appVersion': deviceMeta['appVersion'],
        'ipAddress': null,
        'gpsLocation': null,
        'loanApplicationId': widget.loanApplicationId,
        'consentAccepted': true,
        'consentText':
            'I understand that my electronic signature has the same legal effect as a handwritten signature.',
        'auditDisclosed': true,
      };

      if (!mounted) return;
      Navigator.of(context).pop(
        SignatureCaptureResult(
          pngBytes: png,
          strokes: strokes,
          metadata: metadata,
          audit: audit,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<Uint8List?> _exportBoundaryPng({required double pixelRatio}) async {
    final boundary = _exportBoundaryKey.currentContext?.findRenderObject()
        as RenderRepaintBoundary?;
    if (boundary == null) return null;
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    return _imageToPng(image);
  }

  Future<Uint8List?> _imageToPng(ui.Image image) async {
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData?.buffer.asUint8List();
  }

  Future<Uint8List> _ensureMinResolution(
    Uint8List png, {
    required int minWidth,
    required int minHeight,
  }) async {
    final codec = await ui.instantiateImageCodec(png);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    if (image.width >= minWidth && image.height >= minHeight) {
      return png;
    }

    final scale = math.max(
      minWidth / image.width,
      minHeight / image.height,
    );
    final width = (image.width * scale).round();
    final height = (image.height * scale).round();
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawColor(Colors.white, BlendMode.src);
    canvas.scale(scale);
    canvas.drawImage(image, Offset.zero, Paint());
    final picture = recorder.endRecording();
    final scaled = await picture.toImage(width, height);
    return (await _imageToPng(scaled)) ?? png;
  }

  Future<Map<String, String>> _collectDeviceMetadata() async {
    final package = await PackageInfo.fromPlatform();
    final deviceInfo = DeviceInfoPlugin();
    var deviceModel = 'unknown';
    var osVersion = 'unknown';

    if (!kIsWeb) {
      switch (defaultTargetPlatform) {
        case TargetPlatform.android:
          final android = await deviceInfo.androidInfo;
          deviceModel = '${android.manufacturer} ${android.model}'.trim();
          osVersion = 'Android ${android.version.release}';
        case TargetPlatform.iOS:
          final ios = await deviceInfo.iosInfo;
          deviceModel = ios.utsname.machine;
          osVersion = '${ios.systemName} ${ios.systemVersion}';
        default:
          deviceModel = defaultTargetPlatform.name;
          osVersion = defaultTargetPlatform.name;
      }
    }

    return {
      'deviceModel': deviceModel,
      'osVersion': osVersion,
      'appVersion': '${package.version}+${package.buildNumber}',
    };
  }

  double _totalPathLength(List<SignatureStroke> strokes) {
    var length = 0.0;
    for (final stroke in strokes) {
      for (var i = 1; i < stroke.points.length; i++) {
        final a = stroke.points[i - 1];
        final b = stroke.points[i];
        final dx = b.x - a.x;
        final dy = b.y - a.y;
        length += math.sqrt(dx * dx + dy * dy);
      }
    }
    return length;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: midnightNavy,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Sign below / Borrower: ${widget.signerName}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 6),
              Material(
                color: sage,
                child: CheckboxListTile(
                  value: _consentAccepted,
                  onChanged: _saving ? null : _onConsentChanged,
                  activeColor: forestEmerald,
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                  title: const Text(
                    'I consent to sign electronically. My electronic signature '
                    'has the same legal effect as a handwritten signature. '
                    'Signing duration, stroke count, and approximate writing '
                    'speed may be recorded for audit.',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: AbsorbPointer(
                  absorbing: !_padEnabled || _saving,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _padEnabled ? forestEmerald : line,
                        width: 1.5,
                      ),
                      color: softIvory,
                    ),
                    child: Listener(
                      behavior: HitTestBehavior.translucent,
                      onPointerDown: _handlePointerDown,
                      onPointerMove: _handlePointerMove,
                      onPointerUp: _handlePointerUp,
                      child: RepaintBoundary(
                        key: _exportBoundaryKey,
                        child: ColoredBox(
                          color: softIvory,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              CustomPaint(
                                painter: _CommittedStrokesPainter(
                                  // New list identity each rebuild so shouldRepaint
                                  // detects commits (mutating the same list hid ink).
                                  List<SignatureStroke>.from(_committedStrokes),
                                ),
                              ),
                              SfSignaturePad(
                                key: _padKey,
                                backgroundColor: Colors.transparent,
                                minimumStrokeWidth: 1.6,
                                maximumStrokeWidth: 4.2,
                                strokeColor: midnightNavy,
                              ),
                              if (!_padEnabled)
                                Container(
                                  color: Colors.white.withValues(alpha: 0.72),
                                  alignment: Alignment.center,
                                  child: const Text(
                                    'Accept consent to enable the signature pad.',
                                    style: TextStyle(
                                      color: slateText,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: (_saving || !_padEnabled) ? null : _clear,
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: (_saving || !_padEnabled) ? null : _undo,
                      child: const Text('Undo'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: (_saving || !_padEnabled) ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommittedStrokesPainter extends CustomPainter {
  _CommittedStrokesPainter(this.strokes);

  final List<SignatureStroke> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = midnightNavy
      ..strokeWidth = 2.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    for (final stroke in strokes) {
      if (stroke.points.length < 2) continue;
      final path = Path()
        ..moveTo(stroke.points.first.x, stroke.points.first.y);
      for (var i = 1; i < stroke.points.length; i++) {
        path.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _CommittedStrokesPainter oldDelegate) {
    if (oldDelegate.strokes.length != strokes.length) return true;
    for (var i = 0; i < strokes.length; i++) {
      if (!identical(oldDelegate.strokes[i], strokes[i]) &&
          oldDelegate.strokes[i].points.length != strokes[i].points.length) {
        return true;
      }
      if (!identical(oldDelegate.strokes[i], strokes[i])) return true;
    }
    return false;
  }
}
