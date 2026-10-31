import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

/// Local attachments are encrypted before being copied into application storage.
class OnboardingAttachmentStore {
  OnboardingAttachmentStore(
    this.scope, {
    FlutterSecureStorage? secureStorage,
    Future<Directory> Function()? directory,
  }) : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
       _directory = directory ?? getApplicationSupportDirectory;

  final String scope;
  final FlutterSecureStorage _secureStorage;
  final Future<Directory> Function() _directory;
  final _cipher = AesGcm.with256bits();
  static const maxBytes = 10 * 1024 * 1024;

  Future<SecretKey> _key({bool create = false}) async {
    final keyName = 'onboarding_attachment_key_v1:$scope';
    final existing = await _secureStorage.read(key: keyName);
    if (existing != null) {
      final bytes = base64Decode(existing);
      if (bytes.length != 32) {
        throw const FormatException('Invalid attachment encryption key.');
      }
      return SecretKey(bytes);
    }
    if (!create) {
      throw StateError('The attachment encryption key is unavailable.');
    }
    final key = await _cipher.newSecretKey();
    await _secureStorage.write(
      key: keyName,
      value: base64Encode(await key.extractBytes()),
    );
    return key;
  }

  Future<File> _file(String id) async {
    if (!Uuid.isValidUUID(fromString: id)) {
      throw const FormatException('Invalid attachment ID.');
    }
    final support = await _directory();
    final folder = Directory('${support.path}/onboarding-attachments');
    await folder.create(recursive: true);
    return File('${folder.path}/$id.bin');
  }

  Future<Map<String, dynamic>> store({
    required String sourcePath,
    required String name,
    required String mediaType,
  }) async {
    final source = File(sourcePath);
    final length = await source.length();
    if (length < 1 || length > maxBytes) {
      throw const FormatException('Choose a file up to 10 MB.');
    }
    final bytes = await source.readAsBytes();
    if (bytes.length != length) {
      throw const FormatException(
        'The selected file changed. Choose it again.',
      );
    }
    final mime = _mime(bytes);
    final key = await _key(create: true);
    final box = await _cipher.encrypt(bytes, secretKey: key);
    final id = const Uuid().v4();
    final file = await _file(id);
    await file.writeAsBytes([
      1,
      ...box.nonce,
      ...box.mac.bytes,
      ...box.cipherText,
    ], flush: true);
    final safeName = name.replaceAll(RegExp(r'[\x00-\x1f\x7f]'), '').trim();
    return {
      'id': id,
      'mediaType': mediaType,
      'mimeType': mime,
      'byteSize': length,
      'fileName': safeName.isEmpty
          ? 'attachment'
          : safeName.substring(
              0,
              safeName.length > 255 ? 255 : safeName.length,
            ),
    };
  }

  Future<Uint8List> read(Map<String, dynamic> attachment) async {
    final id = attachment['id'];
    if (id is! String) throw const FormatException('Invalid attachment.');
    final data = await (await _file(id)).readAsBytes();
    if (data.length < 29 || data[0] != 1) {
      throw const FormatException('Invalid encrypted attachment.');
    }
    final plain = await _cipher.decrypt(
      SecretBox(
        data.sublist(29),
        nonce: data.sublist(1, 13),
        mac: Mac(data.sublist(13, 29)),
      ),
      secretKey: await _key(),
    );
    if (plain.length != attachment['byteSize'] ||
        _mime(plain) != attachment['mimeType']) {
      throw const FormatException('Attachment does not match the saved draft.');
    }
    return Uint8List.fromList(plain);
  }

  Future<void> remove(Map<String, dynamic> attachment) async {
    final id = attachment['id'];
    if (id is! String) return;
    final file = await _file(id);
    if (await file.exists()) await file.delete();
  }

  String _mime(List<int> bytes) {
    if (bytes.length >= 3 &&
        bytes[0] == 0xff &&
        bytes[1] == 0xd8 &&
        bytes[2] == 0xff) {
      return 'image/jpeg';
    }
    if (bytes.length >= 8 &&
        const [
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ].asMap().entries.every((e) => bytes[e.key] == e.value)) {
      return 'image/png';
    }
    if (bytes.length >= 5 &&
        ascii.decode(bytes.take(5).toList(), allowInvalid: true) == '%PDF-') {
      return 'application/pdf';
    }
    throw const FormatException('Choose a JPEG, PNG or PDF file.');
  }
}
