import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../../utils/money.dart';
import '../../domain/models/agent_float_position.dart';
import '../../domain/utils/operation_formatters.dart';
import 'ops_icon.dart';
import 'ops_surface.dart';

class AgentFloatCard extends StatelessWidget {
  const AgentFloatCard({
    super.key,
    required this.agents,
    required this.totalFloat,
    required this.canAllocate,
    required this.onAllocateFloat,
    this.onViewAll,
  });

  final List<AgentFloatPosition> agents;
  final num totalFloat;
  final bool canAllocate;

  final VoidCallback onAllocateFloat;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final visibleAgents = agents.take(2).toList();

    return OpsSurface(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 11, 14, 9),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const OpsIcon(
                  icon: Icons.people_outline_rounded,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Agent float',
                        style: TextStyle(
                          color: midnightNavy,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'UGX ${formatMoney(totalFloat)}',
                        style: const TextStyle(
                          color: forestEmerald,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 1),
                      const Text(
                        'Currently with agents',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (onViewAll != null)
                      InkWell(
                        onTap: onViewAll,
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 2),
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
                    if (canAllocate) ...[
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        onPressed: onAllocateFloat,
                        icon: const Icon(
                          Icons.add,
                          size: 15,
                        ),
                        label: const Text('Allocate float'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: forestEmerald,
                          side: const BorderSide(
                            color: forestEmerald,
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 11,
                            vertical: 6,
                          ),
                          minimumSize: Size.zero,
                          tapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          textStyle: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (visibleAgents.isNotEmpty)
            const Divider(
              height: 1,
              color: Color(0xFFE8ECE9),
            ),
          ...List.generate(
            visibleAgents.length,
            (index) {
              final agent = visibleAgents[index];

              return Column(
                children: [
                  _AgentFloatRow(
                    agent: agent,
                    onTap: onViewAll,
                  ),
                  if (index != visibleAgents.length - 1)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 14),
                      child: Divider(
                        height: 1,
                        color: Color(0xFFE8ECE9),
                      ),
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

class _AgentFloatRow extends StatelessWidget {
  const _AgentFloatRow({
    required this.agent,
    this.onTap,
  });

  final AgentFloatPosition agent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 8,
        ),
        child: Row(
          children: [
            Container(
              width: 33,
              height: 33,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Color(0xFFE8F4EA),
                shape: BoxShape.circle,
              ),
              child: Text(
                operationInitials(agent.name),
                style: const TextStyle(
                  color: forestEmerald,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    agent.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'Agent',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 9,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'UGX ${formatMoney(agent.remainingFloat)}',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Remaining',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 8,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 7),
            const Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: slateText,
            ),
          ],
        ),
      ),
    );
  }
}