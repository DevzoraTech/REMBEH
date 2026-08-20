import 'package:flutter/material.dart';

import '../../../../theme.dart';

class OpsSurface extends StatelessWidget {
  const OpsSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        border: Border.all(color: line),
        boxShadow: [
          BoxShadow(
            color: midnightNavy.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: child,
    );
  }
}