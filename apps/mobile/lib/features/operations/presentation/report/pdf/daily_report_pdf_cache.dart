import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'daily_report_pdf_builder.dart';

/// Local on-device cache for generated daily-report PDFs.
///
/// Keyed by report id + content fingerprint so a regenerated report
/// (new status / generatedAt) invalidates the old file automatically.
class DailyReportPdfCache {
  const DailyReportPdfCache();

  static const _folder = 'daily_reports_pdf';

  /// Stable fingerprint from metadata available on the list row or
  /// the full report payload.
  static String fingerprint({
    required String reportId,
    String? generatedAt,
    String? status,
    String? operationDate,
  }) {
    final generated = _normalizeInstant(generatedAt);
    final raw = [
      DailyReportPdfBuilder.layoutVersion,
      reportId.trim(),
      generated,
      (status ?? '').trim().toUpperCase(),
      (operationDate ?? '').trim(),
    ].join('|');
    return sha1.convert(raw.codeUnits).toString().substring(0, 16);
  }

  static String _normalizeInstant(String? raw) {
    if (raw == null || raw.trim().isEmpty) return '';
    final parsed = DateTime.tryParse(raw.trim());
    if (parsed == null) return raw.trim();
    return parsed.toUtc().toIso8601String();
  }

  Future<Directory> _dir() async {
    final root = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(root.path, _folder));
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  Future<File> fileFor({
    required String reportId,
    required String fingerprint,
  }) async {
    final dir = await _dir();
    final safeId = reportId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return File(p.join(dir.path, '${safeId}_$fingerprint.pdf'));
  }

  Future<File?> find({
    required String reportId,
    required String fingerprint,
  }) async {
    final file = await fileFor(
      reportId: reportId,
      fingerprint: fingerprint,
    );
    if (await file.exists() && await file.length() > 0) {
      return file;
    }
    return null;
  }

  Future<File> save({
    required String reportId,
    required String fingerprint,
    required List<int> bytes,
  }) async {
    await _purgeOtherVersions(reportId: reportId, keepFingerprint: fingerprint);
    final file = await fileFor(
      reportId: reportId,
      fingerprint: fingerprint,
    );
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> _purgeOtherVersions({
    required String reportId,
    required String keepFingerprint,
  }) async {
    final dir = await _dir();
    final safeId = reportId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    final prefix = '${safeId}_';
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (!name.startsWith(prefix) || !name.endsWith('.pdf')) continue;
      if (name == '${safeId}_$keepFingerprint.pdf') continue;
      try {
        await entity.delete();
      } catch (_) {
        // Best-effort cleanup.
      }
    }
  }
}
