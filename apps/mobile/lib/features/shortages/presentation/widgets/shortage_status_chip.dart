import 'package:flutter/material.dart';

import '../../../../theme.dart';

Color shortageStatusColor(bool open) {
  return open ? const Color(0xFFD92D20) : forestEmerald;
}

class ShortageStatusChip extends StatelessWidget {
  const ShortageStatusChip({
    super.key,
    required this.open,
    this.compact = true,
  });

  final bool open;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tone = shortageStatusColor(open);
    final background = open ? const Color(0xFFFDECEC) : const Color(0xFFEAF5ED);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 7 : 8,
        vertical: compact ? 4 : 5,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        open ? 'Open' : 'Closed',
        style: TextStyle(
          color: tone,
          fontSize: compact ? 8 : 9,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
