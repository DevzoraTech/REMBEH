import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/operation_dashboard_data.dart';
import '../../domain/utils/operation_formatters.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class OperationsStatusCard extends StatelessWidget {
  const OperationsStatusCard({super.key, required this.operation});

  final OperationDashboardData operation;

  @override
  Widget build(BuildContext context) {
    final title = _isSameLocalDay(operation.operationDate, DateTime.now())
        ? 'Today\'s Operations'
        : '${operationDate(operation.operationDate)} Operations';

    return OpsSurface(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const OpsIcon(icon: Icons.calendar_today_outlined),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w900,
                    height: 1.05,
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Text(
                      operationDate(operation.operationDate),
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6),
                      child: Text(
                        '•',
                        style: TextStyle(color: slateText, fontSize: 10),
                      ),
                    ),
                    Text(
                      operation.isOpen ? 'Open' : operation.status,
                      style: TextStyle(
                        color: operation.isOpen ? forestEmerald : slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                if (operation.openedAt != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Opened at ${operationTime(operation.openedAt)}'
                    '${operation.openedBy != null ? ' by ${operation.openedBy}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (operation.isOpen) const _OpenChip(),
        ],
      ),
    );
  }
}

bool _isSameLocalDay(DateTime left, DateTime right) {
  final a = left.toLocal();
  final b = right.toLocal();

  return a.year == b.year && a.month == b.month && a.day == b.day;
}

class _OpenChip extends StatelessWidget {
  const _OpenChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 11),
      decoration: BoxDecoration(
        color: forestEmerald.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: forestEmerald.withValues(alpha: 0.16)),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 5,
            height: 5,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: forestEmerald,
                shape: BoxShape.circle,
              ),
            ),
          ),
          SizedBox(width: 6),
          Text(
            'Open',
            style: TextStyle(
              color: forestEmerald,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
