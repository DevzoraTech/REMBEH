import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import '../config.dart';
import 'session_store.dart';

/// Result from checking the backend for updates.
class UpdateWhatsNewItem {
  final String title;
  final String? body;

  const UpdateWhatsNewItem({required this.title, this.body});
}

class UpdatePromo {
  final String mediaType;
  final String mediaUrl;
  final String? title;
  final String? body;
  final String? ctaLabel;

  const UpdatePromo({
    required this.mediaType,
    required this.mediaUrl,
    this.title,
    this.body,
    this.ctaLabel,
  });

  bool get isVideo => mediaType.toUpperCase() == 'VIDEO';
}

class UpdateScreenContent {
  final String? readyMessage;
  final String? requiredMessage;
  final String? whatsNewTitle;
  final List<UpdateWhatsNewItem> whatsNew;
  final UpdatePromo? promo;
  final String? stayConnectedTitle;
  final String? stayConnectedBody;

  const UpdateScreenContent({
    this.readyMessage,
    this.requiredMessage,
    this.whatsNewTitle,
    required this.whatsNew,
    this.promo,
    this.stayConnectedTitle,
    this.stayConnectedBody,
  });

  factory UpdateScreenContent.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const UpdateScreenContent(whatsNew: []);
    }
    final whatsNew = <UpdateWhatsNewItem>[];
    final rawItems = json['whatsNew'];
    if (rawItems is List) {
      for (final item in rawItems) {
        if (item is String && item.trim().isNotEmpty) {
          whatsNew.add(UpdateWhatsNewItem(title: item.trim()));
        } else if (item is Map) {
          final title = item['title']?.toString().trim() ?? '';
          if (title.isEmpty) continue;
          final body = item['body']?.toString().trim();
          whatsNew.add(
            UpdateWhatsNewItem(
              title: title,
              body: (body == null || body.isEmpty) ? null : body,
            ),
          );
        }
      }
    }
    final promoJson = json['promo'];
    UpdatePromo? promo;
    if (promoJson is Map) {
      final url = promoJson['mediaUrl']?.toString() ?? '';
      final type = promoJson['mediaType']?.toString() ?? 'NONE';
      if (url.isNotEmpty && type.toUpperCase() != 'NONE') {
        promo = UpdatePromo(
          mediaType: type,
          mediaUrl: url,
          title: promoJson['title']?.toString(),
          body: promoJson['body']?.toString(),
          ctaLabel: promoJson['ctaLabel']?.toString(),
        );
      }
    }
    final stay = json['stayConnected'];
    return UpdateScreenContent(
      readyMessage: json['readyMessage']?.toString(),
      requiredMessage: json['requiredMessage']?.toString(),
      whatsNewTitle: json['whatsNewTitle']?.toString(),
      whatsNew: whatsNew,
      promo: promo,
      stayConnectedTitle: stay is Map ? stay['title']?.toString() : null,
      stayConnectedBody: stay is Map ? stay['body']?.toString() : null,
    );
  }
}

typedef DownloadProgressCallback =
    void Function(double progress, int receivedBytes, int? totalBytes);

class UpdateCheckResult {
  final bool updateAvailable;
  final String updateMode; // 'none' | 'shorebird' | 'full'
  final bool forceUpdate;
  final bool mustUpdate;
  final int currentBuild;
  final int currentReleaseEpoch;
  final int latestBuild;
  final int latestReleaseEpoch;
  final String? latestVersion;
  final int minSupportedBuild;
  final String? apkUrl;
  final String? apkHash;
  final int? apkSizeBytes;
  final List<String> changelog;
  final String? message;
  final UpdateScreenContent screen;

  UpdateCheckResult({
    required this.updateAvailable,
    required this.updateMode,
    required this.forceUpdate,
    required this.mustUpdate,
    required this.currentBuild,
    required this.currentReleaseEpoch,
    required this.latestBuild,
    required this.latestReleaseEpoch,
    this.latestVersion,
    required this.minSupportedBuild,
    this.apkUrl,
    this.apkHash,
    this.apkSizeBytes,
    required this.changelog,
    this.message,
    required this.screen,
  });

  factory UpdateCheckResult.fromJson(Map<String, dynamic> json) {
    final changelog =
        (json['changelog'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final screenJson = json['screen'];
    var screen = UpdateScreenContent.fromJson(
      screenJson is Map<String, dynamic> ? screenJson : null,
    );
    if (screen.whatsNew.isEmpty && changelog.isNotEmpty) {
      screen = UpdateScreenContent(
        readyMessage: screen.readyMessage,
        requiredMessage: screen.requiredMessage,
        whatsNewTitle: screen.whatsNewTitle,
        whatsNew: changelog
            .map((line) => UpdateWhatsNewItem(title: line))
            .toList(),
        promo: screen.promo,
        stayConnectedTitle: screen.stayConnectedTitle,
        stayConnectedBody: screen.stayConnectedBody,
      );
    }
    return UpdateCheckResult(
      updateAvailable: json['updateAvailable'] == true,
      updateMode: json['updateMode']?.toString() ?? 'none',
      forceUpdate: json['forceUpdate'] == true,
      mustUpdate: json['mustUpdate'] == true,
      currentBuild: (json['currentBuild'] as num?)?.toInt() ?? 0,
      currentReleaseEpoch: (json['currentReleaseEpoch'] as num?)?.toInt() ?? 1,
      latestBuild: (json['latestBuild'] as num?)?.toInt() ?? 0,
      latestReleaseEpoch: (json['latestReleaseEpoch'] as num?)?.toInt() ?? 1,
      latestVersion: json['latestVersion']?.toString(),
      minSupportedBuild: (json['minSupportedBuild'] as num?)?.toInt() ?? 1,
      apkUrl: json['apkUrl']?.toString(),
      apkHash: json['apkHash']?.toString(),
      apkSizeBytes: (json['apkSizeBytes'] as num?)?.toInt(),
      changelog: changelog,
      message: json['message']?.toString(),
      screen: screen,
    );
  }

  bool get requiresFullInstall => updateMode == 'full' && updateAvailable;

  bool get isBlocking => requiresFullInstall && (forceUpdate || mustUpdate);
}

class UpdateService {
  static const String _appName = 'mobile';
  static const int _releaseEpoch = 2;
  static const MethodChannel _installerChannel = MethodChannel(
    'com.antikra.rembeh/update_installer',
  );

  /// Check backend for updates. Returns null on network errors (non-blocking).
  static Future<UpdateCheckResult?> checkForUpdate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 1;
      final currentVersion = packageInfo.version;
      final platform = Platform.isAndroid ? 'android' : 'ios';
      final session = await SessionStore().read();
      final accessToken = session?.accessToken.trim();
      var tenantId = session?.tenantId?.trim();
      if (tenantId == null || tenantId.isEmpty) {
        tenantId = tenantIdFromAccessToken(accessToken ?? '');
      }

      final uri = Uri.parse('$rembehApiBaseUrl/app/check-update').replace(
        queryParameters: {
          'app': _appName,
          'currentBuild': currentBuild.toString(),
          'currentReleaseEpoch': _releaseEpoch.toString(),
          'platform': platform,
          'currentVersion': currentVersion,
          if (tenantId != null && tenantId.isNotEmpty) 'tenantId': tenantId,
        },
      );

      final response = await http
          .get(
            uri,
            headers: {
              if (accessToken != null && accessToken.isNotEmpty)
                'Authorization': 'Bearer $accessToken',
            },
          )
          .timeout(const Duration(seconds: 8));

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
    DownloadProgressCallback? onProgress,
    String? expectedHash,
    int? expectedSizeBytes,
    Future<String?> Function()? refreshUrl,
  }) async {
    var url = apkUrl;
    for (var attempt = 0; attempt < 4; attempt++) {
      try {
        if (attempt > 0 && refreshUrl != null) {
          url = await refreshUrl() ?? url;
        }
        final path = await _downloadApkOnce(
          url,
          onProgress: onProgress,
          expectedHash: expectedHash,
          expectedSizeBytes: expectedSizeBytes,
        );
        if (path != null) return path;
      } catch (e) {
        debugPrint('[UpdateService] Download attempt ${attempt + 1} failed: $e');
      }
      await Future<void>.delayed(Duration(milliseconds: 400 * (attempt + 1)));
    }
    return null;
  }

  static Future<String?> _downloadApkOnce(
    String apkUrl, {
    DownloadProgressCallback? onProgress,
    String? expectedHash,
    int? expectedSizeBytes,
  }) async {
    final dest = await _destinationFile(expectedHash);
    if (await dest.exists()) {
      final length = await dest.length();
      final looksComplete =
          expectedSizeBytes == null || length >= expectedSizeBytes;
      if (looksComplete &&
          await _hashMatches(dest, expectedHash, skipIfMissing: true)) {
        onProgress?.call(1, length, expectedSizeBytes ?? length);
        _trackDownload();
        return dest.path;
      }
      if (expectedSizeBytes != null &&
          length > 0 &&
          length < expectedSizeBytes) {
        onProgress?.call(length / expectedSizeBytes, length, expectedSizeBytes);
      } else if (await dest.exists()) {
        await dest.delete();
      }
    }

    final uri = Uri.parse(apkUrl);
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 20)
      ..idleTimeout = const Duration(minutes: 3)
      ..maxConnectionsPerHost = 8
      ..autoUncompress = false;

    try {
      var total = expectedSizeBytes;
      var supportsRange = total != null && total > 2 * 1024 * 1024;
      if (total == null) {
        final probed = await _probeSize(client, uri);
        total = probed.total;
        supportsRange = probed.supportsRange;
      }

      final existing =
          await dest.exists() ? await dest.length() : 0;
      if (existing > 0 && total != null && existing < total) {
        await _downloadSingle(
          client,
          uri,
          dest,
          total: total,
          onProgress: onProgress,
          start: existing,
        );
      } else if (supportsRange && total != null && total > 2 * 1024 * 1024) {
        try {
          await _downloadParallel(
            client,
            uri,
            dest,
            total,
            onProgress: onProgress,
          );
        } catch (e) {
          debugPrint('[UpdateService] Parallel download failed, using single: $e');
          await _downloadSingle(
            client,
            uri,
            dest,
            total: total,
            onProgress: onProgress,
          );
        }
      } else {
        await _downloadSingle(
          client,
          uri,
          dest,
          total: total,
          onProgress: onProgress,
        );
      }

      if (!await dest.exists()) return null;
      if (!await _hashMatches(dest, expectedHash, skipIfMissing: true)) {
        await dest.delete();
        throw StateError('Hash mismatch');
      }
      _trackDownload();
      return dest.path;
    } finally {
      client.close(force: true);
    }
  }

  static Future<({int? total, bool supportsRange})> _probeSize(
    HttpClient client,
    Uri uri,
  ) async {
    final request = await client.getUrl(uri).timeout(const Duration(seconds: 20));
    request.headers.set(HttpHeaders.rangeHeader, 'bytes=0-0');
    final response = await request.close().timeout(const Duration(seconds: 20));
    final total = _totalFromResponse(response, null);
    final supportsRange = response.statusCode == 206;
    await response.drain<void>();
    return (total: total, supportsRange: supportsRange);
  }

  static Future<File> _destinationFile(String? expectedHash) async {
    final support = await getApplicationSupportDirectory();
    final dir = Directory('${support.path}/updates');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    final normalized = (expectedHash ?? '')
        .replaceFirst('sha256:', '')
        .toLowerCase();
    final name = normalized.length >= 16
        ? 'rembeh_${normalized.substring(0, 16)}.apk'
        : 'rembeh_latest.apk';
    return File('${dir.path}/$name');
  }

  static int? _totalFromResponse(HttpClientResponse response, int? fallback) {
    final contentRange = response.headers.value(HttpHeaders.contentRangeHeader);
    if (contentRange != null) {
      final match = RegExp(r'\/(\d+)\s*$').firstMatch(contentRange);
      if (match != null) return int.tryParse(match.group(1)!);
    }
    if (response.contentLength > 0 && response.statusCode != 206) {
      return response.contentLength;
    }
    return fallback;
  }

  static Future<void> _downloadSingle(
    HttpClient client,
    Uri uri,
    File dest, {
    int? total,
    DownloadProgressCallback? onProgress,
    int start = 0,
  }) async {
    final request = await client.getUrl(uri).timeout(const Duration(seconds: 20));
    if (start > 0) {
      request.headers.set(HttpHeaders.rangeHeader, 'bytes=$start-');
    }
    final response = await request.close().timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      await response.drain<void>();
      throw HttpException('Download failed (${response.statusCode})');
    }
    await _writeStreamToFile(
      dest,
      response,
      total: total ?? _totalFromResponse(response, null),
      onProgress: onProgress,
      startBytes: start,
      append: start > 0,
    );
  }

  static Future<void> _downloadParallel(
    HttpClient client,
    Uri uri,
    File dest,
    int total, {
    DownloadProgressCallback? onProgress,
  }) async {
    const partCount = 4;
    final chunkSize = (total / partCount).ceil();
    final partDir = Directory('${dest.path}.parts');
    if (await partDir.exists()) {
      await partDir.delete(recursive: true);
    }
    await partDir.create(recursive: true);
    final received = List<int>.filled(partCount, 0);

    void report() {
      final sum = received.fold<int>(0, (a, b) => a + b);
      onProgress?.call(min(1.0, sum / total), sum, total);
    }

    await Future.wait(
      List.generate(partCount, (index) async {
        final start = index * chunkSize;
        if (start >= total) return;
        final end = min(total - 1, start + chunkSize - 1);
        final part = File('${partDir.path}/$index');
        final request = await client
            .getUrl(uri)
            .timeout(const Duration(seconds: 20));
        request.headers.set(HttpHeaders.rangeHeader, 'bytes=$start-$end');
        final response = await request.close().timeout(
          const Duration(seconds: 45),
        );
        if (response.statusCode != 206 && response.statusCode != 200) {
          await response.drain<void>();
          throw HttpException('Range download failed (${response.statusCode})');
        }
        final sink = part.openWrite();
        await for (final chunk in response) {
          sink.add(chunk);
          received[index] += chunk.length;
          report();
        }
        await sink.close();
      }),
    );

    final out = dest.openWrite();
    for (var index = 0; index < partCount; index++) {
      final part = File('${partDir.path}/$index');
      if (await part.exists()) {
        await out.addStream(part.openRead());
      }
    }
    await out.close();
    await partDir.delete(recursive: true);
    onProgress?.call(1, total, total);
  }

  static Future<void> _writeStreamToFile(
    File dest,
    HttpClientResponse response, {
    int? total,
    DownloadProgressCallback? onProgress,
    int startBytes = 0,
    bool append = false,
  }) async {
    if (!append && await dest.exists()) {
      await dest.delete();
    }
    final sink = dest.openWrite(mode: append ? FileMode.append : FileMode.write);
    var received = startBytes;
    await for (final chunk in response.timeout(const Duration(minutes: 45))) {
      sink.add(chunk);
      received += chunk.length;
      final fraction = total != null && total > 0
          ? min(1.0, received / total)
          : 0.0;
      onProgress?.call(fraction, received, total);
    }
    await sink.close();
    if (total != null && total > 0) {
      onProgress?.call(1, received, total);
    }
  }

  static Future<bool> _hashMatches(
    File file,
    String? expectedHash, {
    required bool skipIfMissing,
  }) async {
    if (expectedHash == null || expectedHash.isEmpty) return skipIfMissing;
    final normalizedExpected = expectedHash
        .replaceFirst('sha256:', '')
        .toLowerCase();
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString().toLowerCase() == normalizedExpected;
  }

  static Future<bool> isOnWifi() async {
    try {
      final results = await Connectivity().checkConnectivity();
      return results.contains(ConnectivityResult.wifi);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> canInstallApks() async {
    if (!Platform.isAndroid) return false;
    try {
      return await _installerChannel.invokeMethod<bool>('canInstallApks') ??
          false;
    } on MissingPluginException {
      return true;
    } catch (e) {
      debugPrint('[UpdateService] Install permission check failed: $e');
      return false;
    }
  }

  static Future<InstallPermissionResult> requestInstallPermission() async {
    if (!Platform.isAndroid) return InstallPermissionResult.failed;
    try {
      final nativeResult = await _installerChannel.invokeMethod<String>(
        'requestInstallPermission',
      );
      switch (nativeResult) {
        case 'already_allowed':
          return InstallPermissionResult.alreadyAllowed;
        case 'permission_required':
          return InstallPermissionResult.permissionScreenOpened;
        case 'failed':
          return InstallPermissionResult.failed;
      }
    } on MissingPluginException {
      return InstallPermissionResult.alreadyAllowed;
    } catch (e) {
      debugPrint('[UpdateService] Install permission request failed: $e');
    }
    return InstallPermissionResult.failed;
  }

  static Future<ApkInstallResult> installApk(String filePath) async {
    try {
      if (!Platform.isAndroid) return ApkInstallResult.failed;
      final nativeResult = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': filePath},
      );
      switch (nativeResult) {
        case 'installer_opened':
          return ApkInstallResult.installerOpened;
        case 'permission_required':
          return ApkInstallResult.permissionRequired;
        case 'failed':
          return ApkInstallResult.failed;
      }
    } on MissingPluginException {
      // Older local builds can still use the generic Android file opener.
    } catch (e) {
      debugPrint('[UpdateService] Native install launch failed: $e');
    }

    try {
      final result = await OpenFilex.open(
        filePath,
        type: 'application/vnd.android.package-archive',
      );
      return result.type == ResultType.done
          ? ApkInstallResult.installerOpened
          : ApkInstallResult.failed;
    } catch (e) {
      debugPrint('[UpdateService] Install failed: $e');
      return ApkInstallResult.failed;
    }
  }

  static Future<void> _trackDownload() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      await http.post(
        Uri.parse('$rembehApiBaseUrl/app/track-download'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'app': _appName,
          'buildNumber': int.tryParse(packageInfo.buildNumber) ?? 1,
          'releaseEpoch': _releaseEpoch,
          'platform': Platform.isAndroid ? 'android' : 'ios',
        }),
      );
    } catch (_) {}
  }
}

enum InstallPermissionResult { alreadyAllowed, permissionScreenOpened, failed }

enum ApkInstallResult { installerOpened, permissionRequired, failed }
