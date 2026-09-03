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
    this.onViewAll,
    this.onOpenAgent,
  });

  final List<AgentFloatPosition> agents;
  final VoidCallback? onViewAll;
  final ValueChanged<AgentFloatPosition>? onOpenAgent;

  @override
  Widget build(BuildContext context) {
    final visibleAgents = agents.take(2).toList(growable: false);

    return OpsSurface(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 11, 14, 8),
            child: Row(
              children: [
                const OpsIcon(icon: Icons.groups_2_outlined),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Field officers active today',
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
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 5,
                      ),
                      child: Text(
                        'View all(${agents.length})',
                        style: const TextStyle(
                          color: forestEmerald,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const _OfficerTableHeader(),
          ...List.generate(visibleAgents.length, (index) {
            final agent = visibleAgents[index];

            return Column(
              children: [
                _OfficerTableRow(
                  agent: agent,
                  onTap: onOpenAgent == null
                      ? null
                      : () {
                          onOpenAgent!(agent);
                        },
                ),
                if (index != visibleAgents.length - 1)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14),
                    child: Divider(height: 1, color: Color(0xFFE8ECE9)),
                  ),
              ],
            );
          }),
          const _BalanceNotice(),
        ],
      ),
    );
  }
}

class _OfficerTableHeader extends StatelessWidget {
  const _OfficerTableHeader();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(14, 2, 14, 7),
      child: Row(
        children: [
          Expanded(flex: 28, child: _HeaderCell('Name')),
          Expanded(flex: 19, child: _HeaderCell('Cash in', alignEnd: true)),
          Expanded(flex: 17, child: _HeaderCell('Loans', alignEnd: true)),
          Expanded(
            flex: 21,
            child: _HeaderCell('Processing fees', alignEnd: true),
          ),
          Expanded(
            flex: 24,
            child: _HeaderCell('Expected handover', alignEnd: true),
          ),
          SizedBox(width: 14),
        ],
      ),
    );
  }
}

class _OfficerTableRow extends StatelessWidget {
  const _OfficerTableRow({required this.agent, this.onTap});

  final AgentFloatPosition agent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 10, 8),
          child: Row(
            children: [
              Expanded(
                flex: 28,
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        color: Color(0xFFE8F4EA),
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        operationInitials(agent.name),
                        style: const TextStyle(
                          color: forestEmerald,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        agent.displaySurname,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(flex: 19, child: _MoneyCell(agent.repaymentsCollected)),
              Expanded(flex: 17, child: _MoneyCell(agent.loansIssued)),
              Expanded(flex: 21, child: _MoneyCell(agent.processingFees)),
              Expanded(
                flex: 24,
                child: _MoneyCell(agent.expectedHandover, success: true),
              ),
              const SizedBox(width: 2),
              const Icon(
                Icons.chevron_right_rounded,
                color: slateText,
                size: 16,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell(this.label, {this.alignEnd = false});

  final String label;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      textAlign: alignEnd ? TextAlign.end : TextAlign.start,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: midnightNavy,
        fontSize: 7.4,
        height: 1.18,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _MoneyCell extends StatelessWidget {
  const _MoneyCell(this.amount, {this.success = false});

  final num amount;
  final bool success;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          formatMoney(amount),
          textAlign: TextAlign.end,
          maxLines: 1,
          style: TextStyle(
            color: success ? forestEmerald : midnightNavy,
            fontSize: 8.8,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class _BalanceNotice extends StatelessWidget {
  const _BalanceNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(14, 6, 14, 12),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0EC),
        border: Border.all(color: const Color(0xFFF7CBC2)),
        borderRadius: rembehBorderRadius(rembehRadiusSm),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline_rounded, color: Color(0xFFC2412D), size: 16),
          SizedBox(width: 7),
          Expanded(
            child: Text(
              'Select a field officer to balance them off.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFFC2412D),
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
