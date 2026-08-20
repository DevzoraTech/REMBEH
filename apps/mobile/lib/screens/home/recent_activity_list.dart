import 'package:flutter/material.dart';

import '../../theme.dart';
import '../../utils/money.dart';

class RecentActivityList extends StatelessWidget {
  const RecentActivityList({
    super.key,
    required this.activities,
    this.onViewAll,
  });

  final List<ActivityItem> activities;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    if (activities.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: 'Recent activity',
            onViewAll: onViewAll,
          ),

          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: const Color(0xFFEEF1EF),
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x08000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            child: Column(
              children: List.generate(
                activities.length,
                (index) {
                  final activity = activities[index];
                  final isLast = index == activities.length - 1;

                  return Column(
                    children: [
                      _ActivityItemTile(
                        activity: activity,
                      ),

                      if (!isLast)
                        const Padding(
                          padding: EdgeInsets.only(
                            left: 16,
                            right: 16,
                          ),
                          child: Divider(
                            height: 1,
                            thickness: 1,
                            color: Color(0xFFECEFED),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ActivityItem {
  const ActivityItem({
    required this.initials,
    required this.initialsBackgroundColor,
    required this.name,
    required this.activityType,
    required this.time,
    required this.amount,
    this.isIncome = true,
  });

  final String initials;
  final Color initialsBackgroundColor;
  final String name;
  final String activityType;
  final String time;
  final int amount;
  final bool isIncome;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.onViewAll,
  });

  final String title;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 15,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),

        const Spacer(),

        if (onViewAll != null)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onViewAll,
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: 4,
                  vertical: 3,
                ),
                child: Text(
                  'View all',
                  style: TextStyle(
                    color: forestEmerald,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _ActivityItemTile extends StatelessWidget {
  const _ActivityItemTile({
    required this.activity,
  });

  final ActivityItem activity;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 12,
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: activity.initialsBackgroundColor,
              shape: BoxShape.circle,
            ),
            child: Text(
              activity.initials,
              style: TextStyle(
                color: _avatarTextColor(
                  activity.initialsBackgroundColor,
                ),
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                height: 1,
              ),
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  activity.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    height: 1.05,
                  ),
                ),

                const SizedBox(height: 4),

                Text(
                  '${activity.activityType} • ${activity.time}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 12),

          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              'UGX ${formatMoney(activity.amount)}',
              maxLines: 1,
              style: TextStyle(
                color: activity.isIncome
                    ? forestEmerald
                    : midnightNavy,
                fontSize: 13,
                fontWeight: FontWeight.w900,
                height: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _avatarTextColor(Color background) {
    final luminance = background.computeLuminance();

    if (luminance > 0.65) {
      return forestEmerald;
    }

    return Colors.white;
  }
}