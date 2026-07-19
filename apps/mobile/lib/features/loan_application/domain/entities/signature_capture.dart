import 'dart:typed_data';

/// One point in a signature stroke (canvas coordinates + time).
class SignatureStrokePoint {
  const SignatureStrokePoint({
    required this.x,
    required this.y,
    required this.t,
    this.pressure,
  });

  final double x;
  final double y;
  final int t;
  final double? pressure;

  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        't': t,
        if (pressure != null) 'pressure': pressure,
      };
}

class SignatureStroke {
  const SignatureStroke({
    required this.points,
    required this.pointerKind,
  });

  final List<SignatureStrokePoint> points;
  final String pointerKind;

  Map<String, dynamic> toJson() => {
        'pointerKind': pointerKind,
        'points': points.map((p) => p.toJson()).toList(growable: false),
      };
}

class SignatureAuditExtras {
  const SignatureAuditExtras({
    required this.signingDurationMs,
    required this.strokeCount,
    required this.pointCount,
    required this.approximateWritingSpeedPxPerSec,
  });

  final int signingDurationMs;
  final int strokeCount;
  final int pointCount;
  final double approximateWritingSpeedPxPerSec;

  Map<String, dynamic> toJson() => {
        'signingDurationMs': signingDurationMs,
        'strokeCount': strokeCount,
        'pointCount': pointCount,
        'approximateWritingSpeedPxPerSec': approximateWritingSpeedPxPerSec,
      };
}

class SignatureCaptureResult {
  const SignatureCaptureResult({
    required this.pngBytes,
    required this.strokes,
    required this.metadata,
    required this.audit,
  });

  final Uint8List pngBytes;
  final List<SignatureStroke> strokes;
  final Map<String, dynamic> metadata;
  final SignatureAuditExtras audit;

  Map<String, dynamic> strokesPayload() => {
        'version': 1,
        'strokes': strokes.map((s) => s.toJson()).toList(growable: false),
      };

  Map<String, dynamic> metadataPayload() => {
        ...metadata,
        'audit': audit.toJson(),
      };
}
