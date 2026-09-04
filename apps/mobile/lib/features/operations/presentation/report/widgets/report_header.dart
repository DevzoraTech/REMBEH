import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../domain/models/report/daily_report_data.dart';
import 'report_typography.dart';

class ReportHeader extends StatelessWidget {
  const ReportHeader({
    super.key,
    required this.report,
  });

  final DailyReportData report;

  @override
  Widget build(BuildContext context) {
    final location = [
      report.branchName.trim(),
      if (_hasValue(report.branchAddress)) report.branchAddress!.trim(),
    ].where((part) => part.isNotEmpty).join(' • ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: forestEmerald.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.apartment_rounded,
              color: forestEmerald,
              size: 18,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          report.organizationName.toUpperCase(),
          textAlign: TextAlign.center,
          style: TextStyle(
            color: forestEmerald,
            fontSize: ReportType.title(context),
            fontWeight: FontWeight.w900,
            letterSpacing: 0.2,
          ),
        ),
        if (location.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            location.toUpperCase(),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: slateText,
              fontSize: ReportType.secondary(context),
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
        const SizedBox(height: 12),
        const Divider(height: 1, thickness: 1, color: forestEmerald),
        const SizedBox(height: 12),
        Text(
          'DAILY RECONCILIATION REPORT',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: forestEmerald,
            fontSize: ReportType.heading(context),
            fontWeight: FontWeight.w900,
            letterSpacing: 0.25,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Report Date',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: slateText,
            fontSize: ReportType.secondary(context),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          _displayDate(report.operationDate),
          textAlign: TextAlign.center,
          style: TextStyle(
            color: midnightNavy,
            fontSize: ReportType.body(context) + 1,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Manager',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: slateText,
            fontSize: ReportType.secondary(context),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          report.managerName.toUpperCase(),
          textAlign: TextAlign.center,
          style: TextStyle(
            color: midnightNavy,
            fontSize: ReportType.body(context),
            fontWeight: FontWeight.w900,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 14),
        const Divider(height: 1, thickness: 1, color: Color(0xFFDCE5DF)),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                children: [
                  Text(
                    'Status',
                    style: TextStyle(
                      color: slateText,
                      fontSize: ReportType.secondary(context),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 5),
                  _ReportStatusBadge(status: report.status),
                ],
              ),
            ),
            Container(
              width: 1,
              height: 42,
              color: const Color(0xFFDCE5DF),
            ),
            Expanded(
              child: Column(
                children: [
                  Text(
                    'Generated',
                    style: TextStyle(
                      color: slateText,
                      fontSize: ReportType.secondary(context),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    _displayGeneratedAt(report.generatedAt),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: ReportType.secondary(context),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ReportStatusBadge extends StatelessWidget {
  const _ReportStatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.trim().toUpperCase();

    final config = switch (normalized) {
      'OWNER_APPROVED' => (
          'Approved',
          forestEmerald,
          const Color(0xFFEAF5ED),
        ),
      'SENT_TO_OWNER' => (
          'Sent to owner',
          const Color(0xFF175CD3),
          const Color(0xFFEFF4FF),
        ),
      'RETURNED_TO_MANAGER' => (
          'Returned',
          const Color(0xFFB42318),
          const Color(0xFFFEF3F2),
        ),
      'MANAGER_REVIEW' => (
          'Manager review',
          const Color(0xFFB54708),
          const Color(0xFFFFFAEB),
        ),
      'OPEN' || 'CLOSING' => (
          'Draft (Not sent)',
          const Color(0xFF8A6100),
          const Color(0xFFFFF4CC),
        ),
      _ => (
          _label(normalized),
          slateText,
          const Color(0xFFF2F4F7),
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: config.$3,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        config.$1,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: config.$2,
          fontSize: ReportType.caption(context),
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

bool _hasValue(String? value) {
  return value != null && value.trim().isNotEmpty;
}

String _displayDate(String raw) {
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) {
    return raw;
  }

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
}

String _displayGeneratedAt(DateTime? value) {
  if (value == null) {
    return 'Not yet generated';
  }

  final local = value.toLocal();
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

  final hour = local.hour == 0
      ? 12
      : local.hour > 12
          ? local.hour - 12
          : local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour >= 12 ? 'PM' : 'AM';

  return '${local.day} ${months[local.month - 1]} ${local.year}, '
      '$hour:$minute $period';
}

String _label(String raw) {
  return raw
      .trim()
      .toLowerCase()
      .split('_')
      .where((word) => word.isNotEmpty)
      .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
}
