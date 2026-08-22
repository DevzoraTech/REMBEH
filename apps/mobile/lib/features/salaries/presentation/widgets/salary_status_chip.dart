import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../utils/salary_formatters.dart';

class SalaryStatusChip extends StatelessWidget {
  const SalaryStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.toUpperCase();
    final color = switch (normalized) {
      'PAID' => forestEmerald,
      'PARTIAL' => const Color(0xFFC05A00),
      _ => const Color(0xFFD92D20),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        paymentStatusLabel(status),
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
