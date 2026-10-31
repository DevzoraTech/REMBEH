import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/onboarding_attachment_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('encrypts a selected image and detects tampering', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final directory = await Directory.systemTemp.createTemp('onboarding-test-');
    try {
      final source = File('${directory.path}/source.jpg');
      final original = Uint8List.fromList([0xff, 0xd8, 0xff, 1, 2, 3, 4]);
      await source.writeAsBytes(original);
      final store = OnboardingAttachmentStore(
        'test-scope',
        directory: () async => directory,
      );
      final attachment = await store.store(
        sourcePath: source.path,
        name: 'photo.jpg',
        mediaType: 'PASSPORT',
      );
      final saved = File(
        '${directory.path}/onboarding-attachments/${attachment['id']}.bin',
      );
      final encrypted = await saved.readAsBytes();
      expect(encrypted, isNot(equals(original)));
      expect(await store.read(attachment), equals(original));
      encrypted[encrypted.length - 1] ^= 1;
      await saved.writeAsBytes(encrypted);
      await expectLater(store.read(attachment), throwsA(anything));
      await store.remove(attachment);
      expect(await saved.exists(), isFalse);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  test('rejects a file whose contents are not a supported document', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final directory = await Directory.systemTemp.createTemp('onboarding-test-');
    try {
      final source = File('${directory.path}/bad.jpg');
      await source.writeAsString('not an image');
      final store = OnboardingAttachmentStore(
        'test-scope',
        directory: () async => directory,
      );
      await expectLater(
        store.store(
          sourcePath: source.path,
          name: 'bad.jpg',
          mediaType: 'PASSPORT',
        ),
        throwsFormatException,
      );
    } finally {
      await directory.delete(recursive: true);
    }
  });
}
