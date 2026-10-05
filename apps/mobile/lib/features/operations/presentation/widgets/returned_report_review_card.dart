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
      padding: const EdgeInsets.all(16),
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
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF2CF),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Icon(
                  Icons.assignment_return_outlined,
                  color: gold,
                  size: 30,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Returned report needs review',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Report for $reportDate was returned. Re-check figures and resubmit.',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 14,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Returned by $returnedBy  ·  $returnedAt',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
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
