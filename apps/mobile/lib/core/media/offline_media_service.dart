import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../database/local_database.dart';

/// Service for managing offline media (photos/documents)
class OfflineMediaService {
  final LocalDatabase _db = LocalDatabase.instance;
  static const _uuid = Uuid();

  /// Directory for storing pending media files
  Future<Directory> get _pendingMediaDir async {
    final appDir = await getApplicationDocumentsDirectory();
    final mediaDir = Directory('${appDir.path}/pending_media');
    if (!await mediaDir.exists()) {
      await mediaDir.create(recursive: true);
    }
    return mediaDir;
  }

  /// Queue a photo for upload (compress and store locally)
  Future<QueuedMedia> queuePhoto({
    required File photoFile,
    required String entityType,
    required String entityId,
    String? caption,
    int quality = 85,
  }) async {
    // Compress the image
    final compressed = await _compressImage(photoFile, quality: quality);

    // Generate unique ID and filename
    final mediaId = _uuid.v4();
    final extension = _getFileExtension(photoFile.path).isEmpty
        ? 'jpg'
        : _getFileExtension(photoFile.path);
    final filename = '$mediaId.$extension';

    // Save compressed file to pending media directory
    final mediaDir = await _pendingMediaDir;
    final savedFile = File('${mediaDir.path}/$filename');
    await savedFile.writeAsBytes(compressed);

    // Get file info
    final fileSize = compressed.length;
    final mimeType = _getMimeType(extension);

    // Insert into database
    final database = await _db.database;
    await database.insert('pending_media', {
      'media_id': mediaId,
      'entity_type': entityType,
      'entity_id': entityId,
      'local_path': savedFile.path,
      'filename': filename,
      'mime_type': mimeType,
      'file_size': fileSize,
      'caption': caption,
      'upload_status': MediaUploadStatus.pending,
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });

    return QueuedMedia(
      mediaId: mediaId,
      entityType: entityType,
      entityId: entityId,
      localPath: savedFile.path,
      filename: filename,
      mimeType: mimeType,
      fileSize: fileSize,
      caption: caption,
      uploadStatus: MediaUploadStatus.pending,
      createdAt: DateTime.now(),
    );
  }

  /// Queue already-loaded media bytes for upload.
  Future<QueuedMedia> queueBytes({
    required Uint8List bytes,
    required String entityType,
    required String entityId,
    required String filename,
    required String mimeType,
    String? caption,
  }) async {
    final mediaId = _uuid.v4();
    final extension = _getFileExtension(filename).isEmpty
        ? _getExtensionForMimeType(mimeType)
        : _getFileExtension(filename);
    final savedName = '$mediaId.$extension';

    final mediaDir = await _pendingMediaDir;
    final savedFile = File('${mediaDir.path}/$savedName');
    await savedFile.writeAsBytes(bytes);

    final database = await _db.database;
    await database.insert('pending_media', {
      'media_id': mediaId,
      'entity_type': entityType,
      'entity_id': entityId,
      'local_path': savedFile.path,
      'filename': filename.trim().isEmpty ? savedName : filename.trim(),
      'mime_type': mimeType,
      'file_size': bytes.length,
      'caption': caption,
      'upload_status': MediaUploadStatus.pending,
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });

    return QueuedMedia(
      mediaId: mediaId,
      entityType: entityType,
      entityId: entityId,
      localPath: savedFile.path,
      filename: filename.trim().isEmpty ? savedName : filename.trim(),
      mimeType: mimeType,
      fileSize: bytes.length,
      caption: caption,
      uploadStatus: MediaUploadStatus.pending,
      createdAt: DateTime.now(),
    );
  }

  /// Compress image to reduce file size
  Future<Uint8List> _compressImage(File file, {int quality = 85}) async {
    final result = await FlutterImageCompress.compressWithFile(
      file.absolute.path,
      quality: quality,
      minWidth: 1920,
      minHeight: 1080,
    );

    if (result == null) {
      // If compression fails, use original file
      return await file.readAsBytes();
    }

    return result;
  }

  /// Get all pending media for upload
  Future<List<QueuedMedia>> getPendingMedia() async {
    final database = await _db.database;
    final results = await database.query(
      'pending_media',
      where: 'upload_status = ?',
      whereArgs: [MediaUploadStatus.pending],
      orderBy: 'created_at ASC',
    );

    return results.map((row) => QueuedMedia.fromMap(row)).toList();
  }

  /// Get failed media uploads
  Future<List<QueuedMedia>> getFailedMedia() async {
    final database = await _db.database;
    final results = await database.query(
      'pending_media',
      where: 'upload_status = ? AND retry_count < ?',
      whereArgs: [MediaUploadStatus.failed, 5],
      orderBy: 'created_at ASC',
    );

    return results.map((row) => QueuedMedia.fromMap(row)).toList();
  }

  /// Get pending media for a single locally-created entity.
  Future<List<QueuedMedia>> getPendingMediaForEntity({
    required String entityType,
    required String entityId,
  }) async {
    final database = await _db.database;
    final results = await database.query(
      'pending_media',
      where: 'entity_type = ? AND entity_id = ? AND upload_status = ?',
      whereArgs: [entityType, entityId, MediaUploadStatus.pending],
      orderBy: 'created_at ASC',
    );

    return results.map((row) => QueuedMedia.fromMap(row)).toList();
  }

  /// Mark media as uploaded
  Future<void> markAsUploaded({
    required String mediaId,
    required String storageKey,
    required String publicUrl,
  }) async {
    final database = await _db.database;
    await database.update(
      'pending_media',
      {
        'upload_status': MediaUploadStatus.uploaded,
        'storage_key': storageKey,
        'public_url': publicUrl,
        'uploaded_at': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'media_id = ?',
      whereArgs: [mediaId],
    );
  }

  /// Mark media upload as failed
  Future<void> markAsFailed({
    required String mediaId,
    required String error,
    int? retryCount,
  }) async {
    final database = await _db.database;
    await database.update(
      'pending_media',
      {
        'upload_status': MediaUploadStatus.failed,
        'last_error': error,
        'retry_count': retryCount ?? 0,
      },
      where: 'media_id = ?',
      whereArgs: [mediaId],
    );
  }

  /// Clean up uploaded media files
  Future<void> cleanupUploadedMedia({int olderThanDays = 7}) async {
    final database = await _db.database;

    // Get uploaded media older than specified days
    final cutoffTime = DateTime.now()
        .subtract(Duration(days: olderThanDays))
        .millisecondsSinceEpoch;

    final results = await database.query(
      'pending_media',
      where: 'upload_status = ? AND uploaded_at < ?',
      whereArgs: [MediaUploadStatus.uploaded, cutoffTime],
    );

    // Delete files and database records
    for (final row in results) {
      final localPath = row['local_path'] as String?;
      if (localPath != null) {
        final file = File(localPath);
        if (await file.exists()) {
          await file.delete();
        }
      }
    }

    // Delete database records
    await database.delete(
      'pending_media',
      where: 'upload_status = ? AND uploaded_at < ?',
      whereArgs: [MediaUploadStatus.uploaded, cutoffTime],
    );
  }

  /// Get pending upload count
  Future<int> getPendingCount() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT COUNT(*) as count FROM pending_media WHERE upload_status = ?',
      [MediaUploadStatus.pending],
    );
    return result.first['count'] as int? ?? 0;
  }

  /// Get total size of pending uploads
  Future<int> getPendingTotalSize() async {
    final database = await _db.database;
    final result = await database.rawQuery(
      'SELECT SUM(file_size) as total FROM pending_media WHERE upload_status = ?',
      [MediaUploadStatus.pending],
    );
    return result.first['total'] as int? ?? 0;
  }

  String _getFileExtension(String path) {
    final parts = path.split('.');
    if (parts.length < 2) {
      return '';
    }
    return parts.last.toLowerCase();
  }

  String _getExtensionForMimeType(String mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'application/pdf':
        return 'pdf';
      default:
        return 'jpg';
    }
  }

  String _getMimeType(String extension) {
    switch (extension.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }
}

/// Queued media item
class QueuedMedia {
  final String mediaId;
  final String entityType;
  final String entityId;
  final String localPath;
  final String filename;
  final String mimeType;
  final int fileSize;
  final String? caption;
  final String uploadStatus;
  final String? storageKey;
  final String? publicUrl;
  final String? lastError;
  final int retryCount;
  final DateTime createdAt;
  final DateTime? uploadedAt;

  QueuedMedia({
    required this.mediaId,
    required this.entityType,
    required this.entityId,
    required this.localPath,
    required this.filename,
    required this.mimeType,
    required this.fileSize,
    this.caption,
    required this.uploadStatus,
    this.storageKey,
    this.publicUrl,
    this.lastError,
    this.retryCount = 0,
    required this.createdAt,
    this.uploadedAt,
  });

  factory QueuedMedia.fromMap(Map<String, dynamic> map) {
    return QueuedMedia(
      mediaId: map['media_id'] as String,
      entityType: map['entity_type'] as String,
      entityId: map['entity_id'] as String,
      localPath: map['local_path'] as String,
      filename: map['filename'] as String,
      mimeType: map['mime_type'] as String,
      fileSize: map['file_size'] as int,
      caption: map['caption'] as String?,
      uploadStatus: map['upload_status'] as String,
      storageKey: map['storage_key'] as String?,
      publicUrl: map['public_url'] as String?,
      lastError: map['last_error'] as String?,
      retryCount: map['retry_count'] as int? ?? 0,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      uploadedAt: map['uploaded_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['uploaded_at'] as int)
          : null,
    );
  }

  bool get isPending => uploadStatus == MediaUploadStatus.pending;
  bool get isFailed => uploadStatus == MediaUploadStatus.failed;
  bool get isUploaded => uploadStatus == MediaUploadStatus.uploaded;
}

/// Media upload status constants
class MediaUploadStatus {
  static const String pending = 'PENDING';
  static const String uploading = 'UPLOADING';
  static const String uploaded = 'UPLOADED';
  static const String failed = 'FAILED';
}
