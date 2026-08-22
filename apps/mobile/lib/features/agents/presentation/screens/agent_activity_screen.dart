import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../../../utils/money.dart';
import '../../domain/models/agent_activity.dart';

enum AgentActivityFilter { all, loansIssued, repayments, applications }

class AgentActivityScreen extends StatefulWidget {
  const AgentActivityScreen({
    super.key,
    required this.agentName,
    required this.data,
  });

  final String agentName;
  final AgentActivity data;

  @override
  State<AgentActivityScreen> createState() => _AgentActivityScreenState();
}

class _AgentActivityScreenState extends State<AgentActivityScreen> {
  AgentActivityFilter _filter = AgentActivityFilter.all;
  int _visibleCount = 12;

  List<_ActivityItem> get _items {
    final rows = _activityItems(widget.data).where((item) {
      return switch (_filter) {
        AgentActivityFilter.all => true,
        AgentActivityFilter.loansIssued =>
          item.category == AgentActivityFilter.loansIssued,
        AgentActivityFilter.repayments =>
          item.category == AgentActivityFilter.repayments,
        AgentActivityFilter.applications =>
          item.category == AgentActivityFilter.applications,
      };
    }).toList();

    rows.sort((left, right) {
      final a = left.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final b = right.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return b.compareTo(a);
    });

    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final visible = items.take(_visibleCount).toList();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: midnightNavy),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Agent activity',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              widget.agentName,
              style: const TextStyle(
                color: slateText,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: const [
          Icon(Icons.filter_alt_outlined, color: midnightNavy),
          SizedBox(width: 16),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 30),
        children: [
          _ActivityFilterBar(selected: _filter, onChanged: _setFilter),
          const SizedBox(height: 14),
          _MonthSelector(label: _monthRangeLabel()),
          const SizedBox(height: 16),
          if (visible.isEmpty)
            const _EmptyActivity()
          else
            ..._buildGroupedRows(visible),
          if (items.length > visible.length) ...[
            const SizedBox(height: 10),
            Center(
              child: TextButton.icon(
                onPressed: () {
                  setState(() {
                    _visibleCount += 12;
                  });
                },
                label: const Text('Load more'),
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _setFilter(AgentActivityFilter value) {
    setState(() {
      _filter = value;
      _visibleCount = 12;
    });
  }

  List<Widget> _buildGroupedRows(List<_ActivityItem> rows) {
    final widgets = <Widget>[];
    String? lastDate;

    for (final item in rows) {
      final date = _date(item.occurredAt);

      if (date != lastDate) {
        widgets.add(
          Padding(
            padding: EdgeInsets.only(top: widgets.isEmpty ? 0 : 16, bottom: 8),
            child: Text(
              date,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        );
        lastDate = date;
      }

      widgets.add(_ActivityHistoryRow(item: item));
      widgets.add(const Divider(height: 1, color: line, indent: 49));
    }

    return widgets;
  }
}

class _ActivityFilterBar extends StatelessWidget {
  const _ActivityFilterBar({required this.selected, required this.onChanged});

  final AgentActivityFilter selected;
  final ValueChanged<AgentActivityFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _Chip(
            label: 'All',
            value: AgentActivityFilter.all,
            selected: selected,
            onChanged: onChanged,
          ),
          _Chip(
            label: 'Loans issued',
            value: AgentActivityFilter.loansIssued,
            selected: selected,
            onChanged: onChanged,
          ),
          _Chip(
            label: 'Repayments',
            value: AgentActivityFilter.repayments,
            selected: selected,
            onChanged: onChanged,
          ),
          _Chip(
            label: 'Applications',
            value: AgentActivityFilter.applications,
            selected: selected,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onChanged,
  });

  final String label;
  final AgentActivityFilter value;
  final AgentActivityFilter selected;
  final ValueChanged<AgentActivityFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final active = selected == value;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        selected: active,
        showCheckmark: false,
        label: Text(label),
        selectedColor: forestEmerald,
        backgroundColor: Colors.white,
        side: BorderSide(color: active ? forestEmerald : line),
        labelStyle: TextStyle(
          color: active ? Colors.white : midnightNavy,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
        onSelected: (_) => onChanged(value),
      ),
    );
  }
}

class _MonthSelector extends StatelessWidget {
  const _MonthSelector({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.calendar_today_outlined,
              color: midnightNavy,
              size: 15,
            ),
            const SizedBox(width: 7),
            Text(
              label,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 6),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: midnightNavy,
              size: 17,
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityHistoryRow extends StatelessWidget {
  const _ActivityHistoryRow({required this.item});

  final _ActivityItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: item.tone.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(item.icon, color: item.tone, size: 17),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  item.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 8.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (item.amount != null)
                Text(
                  'UGX ${formatMoney(item.amount!)}',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              const SizedBox(height: 4),
              Text(
                _time(item.occurredAt),
                style: const TextStyle(
                  color: slateText,
                  fontSize: 8,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyActivity extends StatelessWidget {
  const _EmptyActivity();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 38),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAF9),
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(9),
      ),
      child: const Text(
        'No activity has been recorded.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: slateText,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ActivityItem {
  const _ActivityItem({
    required this.title,
    required this.subtitle,
    required this.occurredAt,
    required this.icon,
    required this.tone,
    required this.category,
    this.amount,
  });

  final String title;
  final String subtitle;
  final DateTime? occurredAt;
  final IconData icon;
  final Color tone;
  final AgentActivityFilter category;
  final num? amount;
}

List<_ActivityItem> _activityItems(AgentActivity data) {
  final items = <_ActivityItem>[];

  for (final application in data.applications) {
    final issued =
        application.loanId != null ||
        application.status.toUpperCase() == 'DISBURSED' ||
        application.status.toUpperCase() == 'APPROVED';

    items.add(
      _ActivityItem(
        title: issued
            ? 'Loan issued to ${application.clientName}'
            : 'Application recorded',
        subtitle: issued
            ? 'Loan ID: ${application.loanId ?? application.id}'
            : 'Applicant: ${application.clientName}',
        occurredAt: application.submittedAt,
        amount: issued ? application.principalAmount : null,
        icon: issued ? Icons.work_outline_rounded : Icons.description_outlined,
        tone: issued ? forestEmerald : const Color(0xFFF06723),
        category: issued
            ? AgentActivityFilter.loansIssued
            : AgentActivityFilter.applications,
      ),
    );
  }

  for (final collection in data.collections) {
    items.add(
      _ActivityItem(
        title: 'Repayment collected from ${collection.clientName}',
        subtitle: 'Loan ID: ${collection.loanId}',
        occurredAt: collection.paidAt,
        amount: collection.amount,
        icon: Icons.payments_outlined,
        tone: const Color(0xFF175CD3),
        category: AgentActivityFilter.repayments,
      ),
    );
  }

  for (final item in data.otherActivity) {
    items.add(
      _ActivityItem(
        title: item.title,
        subtitle: item.detail,
        occurredAt: item.occurredAt,
        icon: Icons.history_rounded,
        tone: midnightNavy,
        category: AgentActivityFilter.all,
      ),
    );
  }

  return items;
}

String _monthRangeLabel() {
  final now = DateTime.now();
  final lastDay = DateTime(now.year, now.month + 1, 0).day;

  return 'This month (1 - $lastDay ${_month(now)} ${now.year})';
}

String _date(DateTime? value) {
  if (value == null) {
    return 'Unknown date';
  }

  final local = value.toLocal();
  return '${local.day} ${_month(local)} ${local.year}';
}

String _time(DateTime? value) {
  if (value == null) {
    return '';
  }

  final local = value.toLocal();
  final hour = local.hour == 0
      ? 12
      : local.hour > 12
      ? local.hour - 12
      : local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour >= 12 ? 'PM' : 'AM';

  return '$hour:$minute $period';
}

String _month(DateTime value) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return months[value.month - 1];
}
