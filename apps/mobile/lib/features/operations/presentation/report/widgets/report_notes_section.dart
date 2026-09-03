import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../domain/models/report/daily_report_data.dart';
import 'report_section.dart';
import 'report_typography.dart';

class ReportNotesSection extends StatelessWidget {
  const ReportNotesSection({super.key, required this.report});

  final DailyReportData report;

  @override
  Widget build(BuildContext context) {
    final notes = report.managerNotes?.trim();

    if (notes == null || notes.isEmpty) {
      return const SizedBox.shrink();
    }

    return ReportSection(
      title: 'Reconciliation notes',
      subtitle: 'Notes recorded during day reconciliation',
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: const Color(0xFFF8F9FA),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Text(
            notes,
            style: TextStyle(
              color: midnightNavy,
              fontSize: ReportType.body(context),
              height: 1.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
