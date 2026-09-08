import 'package:flutter/material.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../../../../utils/friendly_errors.dart';
import '../../../../../utils/money.dart';
import '../pdf/daily_report_pdf_cache.dart';
import 'daily_report_screen.dart';

/// Manager flow for a report returned for correction — mirrors web
/// ReturnedReportPanel: review figures, then resubmit to owner.
class ReturnedReportScreen extends StatefulWidget {
  const ReturnedReportScreen({
    super.key,
    required this.session,
    required this.reportId,
    this.listPayload,
  });

  final RembehSession session;
  final String reportId;
  final Map<String, dynamic>? listPayload;

  @override
  State<ReturnedReportScreen> createState() => _ReturnedReportScreenState();
}

class _ReturnedReportScreenState extends State<ReturnedReportScreen> {
  final _api = ApiClient(SessionStore());
  final _notesController = TextEditingController();
  final _cache = const DailyReportPdfCache();

  bool _loading = true;
  bool _checkingCorrections = false;
  bool _submitting = false;
  bool _correctionsBlocking = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _report;

  @override
  void initState() {
    super.initState();
    // ignore: discarded_futures
    _load();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _notice = null;
    });

    try {
      await _cache.invalidate(widget.reportId);
      final payload = await _api.getOperationReport(
        session: widget.session,
        reportId: widget.reportId,
      );
      final reportRaw = payload['report'];
      final report = reportRaw is Map
          ? Map<String, dynamic>.from(reportRaw)
          : <String, dynamic>{};
      if (report.isEmpty) {
        throw ApiException('Returned report was not found.');
      }

      if (!mounted) return;
      setState(() {
        _report = report;
        _loading = false;
        _checkingCorrections = true;
      });

      final operationDate = '${report['operationDate'] ?? ''}'.trim();
      final blocking = operationDate.isEmpty
          ? false
          : await _hasPendingCorrectionBlockers(operationDate);
      if (!mounted) return;
      setState(() {
        _correctionsBlocking = blocking;
        _checkingCorrections = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _checkingCorrections = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  Future<bool> _hasPendingCorrectionBlockers(String operationDate) async {
    try {
      final results = await Future.wait([
        _api.listRepaymentCorrectionRequests(
          session: widget.session,
          status: 'APPROVED',
        ),
        _api.listRepaymentCorrectionRequests(
          session: widget.session,
          status: 'PENDING',
        ),
      ]);
      for (final request in [...results[0], ...results[1]]) {
        if ('${request['operationDate'] ?? ''}'.trim() != operationDate) {
          continue;
        }
        if (request['correctionAppliedAt'] != null) continue;
        final status = '${request['status'] ?? ''}'.toUpperCase();
        if (status == 'APPROVED') return true;
        if (request['ownerAuthorizedAt'] != null) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> _openPdf() async {
    final report = _report;
    if (report == null) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => DailyReportScreen(
          session: widget.session,
          reportId: widget.reportId,
          reportPayload: report,
        ),
      ),
    );
  }

  Future<void> _resubmit() async {
    if (_submitting || _correctionsBlocking || _report == null) return;
    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });

    try {
      await _api.managerConfirmOperationReport(
        session: widget.session,
        reportId: widget.reportId,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );
      await _cache.invalidate(widget.reportId);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _submitting = false;
      });
    }
  }

  String _dateLabel(Object? raw) {
    final text = '$raw'.trim();
    if (text.length < 10) return text.isEmpty ? '—' : text;
    final parts = text.substring(0, 10).split('-');
    if (parts.length != 3) return text;
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
    final month = int.tryParse(parts[1]) ?? 0;
    final day = int.tryParse(parts[2]) ?? 0;
    final year = parts[0];
    if (month < 1 || month > 12 || day < 1) return text;
    return '$day ${months[month - 1]} $year';
  }

  num? _num(Object? value) {
    if (value is num) return value;
    return num.tryParse('$value');
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    final dateLabel = _dateLabel(
      report?['operationDate'] ?? widget.listPayload?['operationDate'],
    );
    final returnNotes =
        '${report?['returnNotes'] ?? widget.listPayload?['returnNotes'] ?? ''}'
            .trim();
    final expected = _num(
      report?['expectedClosingBalance'] ??
          widget.listPayload?['expectedClosingBalance'],
    );
    final counted = _num(
      report?['closingBalance'] ?? widget.listPayload?['closingBalance'],
    );
    final variance = _num(
      report?['closingVariance'] ?? widget.listPayload?['closingVariance'],
    );
    final collections = _num(
      report?['collectionsReceived'] ??
          widget.listPayload?['collectionsReceived'],
    );

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Returned report',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: forestEmerald),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFAF3),
                    borderRadius: rembehBorderRadius(rembehRadiusLg),
                    border: Border.all(color: const Color(0xFFF5D0A9)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        returnNotes.isEmpty
                            ? 'This report was returned so you can re-check figures and resubmit.'
                            : returnNotes,
                        style: const TextStyle(
                          color: slateText,
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: rembehBorderRadius(rembehRadiusLg),
                    border: Border.all(color: line),
                  ),
                  child: Column(
                    children: [
                      _MetricRow(
                        label: 'Collections',
                        value: collections == null
                            ? '—'
                            : 'UGX ${formatCompactMoney(collections)}',
                      ),
                      const Divider(height: 18),
                      _MetricRow(
                        label: 'Expected closing',
                        value: expected == null
                            ? '—'
                            : 'UGX ${formatCompactMoney(expected)}',
                      ),
                      const Divider(height: 18),
                      _MetricRow(
                        label: 'Counted cash',
                        value: counted == null
                            ? '—'
                            : 'UGX ${formatCompactMoney(counted)}',
                      ),
                      const Divider(height: 18),
                      _MetricRow(
                        label: 'Variance',
                        value: variance == null
                            ? '—'
                            : 'UGX ${formatCompactMoney(variance)}',
                        valueColor: variance == null
                            ? midnightNavy
                            : variance < 0
                                ? const Color(0xFFB42318)
                                : variance > 0
                                    ? forestEmerald
                                    : midnightNavy,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _openPdf,
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: const Text('View full report'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: forestEmerald,
                    side: const BorderSide(color: forestEmerald),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    textStyle: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (_checkingCorrections) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(color: forestEmerald),
                ],
                if (_correctionsBlocking) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3F2),
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(color: const Color(0xFFFDA29B)),
                    ),
                    child: const Text(
                      'Finish applying repayment corrections for this day before resubmitting the report.',
                      style: TextStyle(
                        color: Color(0xFFB42318),
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                const Text(
                  'Manager notes (optional)',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _notesController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Add a note for the owner…',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      borderSide: const BorderSide(color: line),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      borderSide: const BorderSide(color: line),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    style: const TextStyle(
                      color: Color(0xFFB42318),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (_notice != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _notice!,
                    style: const TextStyle(
                      color: forestEmerald,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _correctionsBlocking || _submitting
                      ? null
                      : _resubmit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded),
                  label: Text(
                    _submitting ? 'Sending…' : 'Resubmit to owner',
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: forestEmerald,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    textStyle: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({
    required this.label,
    required this.value,
    this.valueColor = midnightNavy,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              color: slateText,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: valueColor,
            fontWeight: FontWeight.w800,
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}
