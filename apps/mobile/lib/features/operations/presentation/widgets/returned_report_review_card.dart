import 'package:flutter/material.dart';

import '../../../../theme.dart';

class ReturnedReportReviewCard extends StatelessWidget {
  const ReturnedReportReviewCard({
    super.key,
    required this.reportDate,
    required this.returnedBy,
    required this.returnedAt,
    required this.onReview,
  });

  final String reportDate;
  final String returnedBy;
  final String returnedAt;
  final VoidCallback? onReview;

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFC98A00);
    const paleGold = Color(0xFFFFFAEC);
    const goldBorder = Color(0xFFF0C75E);

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: paleGold,
        border: Border.all(color: goldBorder),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF2CF),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Icon(
                  Icons.assignment_return_outlined,
                  color: gold,
                  size: 26,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Returned report needs review',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Report for $reportDate was returned. Re-check figures and resubmit.',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Returned by $returnedBy  ·  $returnedAt',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 43,
            child: FilledButton(
              onPressed: onReview,
              style: FilledButton.styleFrom(
                backgroundColor: gold,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
              ),
              child: const Text(
                'Review returned report',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
