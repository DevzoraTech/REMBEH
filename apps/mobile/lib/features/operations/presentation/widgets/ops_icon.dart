import 'package:flutter/material.dart';

import '../../../../theme.dart';

class OpsIcon extends StatelessWidget {
  const OpsIcon({
    super.key,
    required this.icon,
  });

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 33,
      height: 33,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: Color(0xFFEAF5EC),
        shape: BoxShape.circle,
      ),
      child: Icon(
        icon,
        color: forestEmerald,
        size: 18,
      ),
    );
  }
}