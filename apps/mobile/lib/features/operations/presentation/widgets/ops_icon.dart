import 'package:flutter/material.dart';

import '../../../../theme.dart';

class OpsIcon extends StatelessWidget {
  const OpsIcon({
    super.key,
    required this.icon,
    this.foregroundColor = forestEmerald,
    this.backgroundColor = const Color(0xFFEAF5EC),
  });

  final IconData icon;
  final Color foregroundColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 33,
      height: 33,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: backgroundColor, shape: BoxShape.circle),
      child: Icon(icon, color: foregroundColor, size: 18),
    );
  }
}
