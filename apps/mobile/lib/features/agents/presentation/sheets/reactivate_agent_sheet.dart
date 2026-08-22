import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../shortages/domain/models/cash_shortage.dart';
import '../../../shortages/presentation/utils/shortage_formatters.dart';
import '../../domain/models/agent_detail.dart';

class ReactivateAgentSheet extends StatelessWidget {
  const ReactivateAgentSheet({
    super.key,
    required this.agent,
    this.latestShortage,
  });

  final AgentDetail agent;
  final CashShortage? latestShortage;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEAF5ED),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.person_add_alt_1_outlined,
                    color: forestEmerald,
                    size: 19,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Reactivate field officer',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close_rounded, color: midnightNavy),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _AgentAvatar(agent: agent),
                const SizedBox(width: 12),
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
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
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
                    ],
                  ),
                ),
              ],
            ),
            if (latestShortage != null) ...[
              const SizedBox(height: 16),
              _InfoBox(
                tone: forestEmerald,
                icon: Icons.info_outline_rounded,
                message:
                    'This field officer was suspended with a recent shortage record. '
                    'Reason: ${shortageReason(latestShortage!)} '
                    '(${shortageMoney(latestShortage!.amountOutstanding)}).',
              ),
            ],
            const SizedBox(height: 10),
            const _InfoBox(
              tone: Color(0xFF175CD3),
              icon: Icons.info_outline_rounded,
              message:
                  'Reactivate this field officer to allow app access and operations again.',
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: FilledButton.styleFrom(
                      backgroundColor: forestEmerald,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 48),
                    ),
                    child: const Text(
                      'Reactivate field officer',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({
    required this.tone,
    required this.icon,
    required this.message,
  });

  final Color tone;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.07),
        border: Border.all(color: tone.withValues(alpha: 0.18)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, color: tone, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 10,
                height: 1.3,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentAvatar extends StatelessWidget {
  const _AgentAvatar({required this.agent});

  final AgentDetail agent;

  @override
  Widget build(BuildContext context) {
    final photoUrl = agent.photoUrl;

    return Container(
      width: 54,
      height: 54,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        color: Color(0xFFF1F5F2),
        shape: BoxShape.circle,
      ),
      child: photoUrl == null || photoUrl.trim().isEmpty
          ? Center(
              child: Text(
                _initials(agent.name),
                style: const TextStyle(
                  color: forestEmerald,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            )
          : Image.network(
              photoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) {
                return Center(
                  child: Text(
                    _initials(agent.name),
                    style: const TextStyle(
                      color: forestEmerald,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                );
              },
            ),
    );
  }
}

String _initials(String value) {
  final words = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();

  if (words.isEmpty) {
    return 'A';
  }

  if (words.length == 1) {
    final word = words.first;
    return word.substring(0, word.length > 2 ? 2 : word.length).toUpperCase();
  }

  return '${words.first[0]}${words.last[0]}'.toUpperCase();
}
