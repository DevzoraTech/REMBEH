import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../../utils/money.dart';
import '../../domain/models/operation_activity.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class OperationsActivityCard extends StatelessWidget {
  const OperationsActivityCard({
    super.key,
    required this.activities,
    this.onViewAll,
  });

  final List<OperationActivity> activities;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    return OpsSurface(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
            child: Row(
              children: [
                const OpsIcon(
                  icon: Icons.history_rounded,
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Today\'s activity',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                if (onViewAll != null)
                  InkWell(
                    onTap: onViewAll,
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 3),
                      child: Text(
                        'View all',
                        style: TextStyle(
                          color: forestEmerald,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          ...List.generate(
            activities.length,
            (index) {
              return Column(
                children: [
                  if (index > 0)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 14),
                      child: Divider(
                        height: 1,
                        color: Color(0xFFE8ECE9),
                      ),
                    ),
                  _ActivityRow(
                    activity: activities[index],
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({
    required this.activity,
  });

  final OperationActivity activity;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 8,
      ),
      child: Row(
        children: [
          Container(
            width: 31,
            height: 31,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: activity.isIncome
                  ? forestEmerald.withValues(alpha: 0.08)
                  : const Color(0xFFFFEEEE),
              shape: BoxShape.circle,
            ),
            child: Icon(
              activity.isIncome
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              size: 16,
              color: activity.isIncome
                  ? forestEmerald
                  : const Color(0xFFC62828),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  activity.title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  activity.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 9,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Text(
            activity.time,
            style: const TextStyle(
              color: slateText,
              fontSize: 9,
            ),
          ),
          const SizedBox(width: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              '${activity.isIncome ? '+' : '−'} UGX ${formatMoney(activity.amount)}',
              style: TextStyle(
                color: activity.isIncome
                    ? forestEmerald
                    : const Color(0xFFC62828),
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}