import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../config.dart';

/// Result from checking the backend for updates.
class UpdateCheckResult {
  final bool updateAvailable;
  final String updateMode; // 'none' | 'shorebird' | 'full'
  final bool forceUpdate;
  final bool mustUpdate;
  final int currentBuild;
  final int latestBuild;
  final String? latestVersion;
  final int minSupportedBuild;
  final String? apkUrl;
  final String? apkHash;
  final List<String> changelog;
  final String? message;

  UpdateCheckResult({
    required this.updateAvailable,
    required this.updateMode,
    required this.forceUpdate,
    required this.mustUpdate,
    required this.currentBuild,
    required this.latestBuild,
    this.latestVersion,
    required this.minSupportedBuild,
    this.apkUrl,
    this.apkHash,
    required this.changelog,
    this.message,
  });

  factory UpdateCheckResult.fromJson(Map<String, dynamic> json) {
    return UpdateCheckResult(
      updateAvailable: json['updateAvailable'] == true,
      updateMode: json['updateMode']?.toString() ?? 'none',
      forceUpdate: json['forceUpdate'] == true,
      mustUpdate: json['mustUpdate'] == true,
      currentBuild: (json['currentBuild'] as num?)?.toInt() ?? 0,
      latestBuild: (json['latestBuild'] as num?)?.toInt() ?? 0,
      latestVersion: json['latestVersion']?.toString(),
      minSupportedBuild: (json['minSupportedBuild'] as num?)?.toInt() ?? 1,
      apkUrl: json['apkUrl']?.toString(),
      apkHash: json['apkHash']?.toString(),
      changelog:
          (json['changelog'] as List?)?.map((e) => e.toString()).toList() ?? [],
      message: json['message']?.toString(),
    );
  }

  bool get requiresFullInstall => updateMode == 'full' && updateAvailable;

  bool get isBlocking => requiresFullInstall && (forceUpdate || mustUpdate);
}

class UpdateService {
  static const String _appName = 'mobile';

  /// Check backend for updates. Returns null on network errors (non-blocking).
  static Future<UpdateCheckResult?> checkForUpdate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 1;
      final currentVersion = packageInfo.version;
      final platform = Platform.isAndroid ? 'android' : 'ios';

      final uri = Uri.parse('${rembehApiBaseUrl}/app/check-update').replace(
        queryParameters: {
          'app': _appName,
          'currentBuild': currentBuild.toString(),
          'platform': platform,
          'currentVersion': currentVersion,
        },
      );

      final response = await http.get(uri).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        final result = UpdateCheckResult.fromJson(data);
        debugPrint(
          '[UpdateService] mode=${result.updateMode} force=${result.forceUpdate} '
          'latest=${result.latestVersion} build=${result.latestBuild}',
        );
        return result;
      }
    } catch (e) {
      debugPrint('[UpdateService] Check failed (non-fatal): $e');
    }
    return null;
  }

  static Future<String?> downloadApk(
    String apkUrl, {
    void Function(double progress)? onProgress,
    String? expectedHash,
  }) async {
    try {
      final dir = await getTemporaryDirectory();
      final fileName = 'update_${DateTime.now().millisecondsSinceEpoch}.apk';
      final file = File('${dir.path}/$fileName');

      final request = http.Request('GET', Uri.parse(apkUrl));
      final streamedResponse = await http.Client()
          .send(request)
          .timeout(const Duration(minutes: 10));

      final totalBytes = streamedResponse.contentLength ?? 0;
      var receivedBytes = 0;
      final sink = file.openWrite();
      final hashSink = AccumulatorSink<Digest>();
      final shaConverter = sha256.startChunkedConversion(hashSink);

      await for (final chunk in streamedResponse.stream) {
        sink.add(chunk);
        shaConverter.add(chunk);
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress?.call(receivedBytes / totalBytes);
        }
      }

      await sink.close();
      shaConverter.close();
      final computedHash = hashSink.events.first.toString();

      if (expectedHash != null && expectedHash.isNotEmpty) {
        final normalizedExpected =
            expectedHash.replaceFirst('sha256:', '').toLowerCase();
        if (computedHash.toLowerCase() != normalizedExpected) {
          debugPrint('[UpdateService] HASH MISMATCH');
          await file.delete();
          return null;
        }
      }

      _trackDownload();
      return file.path;
    } catch (e) {
      debugPrint('[UpdateService] Download failed: $e');
      return null;
    }
  }

  static Future<bool> installApk(String filePath) async {
    try {
      if (!Platform.isAndroid) return false;
      final result = await OpenFilex.open(
        filePath,
        type: 'application/vnd.android.package-archive',
      );
      return result.type == ResultType.done;
    } catch (e) {
      debugPrint('[UpdateService] Install failed: $e');
      return false;
    }
  }

  static Future<void> _trackDownload() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      await http.post(
        Uri.parse('${rembehApiBaseUrl}/app/track-download'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'app': _appName,
          'buildNumber': int.tryParse(packageInfo.buildNumber) ?? 1,
          'platform': Platform.isAndroid ? 'android' : 'ios',
        }),
      );
    } catch (_) {}
  }
}

class AccumulatorSink<T> implements Sink<T> {
  final List<T> events = [];

  @override
  void add(T event) => events.add(event);

  @override
  void close() {}
}
