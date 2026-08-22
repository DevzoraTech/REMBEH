import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/cash_shortage.dart';
import '../utils/shortage_formatters.dart';
import 'shortage_status_chip.dart';

class ShortageHeaderCard extends StatelessWidget {
  const ShortageHeaderCard({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    final tone = shortageStatusColor(shortage.isOpen);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.06),
        border: Border.all(color: tone.withValues(alpha: 0.18)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ShortageStatusChip(open: shortage.isOpen, compact: false),
                const SizedBox(height: 9),
                const Text(
                  'Shortage amount',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  shortageMoney(shortage.amountOriginal),
                  style: TextStyle(
                    color: tone,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                shortage.isOpen ? 'Outstanding' : 'Settled',
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                shortageMoney(shortage.amountOutstanding),
                style: TextStyle(
                  color: tone,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ShortageDetailsCard extends StatelessWidget {
  const ShortageDetailsCard({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      children: [
        _DetailRow(
          icon: Icons.person_outline_rounded,
          label: 'Responsible',
          value: shortage.responsibleName ?? 'Branch cash',
        ),
        _DetailRow(
          icon: Icons.track_changes_outlined,
          label: 'Source',
          value: shortageSourceLabel(shortage.sourceType),
        ),
        _DetailRow(
          icon: Icons.calendar_today_outlined,
          label: 'Operational date',
          value: shortageDateLabel(shortage.operationDate),
        ),
        _DetailRow(
          icon: Icons.person_pin_outlined,
          label: 'Recorded by',
          value: shortage.createdByName ?? 'Unknown',
        ),
        _DetailRow(
          icon: Icons.info_outline_rounded,
          label: 'Reason',
          value: shortageReason(shortage),
          last: true,
        ),
      ],
    );
  }
}

class ShortageReconciliationCard extends StatelessWidget {
  const ShortageReconciliationCard({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    final expected = shortage.amountOriginal + shortage.amountPaid;

    return _Panel(
      title: 'Reconciliation (${shortageDateLabel(shortage.operationDate)})',
      children: [
        _AmountRow(label: 'Expected handover', value: shortageMoney(expected)),
        _AmountRow(
          label: 'Actual handover',
          value: shortageMoney(shortage.amountPaid),
        ),
        _AmountRow(
          label: 'Shortage',
          value: shortageMoney(shortage.amountOutstanding),
          important: true,
          last: true,
        ),
      ],
    );
  }
}

class ShortageSettlementSummaryCard extends StatelessWidget {
  const ShortageSettlementSummaryCard({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: 'Settlement summary',
      children: [
        Row(
          children: [
            Expanded(
              child: _MiniAmount(
                label: 'Original amount',
                value: shortageMoney(shortage.amountOriginal),
              ),
            ),
            Expanded(
              child: _MiniAmount(
                label: 'Settled',
                value: shortageMoney(shortage.amountPaid),
              ),
            ),
            Expanded(
              child: _MiniAmount(
                label: 'Outstanding',
                value: shortageMoney(shortage.amountOutstanding),
                tone: const Color(0xFFC05A00),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class ShortageHistoryCard extends StatelessWidget {
  const ShortageHistoryCard({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    final events = <_ShortageEvent>[
      _ShortageEvent(
        title: 'Shortage recorded',
        amount: shortage.amountOriginal,
        occurredAt: shortage.createdAt ?? shortage.operationDate,
        actor: shortage.createdByName,
        tone: const Color(0xFFD92D20),
      ),
      for (final payment in shortage.payments)
        _ShortageEvent(
          title: 'Settlement recorded',
          amount: payment.amount,
          occurredAt: payment.paidAt,
          actor: payment.recordedByName,
          note: payment.notes,
          tone: forestEmerald,
        ),
    ];

    events.sort((left, right) {
      final a = left.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final b = right.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return a.compareTo(b);
    });

    return _Panel(
      title: 'History',
      children: [
        for (var index = 0; index < events.length; index++)
          _HistoryRow(event: events[index], last: index == events.length - 1),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.children, this.title});

  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 10),
          ],
          ...children,
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.last = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: midnightNavy),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
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

class _AmountRow extends StatelessWidget {
  const _AmountRow({
    required this.label,
    required this.value,
    this.important = false,
    this.last = false,
  });

  final String label;
  final String value;
  final bool important;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 9),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: important ? const Color(0xFFD92D20) : slateText,
                fontSize: 10,
                fontWeight: important ? FontWeight.w900 : FontWeight.w700,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: important ? const Color(0xFFD92D20) : midnightNavy,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniAmount extends StatelessWidget {
  const _MiniAmount({
    required this.label,
    required this.value,
    this.tone = midnightNavy,
  });

  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 8,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: TextStyle(
              color: tone,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.event, required this.last});

  final _ShortageEvent event;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: event.tone,
                shape: BoxShape.circle,
              ),
            ),
            if (!last) Container(width: 1, height: 44, color: line),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        shortageShortDateTime(event.occurredAt),
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      shortageMoney(event.amount),
                      style: TextStyle(
                        color: event.tone,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  event.title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (event.actor != null || event.note != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (event.actor != null) 'by ${event.actor}',
                      if (event.note != null) event.note,
                    ].join(' - '),
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 8,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ShortageEvent {
  const _ShortageEvent({
    required this.title,
    required this.amount,
    required this.tone,
    this.occurredAt,
    this.actor,
    this.note,
  });

  final String title;
  final num amount;
  final Color tone;
  final DateTime? occurredAt;
  final String? actor;
  final String? note;
}
