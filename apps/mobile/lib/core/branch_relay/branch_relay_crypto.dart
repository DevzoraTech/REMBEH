import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';

class BranchRelayCrypto {
  BranchRelayCrypto._();

  static final _cipher = AesGcm.with256bits();

  static String randomKey() {
    final random = Random.secure();
    return base64UrlEncode(
      List<int>.generate(32, (_) => random.nextInt(256)),
    ).replaceAll('=', '');
  }

  static String digest(String value) =>
      crypto.sha256.convert(utf8.encode(value)).toString();

  static String sign({
    required String secret,
    required String method,
    required String path,
    required String timestamp,
    required String body,
  }) {
    final bytes = utf8.encode('$method\n$path\n$timestamp\n${digest(body)}');
    return crypto.Hmac(
      crypto.sha256,
      utf8.encode(secret),
    ).convert(bytes).toString();
  }

  static bool validSignature({
    required String provided,
    required String expected,
  }) {
    final a = utf8.encode(provided);
    final b = utf8.encode(expected);
    if (a.length != b.length) return false;
    var difference = 0;
    for (var index = 0; index < a.length; index++) {
      difference |= a[index] ^ b[index];
    }
    return difference == 0;
  }

  static Future<Map<String, dynamic>> seal({
    required String secret,
    required Map<String, dynamic> payload,
  }) async {
    final nonce = _cipher.newNonce();
    final box = await _cipher.encrypt(
      utf8.encode(jsonEncode(payload)),
      secretKey: SecretKey(base64Url.decode(base64Url.normalize(secret))),
      nonce: nonce,
    );
    return {
      'nonce': base64UrlEncode(box.nonce),
      'ciphertext': base64UrlEncode(box.cipherText),
      'mac': base64UrlEncode(box.mac.bytes),
    };
  }

  static Future<Map<String, dynamic>> open({
    required String secret,
    required Map<String, dynamic> envelope,
  }) async {
    final box = SecretBox(
      base64Url.decode(base64Url.normalize(envelope['ciphertext'] as String)),
      nonce: base64Url.decode(base64Url.normalize(envelope['nonce'] as String)),
      mac: Mac(
        base64Url.decode(base64Url.normalize(envelope['mac'] as String)),
      ),
    );
    final clear = await _cipher.decrypt(
      box,
      secretKey: SecretKey(base64Url.decode(base64Url.normalize(secret))),
    );
    return Map<String, dynamic>.from(jsonDecode(utf8.decode(clear)) as Map);
  }
}

class BranchRelayQrPayload {
  const BranchRelayQrPayload({
    required this.version,
    required this.sessionId,
    required this.tenantId,
    required this.branchId,
    required this.endpoint,
    required this.secret,
    required this.expiresAt,
  });

  final int version;
  final String sessionId;
  final String tenantId;
  final String branchId;
  final String endpoint;
  final String secret;
  final DateTime expiresAt;

  bool get isExpired => !expiresAt.isAfter(DateTime.now().toUtc());

  String encode() => base64UrlEncode(
    utf8.encode(
      jsonEncode({
        'v': version,
        'sid': sessionId,
        'tid': tenantId,
        'bid': branchId,
        'endpoint': endpoint,
        'secret': secret,
        'expiresAt': expiresAt.toUtc().toIso8601String(),
      }),
    ),
  );

  factory BranchRelayQrPayload.decode(String raw) {
    final decoded = utf8.decode(base64Url.decode(base64Url.normalize(raw)));
    final value = Map<String, dynamic>.from(jsonDecode(decoded) as Map);
    return BranchRelayQrPayload(
      version: value['v'] as int,
      sessionId: value['sid'] as String,
      tenantId: value['tid'] as String,
      branchId: value['bid'] as String,
      endpoint: value['endpoint'] as String,
      secret: value['secret'] as String,
      expiresAt: DateTime.parse(value['expiresAt'] as String).toUtc(),
    );
  }
}
