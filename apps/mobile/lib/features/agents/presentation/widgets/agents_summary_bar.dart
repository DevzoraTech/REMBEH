import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/agents_overview.dart';

class AgentsSummaryBar extends StatelessWidget {
  const AgentsSummaryBar({super.key, required this.counts});

  final AgentCounts counts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _SummaryItem(label: 'All', value: counts.total),
        ),
        Expanded(
          child: _SummaryItem(label: 'Active', value: counts.active),
        ),
        Expanded(
          child: _SummaryItem(label: 'Suspended', value: counts.suspended),
        ),
        Expanded(
          child: _SummaryItem(label: 'Inactive', value: counts.inactive),
        ),
      ],
    );
  }
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          '$value',
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 9.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
