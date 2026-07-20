import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/di/loan_application_locator.dart';
import '../features/loan_application/domain/entities/loan_application.dart';
import '../theme.dart';
import '../utils/money.dart';

/// Opens loan-application detail (not repayment client detail).
Future<void> showApplicationDetailsSheet(
  BuildContext context, {
  required String applicationId,
  String? fallbackName,
  String? fallbackPhone,
  int? fallbackAmount,
  int? fallbackInterestPercent,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (context) => ApplicationDetailsSheet(
      applicationId: applicationId,
      fallbackName: fallbackName,
      fallbackPhone: fallbackPhone,
      fallbackAmount: fallbackAmount,
      fallbackInterestPercent: fallbackInterestPercent,
    ),
  );
}

class ApplicationDetailsSheet extends StatefulWidget {
  const ApplicationDetailsSheet({
    super.key,
    required this.applicationId,
    this.fallbackName,
    this.fallbackPhone,
    this.fallbackAmount,
    this.fallbackInterestPercent,
  });

  final String applicationId;
  final String? fallbackName;
  final String? fallbackPhone;
  final int? fallbackAmount;
  final int? fallbackInterestPercent;

  @override
  State<ApplicationDetailsSheet> createState() =>
      _ApplicationDetailsSheetState();
}

class _ApplicationDetailsSheetState extends State<ApplicationDetailsSheet> {
  bool _loading = true;
  String? _error;
  LoanApplication? _application;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final application = await LoanApplicationLocator.instance.getById(
        widget.applicationId,
      );
      if (!mounted) return;
      setState(() {
        _application = application;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _copyPhone(String phone) async {
    await Clipboard.setData(ClipboardData(text: phone));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Copied $phone')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height * 0.92;
    final app = _application;
    final name = (app?.fullName.isNotEmpty == true)
        ? app!.fullName
        : (widget.fallbackName?.trim().isNotEmpty == true
            ? widget.fallbackName!.trim()
            : 'Applicant');
    final phone = (app?.phone?.trim().isNotEmpty == true)
        ? app!.phone!.trim()
        : (widget.fallbackPhone ?? '—');
    final amount = app?.principalAmount?.round() ?? widget.fallbackAmount ?? 0;
    final interest =
        app?.interestRatePercent?.round() ?? widget.fallbackInterestPercent ?? 0;
    final status = app?.status ?? 'SUBMITTED';
    final initials = _initials(name);

    return SizedBox(
      height: height,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, color: line),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                    children: [
                      if (_error != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFEBEE),
                            border: Border.all(color: const Color(0xFFEF9A9A)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _error!,
                                style: const TextStyle(
                                  color: Color(0xFFC62828),
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextButton(
                                onPressed: _load,
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              color: sage,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              initials,
                              style: const TextStyle(
                                color: forestEmerald,
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(
                                    color: midnightNavy,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 18,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  phone,
                                  style: const TextStyle(
                                    color: slateText,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Application · $status',
                                  style: const TextStyle(
                                    color: forestEmerald,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (phone != '—')
                            IconButton(
                              onPressed: () => _copyPhone(phone),
                              style: IconButton.styleFrom(
                                side: const BorderSide(color: forestEmerald),
                                foregroundColor: forestEmerald,
                              ),
                              icon: const Icon(Icons.phone),
                            ),
                          IconButton(
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.close, color: slateText),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: _SummaryTile(
                              label: 'Amount requested',
                              child: Text(
                                formatMoney(amount),
                                style: const TextStyle(
                                  color: forestEmerald,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 20,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _SummaryTile(
                              label: 'Interest',
                              child: Text(
                                '$interest%',
                                style: const TextStyle(
                                  color: midnightNavy,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 20,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: softIvory,
                          border: Border.all(color: line),
                        ),
                        child: Column(
                          children: [
                            _DetailRow(
                              label: 'National ID',
                              value: app?.nationalId ?? '—',
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Duration',
                              value: app?.durationDays != null
                                  ? '${app!.durationDays} days'
                                  : '—',
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Location',
                              value: [
                                app?.district,
                                app?.subCounty,
                                app?.parish,
                                app?.village,
                              ]
                                  .whereType<String>()
                                  .map((part) => part.trim())
                                  .where((part) => part.isNotEmpty)
                                  .join(' · ')
                                  .ifEmpty('—'),
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Guarantor',
                              value: [
                                app?.guarantorName,
                                app?.guarantorPhone,
                              ]
                                  .whereType<String>()
                                  .map((part) => part.trim())
                                  .where((part) => part.isNotEmpty)
                                  .join(' · ')
                                  .ifEmpty('—'),
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Media uploaded',
                              value: app == null || app.mediaTypes.isEmpty
                                  ? '—'
                                  : '${app.mediaTypes.length} item(s)',
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Signatures',
                              value: app == null || app.signatures.isEmpty
                                  ? '—'
                                  : app.signatures
                                      .map((s) => s.signerRole)
                                      .join(', '),
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(
                              label: 'Application ID',
                              value: widget.applicationId,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _initials(String fullName) {
    final parts = fullName
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'AP';
    if (parts.length == 1) {
      return parts.first.substring(0, parts.first.length.clamp(0, 2)).toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: softIvory,
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: slateText,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(color: slateText, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
