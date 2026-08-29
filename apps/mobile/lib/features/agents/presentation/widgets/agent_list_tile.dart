import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/agent_summary.dart';

class AgentListTile extends StatelessWidget {
  const AgentListTile({super.key, required this.agent, required this.onTap});

  final AgentSummary agent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            _AgentAvatar(agent: agent),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          agent.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _StatusChip(status: agent.status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    agent.phone ?? agent.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      if (agent.publicId != null) ...[
                        Text(
                          agent.publicId!,
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 10),
                      ],
                      Expanded(
                        child: Text(
                          _activityLabel(agent),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 9,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right_rounded, color: slateText, size: 20),
          ],
        ),
      ),
    );
  }
}

class _AgentAvatar extends StatelessWidget {
  const _AgentAvatar({required this.agent});

  final AgentSummary agent;

  @override
  Widget build(BuildContext context) {
    if (agent.hasPhoto) {
      return CircleAvatar(
        radius: 22,
        backgroundImage: NetworkImage(agent.photoUrl!),
        backgroundColor: const Color(0xFFE9EEF0),
      );
    }

    return CircleAvatar(
      radius: 22,
      backgroundColor: const Color(0xFFE9EEF0),
      child: Text(
        _initials(agent.name),
        style: const TextStyle(
          color: forestEmerald,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.toUpperCase();

    final config = switch (normalized) {
      'ACTIVE' => ('Active', forestEmerald, const Color(0xFFEAF5ED)),
      'SUSPENDED' => (
        'Suspended',
        const Color(0xFFB42318),
        const Color(0xFFFEF3F2),
      ),
      'INVITED' => (
        'Pending',
        const Color(0xFF175CD3),
        const Color(0xFFEFF4FF),
      ),
      'PENDING_VERIFICATION' => (
        'Pending',
        const Color(0xFFB54708),
        const Color(0xFFFFFAEB),
      ),
      _ => ('Inactive', slateText, const Color(0xFFF2F4F7)),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: config.$3,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        config.$1,
        style: TextStyle(
          color: config.$2,
          fontSize: 8,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

String _activityLabel(AgentSummary agent) {
  if (agent.isActive) {
    return '${agent.collectionsToday} collections • ${agent.applicationsToday} loans today';
  }

  final lastActive = agent.lastActiveAt;

  if (lastActive == null) {
    return 'No field activity yet';
  }

  final local = lastActive.toLocal();

  return 'Last active ${local.day}/${local.month}/${local.year}';
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) {
    return 'A';
  }

  if (parts.length == 1) {
    return parts.first
        .substring(0, parts.first.length.clamp(0, 2))
        .toUpperCase();
  }

  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
