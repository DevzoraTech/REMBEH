import 'package:flutter/material.dart';

import '../../../../theme.dart';

class EmptyDayCard extends StatelessWidget {
  const EmptyDayCard({
    super.key,
    required this.canOpen,
    required this.onOpenDay,
    this.blockedMessage,
  });

  final bool canOpen;
  final VoidCallback onOpenDay;
  final String? blockedMessage;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.lock_open_outlined, color: forestEmerald, size: 36),
          const SizedBox(height: 10),
          const Text(
            'Day not open',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: midnightNavy,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            blockedMessage ??
                'Open the branch day before recording cash, float, expenses, and reconciliation.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: slateText,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: canOpen ? onOpenDay : null,
            child: const Text('Open Day'),
          ),
        ],
      ),
    );
  }
}
