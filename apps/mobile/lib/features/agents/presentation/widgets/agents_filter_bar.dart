import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../controllers/agents_controller.dart';

class AgentsFilterBar extends StatelessWidget {
  const AgentsFilterBar({
    super.key,
    required this.filter,
    required this.onChanged,
  });

  final AgentListFilter filter;
  final ValueChanged<AgentListFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _FilterChip(
            label: 'All',
            selected: filter == AgentListFilter.all,
            onTap: () => onChanged(AgentListFilter.all),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Active',
            selected: filter == AgentListFilter.active,
            onTap: () => onChanged(AgentListFilter.active),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Suspended',
            selected: filter == AgentListFilter.suspended,
            onTap: () => onChanged(AgentListFilter.suspended),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Inactive',
            selected: filter == AgentListFilter.inactive,
            onTap: () => onChanged(AgentListFilter.inactive),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? forestEmerald : Colors.white,
          border: Border.all(color: selected ? forestEmerald : line),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : midnightNavy,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
