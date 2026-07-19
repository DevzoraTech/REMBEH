import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/features/loan_application/domain/entities/signature_capture.dart';
import 'package:rembeh_mobile/features/loan_application/domain/signature_validation.dart';

void main() {
  group('SignatureValidator', () {
    test('rejects empty strokes', () {
      final result = SignatureValidator.validate(const []);
      expect(result.isValid, isFalse);
    });

    test('rejects a single tiny stroke', () {
      final result = SignatureValidator.validate([
        SignatureStroke(
          pointerKind: 'touch',
          points: [
            for (var i = 0; i < 10; i++)
              SignatureStrokePoint(x: i.toDouble(), y: 0, t: i),
          ],
        ),
      ]);
      expect(result.isValid, isFalse);
    });

    test('accepts a substantial signature', () {
      final points = <SignatureStrokePoint>[
        for (var i = 0; i < 40; i++)
          SignatureStrokePoint(
            x: i * 3.0,
            y: (i % 5) * 8.0,
            t: i * 16,
          ),
      ];
      final result = SignatureValidator.validate([
        SignatureStroke(pointerKind: 'stylus', points: points),
      ]);
      expect(result.isValid, isTrue);
    });
  });
}
