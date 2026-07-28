import 'package:flutter/material.dart';

import '../../theme.dart';

class TasksTab extends StatelessWidget {
  const TasksTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          const Text(
            'Tasks',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusLg),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.task_alt, color: forestEmerald, size: 30),
                SizedBox(height: 12),
                Text(
                  'No assigned tasks yet',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'New tasks from your manager will appear here.',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _TaskTypePreview(
            icon: Icons.person_pin_circle_outlined,
            title: 'Visit customer',
            text: 'For scheduled field follow-ups.',
          ),
          _TaskTypePreview(
            icon: Icons.description_outlined,
            title: 'Collect agreement',
            text: 'For signed loan paperwork.',
          ),
          _TaskTypePreview(
            icon: Icons.camera_alt_outlined,
            title: 'Verify customer',
            text: 'For photos, notes, and GPS checks.',
          ),
        ],
      ),
    );
  }
}

class _TaskTypePreview extends StatelessWidget {
  const _TaskTypePreview({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Icon(icon, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  text,
                  style: const TextStyle(color: slateText, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
