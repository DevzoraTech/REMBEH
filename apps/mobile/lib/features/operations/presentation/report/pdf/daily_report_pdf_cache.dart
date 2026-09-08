import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'daily_report_pdf_builder.dart';

/// Local on-device cache for generated daily-report PDFs.
///
/// Keyed by report id + content fingerprint so a regenerated report
/// (new status / generatedAt / figures) invalidates the old file and
/// purges prior versions for that report id.
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
    String? ownerNotes,
    num? collectionsReceived,
    num? expectedClosingBalance,
    num? closingVariance,
    num? closingBalance,
  }) {
    final generated = _normalizeInstant(generatedAt);
    final raw = [
      DailyReportPdfBuilder.layoutVersion,
      reportId.trim(),
      generated,
      (status ?? '').trim().toUpperCase(),
      (operationDate ?? '').trim(),
      (ownerNotes ?? '').trim(),
      _moneyKey(collectionsReceived),
      _moneyKey(expectedClosingBalance),
      _moneyKey(closingVariance),
      _moneyKey(closingBalance),
    ].join('|');
    return sha1.convert(raw.codeUnits).toString().substring(0, 16);
  }

  /// Fingerprint from a list/detail report map (including summary fields).
  static String fingerprintFromReport(Map<String, dynamic> report) {
    final snapshot = report['snapshot'];
    final summary = snapshot is Map ? snapshot['summary'] : null;
    final summaryMap = summary is Map
        ? Map<String, dynamic>.from(summary)
        : const <String, dynamic>{};

    return fingerprint(
      reportId: '${report['id'] ?? ''}'.trim(),
      generatedAt: _asString(report['generatedAt']) ??
          _asString(snapshot is Map ? snapshot['generatedAt'] : null),
      status: _asString(report['status']),
      operationDate: _asString(report['operationDate']),
      ownerNotes: _asString(report['ownerNotes']),
      collectionsReceived: _asNum(
        report['collectionsReceived'] ?? summaryMap['collectionsReceived'],
      ),
      expectedClosingBalance: _asNum(
        report['expectedClosingBalance'] ??
            summaryMap['expectedClosingBalance'],
      ),
      closingVariance: _asNum(
        report['closingVariance'] ?? summaryMap['variance'],
      ),
      closingBalance: _asNum(
        report['closingBalance'] ?? summaryMap['countedCash'],
      ),
    );
  }

  static String _moneyKey(num? value) {
    if (value == null) return '';
    return value.toStringAsFixed(2);
  }

  static String? _asString(Object? value) {
    if (value == null) return null;
    final text = '$value'.trim();
    return text.isEmpty ? null : text;
  }

  static num? _asNum(Object? value) {
    if (value is num) return value;
    return num.tryParse('$value');
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
    await invalidate(reportId, keepFingerprint: fingerprint);
    final file = await fileFor(
      reportId: reportId,
      fingerprint: fingerprint,
    );
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  /// Deletes cached PDFs for [reportId]. When [keepFingerprint] is set,
  /// that version is retained.
  Future<void> invalidate(
    String reportId, {
    String? keepFingerprint,
  }) async {
    final dir = await _dir();
    final safeId = reportId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    final prefix = '${safeId}_';
    final keepName = keepFingerprint == null
        ? null
        : '${safeId}_$keepFingerprint.pdf';
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (!name.startsWith(prefix) || !name.endsWith('.pdf')) continue;
      if (keepName != null && name == keepName) continue;
      try {
        await entity.delete();
      } catch (_) {
        // Best-effort cleanup.
      }
    }
  }
}
