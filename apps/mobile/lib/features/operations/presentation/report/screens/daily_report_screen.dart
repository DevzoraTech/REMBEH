import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../../application/report/load_daily_report.dart';
import '../../../data/mappers/daily_report_mapper.dart';
import '../../../data/repositories/daily_report_repository_impl.dart';
import '../../../domain/models/report/daily_report_data.dart';
import '../pdf/daily_report_pdf_builder.dart';
import '../pdf/daily_report_pdf_cache.dart';

const _rembehWebUrl = 'https://rembeh.antikra.com';

/// Opens a daily report as a locally cached professional PDF.
///
/// List screens only pass metadata. Full data is fetched (or taken from an
/// optional list [reportPayload] snapshot) the first time the PDF is needed,
/// then reused from device storage until the report fingerprint changes.
class DailyReportScreen extends StatefulWidget {
  const DailyReportScreen({
    super.key,
    required this.session,
    this.reportId,
    this.date,
    this.branchId,
    this.reportPayload,
  }) : assert(
          reportId != null || date != null,
          'Either reportId or date must be provided.',
        );

  final RembehSession session;

  /// Persisted report id (from history).
  final String? reportId;

  /// Live / draft day (from day reconciliation).
  final String? date;
  final String? branchId;

  /// Optional list-row payload. When it already includes `snapshot`,
  /// we can build the PDF without a second network round-trip.
  final Map<String, dynamic>? reportPayload;

  @override
  State<DailyReportScreen> createState() => _DailyReportScreenState();
}

class _DailyReportScreenState extends State<DailyReportScreen> {
  final _cache = const DailyReportPdfCache();
  final _builder = const DailyReportPdfBuilder();
  final _shareButtonKey = GlobalKey();

  bool _loading = true;
  String? _error;
  Uint8List? _bytes;
  File? _file;
  String _title = 'Daily report';
  String? _shareName;
  String? _branchLabel;
  PdfControllerPinch? _pdfController;
  double _zoom = 1;
  bool _fullscreen = false;

  static const _minZoom = 0.75;
  static const _maxZoom = 4.0;
  static const _zoomStep = 0.25;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  @override
  void dispose() {
    _pdfController?.removeListener(_onZoomChanged);
    _pdfController?.dispose();
    super.dispose();
  }

  void _onZoomChanged() {
    final controller = _pdfController;
    if (controller == null || !mounted) return;
    final next = controller.value.getMaxScaleOnAxis();
    if ((next - _zoom).abs() < 0.01) return;
    setState(() => _zoom = next);
  }

  Future<void> _prepare() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final reportId = widget.reportId;
      final isPersisted = reportId != null && reportId.isNotEmpty;

      DailyReportData data;
      String fingerprint;

      if (isPersisted) {
        final listMeta = widget.reportPayload;
        fingerprint = DailyReportPdfCache.fingerprint(
          reportId: reportId,
          generatedAt: _string(listMeta?['generatedAt']),
          status: _string(listMeta?['status']),
          operationDate: _string(listMeta?['operationDate']),
        );

        final cached = await _cache.find(
          reportId: reportId,
          fingerprint: fingerprint,
        );
        if (cached != null) {
          final bytes = await cached.readAsBytes();
          if (!mounted) return;
          await _showPdf(
            bytes: bytes,
            file: cached,
            title: _dateTitle(_string(listMeta?['operationDate'])),
            shareName: _fileName(
              operationDate: _string(listMeta?['operationDate']),
              branchName: widget.session.branchName,
            ),
            branchLabel: widget.session.branchName,
          );
          return;
        }

        data = await _loadPersistedData(reportId, listMeta);
        fingerprint = DailyReportPdfCache.fingerprint(
          reportId: reportId,
          generatedAt: data.generatedAt?.toIso8601String(),
          status: data.status,
          operationDate: data.operationDate,
        );

        final stillCached = await _cache.find(
          reportId: reportId,
          fingerprint: fingerprint,
        );
        if (stillCached != null) {
          final bytes = await stillCached.readAsBytes();
          if (!mounted) return;
          await _showPdf(
            bytes: bytes,
            file: stillCached,
            title: _dateTitle(data.operationDate),
            shareName: _fileName(
              operationDate: data.operationDate,
              branchName: data.branchName,
            ),
            branchLabel: data.branchName,
          );
          return;
        }
      } else {
        data = await _loadLiveData();
        fingerprint = DailyReportPdfCache.fingerprint(
          reportId: 'live-${data.operationDate}',
          generatedAt: data.generatedAt?.toIso8601String() ??
              DateTime.now().toIso8601String(),
          status: data.status,
          operationDate: data.operationDate,
        );
      }

      final bytes = Uint8List.fromList(await _builder.build(data));
      File? file;
      if (isPersisted) {
        final listFingerprint = DailyReportPdfCache.fingerprint(
          reportId: reportId,
          generatedAt: _string(widget.reportPayload?['generatedAt']) ??
              data.generatedAt?.toIso8601String(),
          status: _string(widget.reportPayload?['status']) ?? data.status,
          operationDate:
              _string(widget.reportPayload?['operationDate']) ??
              data.operationDate,
        );
        file = await _cache.save(
          reportId: reportId,
          fingerprint: listFingerprint,
          bytes: bytes,
        );
      }

      if (!mounted) return;
      await _showPdf(
        bytes: bytes,
        file: file,
        title: _dateTitle(data.operationDate),
        shareName: _fileName(
          operationDate: data.operationDate,
          branchName: data.branchName,
        ),
        branchLabel: data.branchName,
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error is Exception
            ? error.toString().replaceFirst('Exception: ', '')
            : 'Could not prepare this report.';
      });
    }
  }

  Future<void> _showPdf({
    required Uint8List bytes,
    required String title,
    required String shareName,
    File? file,
    String? branchLabel,
  }) async {
    _pdfController?.removeListener(_onZoomChanged);
    _pdfController?.dispose();

    final controller = PdfControllerPinch(
      document: PdfDocument.openData(bytes),
    );
    controller.addListener(_onZoomChanged);

    setState(() {
      _bytes = bytes;
      _file = file;
      _title = title;
      _shareName = shareName;
      _branchLabel = branchLabel;
      _pdfController = controller;
      _zoom = 1;
      _loading = false;
      _error = null;
    });
  }

  Future<DailyReportData> _loadPersistedData(
    String reportId,
    Map<String, dynamic>? listMeta,
  ) async {
    final snapshot = listMeta?['snapshot'];
    if (listMeta != null && snapshot is Map) {
      return DailyReportMapper.fromReportPayload(
        report: listMeta,
        organizationName: widget.session.workspaceName,
        fallbackBranchName: widget.session.branchName,
        fallbackBranchAddress: widget.session.branchAddress,
        fallbackManagerName: widget.session.userName,
      );
    }

    final repository = DailyReportRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );
    return repository.getPersistedReport(
      session: widget.session,
      reportId: reportId,
    );
  }

  Future<DailyReportData> _loadLiveData() async {
    final date = widget.date;
    if (date == null || date.isEmpty) {
      throw Exception('Report date is missing.');
    }
    final useCase = LoadDailyReport(
      DailyReportRepositoryImpl(apiClient: ApiClient(SessionStore())),
    );
    return useCase.live(
      session: widget.session,
      date: date,
      branchId: widget.branchId,
    );
  }

  void _setZoom(double next) {
    final controller = _pdfController;
    if (controller == null) return;
    final clamped = next.clamp(_minZoom, _maxZoom);
    final current = controller.value.getMaxScaleOnAxis();
    if (current <= 0) return;
    final factor = clamped / current;
    controller.value = Matrix4.copy(controller.value)
      ..scaleByDouble(factor, factor, factor, 1);
    setState(() => _zoom = clamped);
  }

  void _zoomIn() => _setZoom(_zoom + _zoomStep);

  void _zoomOut() => _setZoom(_zoom - _zoomStep);

  void _resetZoom() {
    final controller = _pdfController;
    if (controller == null) return;
    controller.value = Matrix4.identity();
    setState(() => _zoom = 1);
  }

  String _shareMessage() {
    final branch = (_branchLabel ?? widget.session.branchName)?.trim();
    final buffer = StringBuffer()
      ..writeln('Daily Reconciliation Report — $_title');
    if (branch != null && branch.isNotEmpty) {
      buffer.writeln(branch);
    }
    buffer
      ..writeln()
      ..writeln('Shared from REMBEH')
      ..writeln('Generated by REMBEH')
      ..writeln(_rembehWebUrl);
    return buffer.toString().trimRight();
  }

  Rect? _shareOrigin() {
    final box =
        _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  Future<void> _share() async {
    final bytes = _bytes;
    if (bytes == null) return;

    final name = _shareName ?? 'daily-report.pdf';
    final file = _file ?? File('${Directory.systemTemp.path}/$name');
    if (_file == null) {
      await file.writeAsBytes(bytes, flush: true);
    }

    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile(file.path, mimeType: 'application/pdf', name: name),
        ],
        subject: 'Daily Reconciliation Report · REMBEH',
        text: _shareMessage(),
        sharePositionOrigin: _shareOrigin(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: _fullscreen
          ? AppBar(
              backgroundColor: midnightNavy,
              foregroundColor: Colors.white,
              elevation: 0,
              title: Text(
                _title,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              actions: [
                IconButton(
                  tooltip: 'Exit full screen',
                  onPressed: () => setState(() => _fullscreen = false),
                  icon: const Icon(Icons.fullscreen_exit_rounded),
                ),
                if (_bytes != null)
                  IconButton(
                    key: _shareButtonKey,
                    tooltip: 'Share',
                    onPressed: _share,
                    icon: const Icon(Icons.ios_share_rounded),
                  ),
              ],
            )
          : AppBar(
              backgroundColor: Colors.white,
              foregroundColor: midnightNavy,
              elevation: 0,
              scrolledUnderElevation: 0,
              title: Text(
                _title,
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              actions: [
                if (_bytes != null) ...[
                  IconButton(
                    tooltip: 'Zoom out',
                    onPressed: _zoom <= _minZoom ? null : _zoomOut,
                    icon: const Icon(Icons.zoom_out_rounded),
                  ),
                  TextButton(
                    onPressed: _zoom == 1 ? null : _resetZoom,
                    child: Text(
                      '${(_zoom * 100).round()}%',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Zoom in',
                    onPressed: _zoom >= _maxZoom ? null : _zoomIn,
                    icon: const Icon(Icons.zoom_in_rounded),
                  ),
                  IconButton(
                    tooltip: 'Full screen',
                    onPressed: () => setState(() => _fullscreen = true),
                    icon: const Icon(Icons.fullscreen_rounded),
                  ),
                  IconButton(
                    key: _shareButtonKey,
                    tooltip: 'Share',
                    onPressed: _share,
                    icon: const Icon(Icons.ios_share_rounded),
                  ),
                ],
              ],
            ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: forestEmerald),
            SizedBox(height: 14),
            Text(
              'Preparing report PDF…',
              style: TextStyle(
                color: slateText,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.description_outlined,
                color: slateText,
                size: 36,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: slateText,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _prepare,
                style: FilledButton.styleFrom(backgroundColor: forestEmerald),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
    }

    final controller = _pdfController;
    if (controller == null) {
      return const SizedBox.shrink();
    }

    return Column(
      children: [
        Expanded(
          child: PdfViewPinch(
            controller: controller,
            backgroundDecoration: BoxDecoration(
              color: _fullscreen ? Colors.black : softIvory,
            ),
            onDocumentError: (error) {
              if (!mounted) return;
              setState(() {
                _error = 'Could not open this PDF.';
              });
            },
          ),
        ),
        if (!_fullscreen)
          SafeArea(
            top: false,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: line)),
              ),
              child: const Text(
                'Pinch to zoom · Shared reports include REMBEH attribution',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: slateText,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

String? _string(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

String _dateTitle(String? operationDate) {
  if (operationDate == null || operationDate.isEmpty) {
    return 'Daily report';
  }
  final parsed = DateTime.tryParse(operationDate);
  if (parsed == null) return operationDate;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
}

String _fileName({String? operationDate, String? branchName}) {
  final date = (operationDate ?? 'report').replaceAll('/', '-');
  final branch = (branchName ?? 'branch')
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-');
  return 'rembeh-$branch-$date.pdf';
}
