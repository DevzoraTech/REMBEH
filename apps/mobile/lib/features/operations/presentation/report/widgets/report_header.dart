import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../domain/models/report/daily_report_data.dart';

class ReportHeader extends StatelessWidget {
  const ReportHeader({
    super.key,
    required this.report,
  });

  final DailyReportData report;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _OrganizationIdentity(
          organizationName: report.organizationName,
          branchName: report.branchName,
          branchAddress: report.branchAddress,
          branchPhone: report.branchPhone,
          branchEmail: report.branchEmail,
        ),
        const SizedBox(height: 14),
        const Divider(
          height: 1,
          thickness: 1,
          color: forestEmerald,
        ),
        const SizedBox(height: 11),
        const Text(
          'DAILY RECONCILIATION REPORT',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: forestEmerald,
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 13),
        _ReportMetadata(
          report: report,
        ),
        const SizedBox(height: 11),
        const Divider(
          height: 1,
          thickness: 1,
          color: forestEmerald,
        ),
      ],
    );
  }
}

class _OrganizationIdentity extends StatelessWidget {
  const _OrganizationIdentity({
    required this.organizationName,
    required this.branchName,
    this.branchAddress,
    this.branchPhone,
    this.branchEmail,
  });

  final String organizationName;
  final String branchName;

  final String? branchAddress;
  final String? branchPhone;
  final String? branchEmail;

  @override
  Widget build(BuildContext context) {
    final hasContact =
        _hasValue(branchPhone) ||
        _hasValue(branchEmail);

    return Column(
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          child: const Icon(
            Icons.apartment_rounded,
            color: forestEmerald,
            size: 36,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          organizationName.toUpperCase(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: forestEmerald,
            fontSize: 13,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.15,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          branchName,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 9.5,
            fontWeight: FontWeight.w800,
          ),
        ),
        if (_hasValue(branchAddress)) ...[
          const SizedBox(height: 3),
          Text(
            branchAddress!.trim(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: slateText,
              fontSize: 8,
              height: 1.25,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
        if (hasContact) ...[
          const SizedBox(height: 5),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment:
                WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 4,
            children: [
              if (_hasValue(branchPhone))
                _ContactItem(
                  icon:
                      Icons.phone_outlined,
                  value:
                      branchPhone!.trim(),
                ),
              if (_hasValue(branchEmail))
                _ContactItem(
                  icon:
                      Icons.mail_outline_rounded,
                  value:
                      branchEmail!.trim(),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ContactItem extends StatelessWidget {
  const _ContactItem({
    required this.icon,
    required this.value,
  });

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize:
          MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 10,
          color: midnightNavy,
        ),
        const SizedBox(width: 4),
        Text(
          value,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 7.5,
            fontWeight:
                FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ReportMetadata extends StatelessWidget {
  const _ReportMetadata({
    required this.report,
  });

  final DailyReportData report;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          const EdgeInsets.symmetric(
        horizontal: 8,
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              children: [
                _MetadataRow(
                  label: 'Report ID',
                  value:
                      report.reportNumber,
                ),
                const SizedBox(height: 7),
                _MetadataRow(
                  label: 'Report Date',
                  value:
                      _displayDate(
                    report.operationDate,
                  ),
                ),
                const SizedBox(height: 7),
                _MetadataRow(
                  label: 'Manager',
                  value:
                      report.managerName,
                ),
              ],
            ),
          ),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              children: [
                _MetadataRow(
                  label: 'Status',
                  valueWidget:
                      _ReportStatusBadge(
                    status:
                        report.status,
                  ),
                ),
                const SizedBox(height: 7),
                _MetadataRow(
                  label: 'Generated',
                  value:
                      _displayGeneratedAt(
                    report.generatedAt,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({
    required this.label,
    this.value,
    this.valueWidget,
  });

  final String label;
  final String? value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment:
          CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 66,
          child: Text(
            label,
            style: const TextStyle(
              color: slateText,
              fontSize: 7.5,
              fontWeight:
                  FontWeight.w700,
            ),
          ),
        ),
        const Text(
          ':',
          style: TextStyle(
            color: slateText,
            fontSize: 7.5,
            fontWeight:
                FontWeight.w700,
          ),
        ),
        const SizedBox(width: 7),
        Expanded(
          child:
              valueWidget ??
              Text(
                value ?? '—',
                style:
                    const TextStyle(
                  color: midnightNavy,
                  fontSize: 7.7,
                  height: 1.25,
                  fontWeight:
                      FontWeight.w700,
                ),
              ),
        ),
      ],
    );
  }
}

class _ReportStatusBadge extends StatelessWidget {
  const _ReportStatusBadge({
    required this.status,
  });

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized =
        status.trim().toUpperCase();

    final config = switch (normalized) {
      'OWNER_APPROVED' => (
          'Approved',
          forestEmerald,
          const Color(
            0xFFEAF5ED,
          ),
        ),
      'SENT_TO_OWNER' => (
          'Sent to owner',
          const Color(
            0xFF175CD3,
          ),
          const Color(
            0xFFEFF4FF,
          ),
        ),
      'RETURNED_TO_MANAGER' => (
          'Returned',
          const Color(
            0xFFB42318,
          ),
          const Color(
            0xFFFEF3F2,
          ),
        ),
      'MANAGER_REVIEW' => (
          'Manager review',
          const Color(
            0xFFB54708,
          ),
          const Color(
            0xFFFFFAEB,
          ),
        ),
      'OPEN' => (
          'Draft (Not sent)',
          const Color(
            0xFF8A6100,
          ),
          const Color(
            0xFFFFF4CC,
          ),
        ),
      'CLOSING' => (
          'Draft (Not sent)',
          const Color(
            0xFF8A6100,
          ),
          const Color(
            0xFFFFF4CC,
          ),
        ),
      _ => (
          _label(normalized),
          slateText,
          const Color(
            0xFFF2F4F7,
          ),
        ),
    };

    return Align(
      alignment:
          Alignment.centerLeft,
      child: Container(
        padding:
            const EdgeInsets.symmetric(
          horizontal: 7,
          vertical: 2.5,
        ),
        decoration: BoxDecoration(
          color: config.$3,
          borderRadius:
              BorderRadius.circular(
            3,
          ),
        ),
        child: Text(
          config.$1,
          style: TextStyle(
            color: config.$2,
            fontSize: 7,
            fontWeight:
                FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

bool _hasValue(String? value) {
  return value != null &&
      value.trim().isNotEmpty;
}

String _displayDate(String raw) {
  final parsed =
      DateTime.tryParse(raw);

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

  return '${parsed.day} '
      '${months[parsed.month - 1]} '
      '${parsed.year}';
}

String _displayGeneratedAt(
  DateTime? value,
) {
  if (value == null) {
    return 'Not yet generated';
  }

  final local =
      value.toLocal();

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

  final minute =
      local.minute
          .toString()
          .padLeft(2, '0');

  final period =
      local.hour >= 12
          ? 'PM'
          : 'AM';

  return '${local.day} '
      '${months[local.month - 1]} '
      '${local.year}, '
      '$hour:$minute $period';
}

String _label(String raw) {
  return raw
      .trim()
      .toLowerCase()
      .split('_')
      .where(
        (word) =>
            word.isNotEmpty,
      )
      .map(
        (word) =>
            '${word[0].toUpperCase()}'
            '${word.substring(1)}',
      )
      .join(' ');
}