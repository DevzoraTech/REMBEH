import 'dart:io';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'offline_media_service.dart';
import '../auth/auth_manager.dart';

/// Service for uploading queued media files to server
class MediaUploadService {
  final OfflineMediaService _mediaService;
  final AuthManager _authManager;
  final String _baseUrl;

  MediaUploadService(this._mediaService, this._authManager, this._baseUrl);

  /// Upload all pending media files
  Future<MediaUploadResult> uploadPendingMedia() async {
    final pending = await _mediaService.getPendingMedia();
    final failed = await _mediaService.getFailedMedia();

    final allMedia = [...pending, ...failed];

    if (allMedia.isEmpty) {
      return MediaUploadResult(
        success: true,
        uploadedCount: 0,
        failedCount: 0,
      );
    }

    // Get auth token
    final token = await _authManager.getAccessToken();
    if (token == null) {
      return MediaUploadResult(
        success: false,
        error: 'Not authenticated',
      );
    }

    int uploadedCount = 0;
    int failedCount = 0;
    final errors = <String>[];

    // Upload each media file
    for (final media in allMedia) {
      try {
        await _uploadSingleMedia(media, token);
        uploadedCount++;
      } catch (e) {
        failedCount++;
        errors.add('${media.filename}: ${e.toString()}');
        await _mediaService.markAsFailed(
          mediaId: media.mediaId,
          error: e.toString(),
          retryCount: media.retryCount + 1,
        );
      }
    }

    return MediaUploadResult(
      success: failedCount == 0,
      uploadedCount: uploadedCount,
      failedCount: failedCount,
      errors: errors.isNotEmpty ? errors : null,
    );
  }

  /// Upload a single media file using presigned URL flow
  Future<void> _uploadSingleMedia(QueuedMedia media, String token) async {
    // Step 1: Request presigned URL from server
    final presignUri = Uri.parse('$_baseUrl/api/v1/storage/presign');
    final presignResponse = await http.post(
      presignUri,
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'mimeType': media.mimeType,
        'fileSize': media.fileSize,
        'entityType': media.entityType,
        'entityId': media.entityId,
      }),
    ).timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        throw Exception('Presign request timeout');
      },
    );

    if (presignResponse.statusCode != 200 && presignResponse.statusCode != 201) {
      throw Exception(
        'Failed to get presigned URL: ${presignResponse.statusCode}',
      );
    }

    final presignData = jsonDecode(presignResponse.body);
    final uploadUrl = presignData['uploadUrl'] as String?;
    final storageKey = presignData['storageKey'] as String?;

    if (uploadUrl == null || storageKey == null) {
      throw Exception('Invalid presign response');
    }

    // Step 2: Upload file to presigned URL (S3)
    final file = File(media.localPath);
    if (!await file.exists()) {
      throw Exception('Local file not found');
    }

    final bytes = await file.readAsBytes();
    final uploadResponse = await http.put(
      Uri.parse(uploadUrl),
      headers: {
        'Content-Type': media.mimeType,
        'Content-Length': bytes.length.toString(),
      },
      body: bytes,
    ).timeout(
      const Duration(seconds: 120),
      onTimeout: () {
        throw Exception('File upload timeout');
      },
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw Exception('Failed to upload file: ${uploadResponse.statusCode}');
    }

    // Step 3: Confirm upload with server
    final confirmUri = Uri.parse('$_baseUrl/api/v1/storage/confirm');
    final confirmResponse = await http.post(
      confirmUri,
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'storageKey': storageKey,
        'mimeType': media.mimeType,
        'fileSize': media.fileSize,
        'entityType': media.entityType,
        'entityId': media.entityId,
        'caption': media.caption,
      }),
    ).timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        throw Exception('Confirm request timeout');
      },
    );

    if (confirmResponse.statusCode != 200 && confirmResponse.statusCode != 201) {
      throw Exception(
        'Failed to confirm upload: ${confirmResponse.statusCode}',
      );
    }

    final confirmData = jsonDecode(confirmResponse.body);
    final publicUrl = confirmData['publicUrl'] as String?;

    // Step 4: Mark as uploaded in local database
    await _mediaService.markAsUploaded(
      mediaId: media.mediaId,
      storageKey: storageKey,
      publicUrl: publicUrl ?? '',
    );
  }

  /// Upload media for a specific entity (e.g., loan application)
  Future<MediaUploadResult> uploadMediaForEntity({
    required String entityType,
    required String entityId,
  }) async {
    final database = await _mediaService._db.database;
    final results = await database.query(
      'pending_media',
      where: 'entity_type = ? AND entity_id = ? AND upload_status = ?',
      whereArgs: [entityType, entityId, MediaUploadStatus.pending],
    );

    if (results.isEmpty) {
      return MediaUploadResult(
        success: true,
        uploadedCount: 0,
        failedCount: 0,
      );
    }

    final token = await _authManager.getAccessToken();
    if (token == null) {
      return MediaUploadResult(
        success: false,
        error: 'Not authenticated',
      );
    }

    int uploadedCount = 0;
    int failedCount = 0;
    final errors = <String>[];

    for (final row in results) {
      final media = QueuedMedia.fromMap(row);
      try {
        await _uploadSingleMedia(media, token);
        uploadedCount++;
      } catch (e) {
        failedCount++;
        errors.add('${media.filename}: ${e.toString()}');
        await _mediaService.markAsFailed(
          mediaId: media.mediaId,
          error: e.toString(),
          retryCount: media.retryCount + 1,
        );
      }
    }

    return MediaUploadResult(
      success: failedCount == 0,
      uploadedCount: uploadedCount,
      failedCount: failedCount,
      errors: errors.isNotEmpty ? errors : null,
    );
  }
}

/// Result of media upload operation
class MediaUploadResult {
  final bool success;
  final int? uploadedCount;
  final int? failedCount;
  final List<String>? errors;
  final String? error;

  MediaUploadResult({
    required this.success,
    this.uploadedCount,
    this.failedCount,
    this.errors,
    this.error,
  });
}
