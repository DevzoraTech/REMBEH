import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/agent_detail.dart';

const _suspendReasons = [
  'Temporary leave',
  'Account security concern',
  'Performance issue',
  'Misconduct',
  'No longer working with branch',
];

class SuspendAgentSheet extends StatefulWidget {
  const SuspendAgentSheet({
    super.key,
    required this.agent,
    required this.hasOpenShortage,
  });

  final AgentDetail agent;
  final bool hasOpenShortage;

  @override
  State<SuspendAgentSheet> createState() => _SuspendAgentSheetState();
}

class _SuspendAgentSheetState extends State<SuspendAgentSheet> {
  String? _reason;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
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
                      color: Color(0xFFFDECEC),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.person_off_outlined,
                      color: Color(0xFFD92D20),
                      size: 19,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Suspend field officer',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: midnightNavy),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  _AgentAvatar(agent: widget.agent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.agent.name,
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
                          widget.agent.phone ?? widget.agent.email,
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
                  const SizedBox(width: 8),
                  const _DutyChip(),
                ],
              ),
              const SizedBox(height: 18),
              const Text(
                'Reason for suspension',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              DropdownButtonFormField<String>(
                initialValue: _reason,
                decoration: const InputDecoration(
                  hintText: 'Select a reason',
                  border: OutlineInputBorder(),
                ),
                items: _suspendReasons
                    .map(
                      (reason) =>
                          DropdownMenuItem(value: reason, child: Text(reason)),
                    )
                    .toList(),
                onChanged: (value) {
                  setState(() {
                    _reason = value;
                  });
                },
              ),
              const SizedBox(height: 14),
              const _WarningBox(
                icon: Icons.error_outline_rounded,
                tone: Color(0xFFD92D20),
                message:
                    'This field officer will not be able to access the app or perform operations until reactivated.',
              ),
              if (widget.hasOpenShortage) ...[
                const SizedBox(height: 10),
                const _WarningBox(
                  icon: Icons.warning_amber_rounded,
                  tone: Color(0xFFB26A00),
                  message:
                      'This field officer has an unresolved daily position. Settle today’s operations before suspending.',
                ),
              ],
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _reason == null
                          ? null
                          : () => Navigator.of(context).pop(_reason),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFE30613),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(0, 48),
                      ),
                      child: const Text(
                        'Suspend field officer',
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
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

class _DutyChip extends StatelessWidget {
  const _DutyChip();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.circle_rounded, color: forestEmerald, size: 8),
        SizedBox(width: 5),
        Text(
          'On duty today',
          style: TextStyle(
            color: forestEmerald,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _WarningBox extends StatelessWidget {
  const _WarningBox({
    required this.icon,
    required this.tone,
    required this.message,
  });

  final IconData icon;
  final Color tone;
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
          Icon(icon, color: tone, size: 19),
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
