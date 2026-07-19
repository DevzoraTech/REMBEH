import 'dart:math' as math;

import 'entities/signature_capture.dart';

class SignatureValidationResult {
  const SignatureValidationResult.ok() : error = null;
  const SignatureValidationResult.fail(this.error);

  final String? error;
  bool get isValid => error == null;
}

/// Rejects one-dot / tiny / too-few-stroke signatures.
class SignatureValidator {
  static const minPoints = 24;
  static const minStrokes = 1;
  static const minBoundingBoxWidth = 40.0;
  static const minBoundingBoxHeight = 18.0;
  static const minPathLength = 80.0;

  static SignatureValidationResult validate(List<SignatureStroke> strokes) {
    if (strokes.isEmpty) {
      return const SignatureValidationResult.fail(
        'Please sign before saving.',
      );
    }

    final allPoints = <SignatureStrokePoint>[
      for (final stroke in strokes) ...stroke.points,
    ];

    if (allPoints.length < minPoints) {
      return const SignatureValidationResult.fail(
        'Signature is too short. Please sign more clearly.',
      );
    }

    if (strokes.length < minStrokes) {
      return const SignatureValidationResult.fail(
        'Signature needs at least one continuous stroke.',
      );
    }

    var minX = allPoints.first.x;
    var maxX = allPoints.first.x;
    var minY = allPoints.first.y;
    var maxY = allPoints.first.y;
    var pathLength = 0.0;

    for (final stroke in strokes) {
      for (var i = 0; i < stroke.points.length; i++) {
        final p = stroke.points[i];
        minX = math.min(minX, p.x);
        maxX = math.max(maxX, p.x);
        minY = math.min(minY, p.y);
        maxY = math.max(maxY, p.y);
        if (i > 0) {
          final prev = stroke.points[i - 1];
          final dx = p.x - prev.x;
          final dy = p.y - prev.y;
          pathLength += math.sqrt(dx * dx + dy * dy);
        }
      }
    }

    final width = maxX - minX;
    final height = maxY - minY;
    if (width < minBoundingBoxWidth || height < minBoundingBoxHeight) {
      return const SignatureValidationResult.fail(
        'Signature is too small. Please sign larger in the pad.',
      );
    }

    if (pathLength < minPathLength) {
      return const SignatureValidationResult.fail(
        'Signature looks incomplete. Please sign again.',
      );
    }

    return const SignatureValidationResult.ok();
  }
}
