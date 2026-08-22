import 'package:flutter/material.dart';

import '../../../../../theme.dart';

class SalaryAvatar extends StatelessWidget {
  const SalaryAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.radius = 24,
  });

  final String name;
  final String? photoUrl;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();

    return CircleAvatar(
      radius: radius,
      backgroundColor: sage,
      backgroundImage: photoUrl != null && photoUrl!.isNotEmpty
          ? NetworkImage(photoUrl!)
          : null,
      child: photoUrl == null || photoUrl!.isEmpty
          ? Text(
              initials.isEmpty ? 'E' : initials,
              style: TextStyle(
                color: forestEmerald,
                fontSize: radius * 0.58,
                fontWeight: FontWeight.w900,
              ),
            )
          : null,
    );
  }
}
