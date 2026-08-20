import 'package:flutter/material.dart';

import '../../theme.dart';

/// Quick action button for manager/owner home screen
typedef QuickActionCallback = void Function();

class QuickActionButton extends StatelessWidget {
  const QuickActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.backgroundColor = forestEmerald,
  });

  final IconData icon;
  final String label;
  final QuickActionCallback onTap;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: backgroundColor,
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Icon(
                icon,
                color: Colors.white,
                size: 28,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                height: 1.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Row of quick action buttons
class QuickActionsRow extends StatelessWidget {
  const QuickActionsRow({
    super.key,
    required this.actions,
  });

  final List<QuickAction> actions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Quick actions',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 110,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: actions.length,
            itemBuilder: (context, index) {
              final action = actions[index];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: QuickActionButton(
                  icon: action.icon,
                  label: action.label,
                  backgroundColor: action.backgroundColor,
                  onTap: action.onTap,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class QuickAction {
  final IconData icon;
  final String label;
  final QuickActionCallback onTap;
  final Color backgroundColor;

  QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.backgroundColor = forestEmerald,
  });
}
