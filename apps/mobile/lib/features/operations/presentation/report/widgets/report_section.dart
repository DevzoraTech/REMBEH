import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import 'report_typography.dart';

class ReportSection extends StatelessWidget {
  const ReportSection({
    super.key,
    required this.title,
    required this.child,
    this.sectionNumber,
    this.subtitle,
    this.trailing,
    this.showDivider = false,
  });

  final String title;
  final int? sectionNumber;

  final String? subtitle;

  final Widget child;

  final Widget? trailing;

  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final heading = sectionNumber == null
        ? title
        : '$sectionNumber. ${title.toUpperCase()}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showDivider) ...[
          const Divider(height: 1, color: forestEmerald),
          const SizedBox(height: 10),
        ],

        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                heading,
                style: TextStyle(
                  color: forestEmerald,
                  fontSize: ReportType.section(context),
                  height: 1.2,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 12), trailing!],
          ],
        ),

        if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
          const SizedBox(height: 3),
          Text(
            subtitle!,
            style: TextStyle(
              color: slateText,
              fontSize: ReportType.secondary(context),
              height: 1.3,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],

        const SizedBox(height: 7),

        child,
      ],
    );
  }
}
