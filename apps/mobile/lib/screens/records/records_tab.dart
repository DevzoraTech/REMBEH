import 'package:flutter/material.dart';

import '../../features/applications_list/data/applications_live_store.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../models/field_records.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/date_groups.dart';
import '../../utils/money.dart';
import '../../widgets/application_details_sheet.dart';
import '../../widgets/client_details_sheet.dart';

class RecordsTab extends StatefulWidget {
  const RecordsTab({
    super.key,
    required this.session,
    required this.section,
    required this.filter,
    required this.onSectionChanged,
    required this.onFilterChanged,
  });

  final RembehSession session;
  final RecordsSection section;
  final RecordsFilter filter;
  final ValueChanged<RecordsSection> onSectionChanged;
  final ValueChanged<RecordsFilter> onFilterChanged;

  @override
  State<RecordsTab> createState() => _RecordsTabState();
}

class _RecordsTabState extends State<RecordsTab> {
  final _filterKey = GlobalKey();
  final _appsStore = ApplicationsLiveStore.instance;
  final _repayStore = RepaymentsLiveStore.instance;
  bool _menuOpen = false;

  @override
  void initState() {
    super.initState();
    _appsStore.addListener(_onChanged);
    _repayStore.addListener(_onChanged);
    _appsStore.start(widget.session);
    _repayStore.start(widget.session);
  }

  @override
  void dispose() {
    _appsStore.removeListener(_onChanged);
    _repayStore.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  List<RecordsFilter> get _filters => widget.section == RecordsSection.repayments
      ? repaymentFilters
      : applicationFilters;

  RecordsFilter get _activeFilter {
    final filters = _filters;
    if (filters.contains(widget.filter)) return widget.filter;
    return RecordsFilter.all;
  }

  Future<void> _openFilterMenu() async {
    final box = _filterKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final offset = box.localToGlobal(Offset.zero, ancestor: overlay);
    final size = box.size;

    setState(() => _menuOpen = true);

    final selected = await showMenu<RecordsFilter>(
      context: context,
      position: RelativeRect.fromLTRB(
        offset.dx + size.width - 220,
        offset.dy + size.height + 4,
        overlay.size.width - (offset.dx + size.width),
        0,
      ),
      color: Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      items: _filters.map((filter) {
        final selected = filter == _activeFilter;
        return PopupMenuItem<RecordsFilter>(
          value: filter,
          height: 44,
          child: Row(
            children: [
              Icon(
                _filterIcon(filter),
                size: 18,
                color: selected ? forestEmerald : midnightNavy,
              ),
              const SizedBox(width: 10),
              Text(
                filter.label,
                style: TextStyle(
                  color: selected ? forestEmerald : midnightNavy,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );

    if (!mounted) return;
    setState(() => _menuOpen = false);

    if (selected == null) return;

    if (selected == RecordsFilter.custom) {
      final range = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime.now().add(const Duration(days: 1)),
        initialDateRange: _repayStore.customRange ??
            DateTimeRange(
              start: DateTime.now().subtract(const Duration(days: 7)),
              end: DateTime.now(),
            ),
        builder: (context, child) {
          return Theme(
            data: Theme.of(context).copyWith(
              colorScheme: const ColorScheme.light(
                primary: forestEmerald,
                onPrimary: Colors.white,
                surface: Colors.white,
                onSurface: midnightNavy,
              ),
            ),
            child: child!,
          );
        },
      );
      if (range != null) {
        _repayStore.customRange = range;
        widget.onFilterChanged(RecordsFilter.custom);
      }
      return;
    }

    widget.onFilterChanged(selected);
  }

  IconData _filterIcon(RecordsFilter filter) {
    switch (filter) {
      case RecordsFilter.all:
        return Icons.check_circle;
      case RecordsFilter.dueToday:
        return Icons.calendar_today_outlined;
      case RecordsFilter.collectedToday:
        return Icons.check_circle_outline;
      case RecordsFilter.today:
        return Icons.today_outlined;
      case RecordsFilter.yesterday:
        return Icons.event_outlined;
      case RecordsFilter.thisWeek:
        return Icons.date_range_outlined;
      case RecordsFilter.thisMonth:
        return Icons.calendar_month_outlined;
      case RecordsFilter.pendingSync:
        return Icons.cloud_outlined;
      case RecordsFilter.uploaded:
        return Icons.task_alt;
      case RecordsFilter.custom:
        return Icons.tune;
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeFilter;

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Records',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
                InkWell(
                  key: _filterKey,
                  onTap: _openFilterMenu,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Show: ',
                          style: TextStyle(
                            color: slateText,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          active.label,
                          style: const TextStyle(
                            color: forestEmerald,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Icon(
                          _menuOpen
                              ? Icons.arrow_drop_up
                              : Icons.arrow_drop_down,
                          color: forestEmerald,
                          size: 22,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: sage.withValues(alpha: 0.28),
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _SegmentTab(
                      label: 'Repayments',
                      selected: widget.section == RecordsSection.repayments,
                      onTap: () {
                        if (widget.section != RecordsSection.repayments) {
                          widget.onSectionChanged(RecordsSection.repayments);
                          if (!repaymentFilters.contains(widget.filter)) {
                            widget.onFilterChanged(RecordsFilter.all);
                          }
                        }
                      },
                    ),
                  ),
                  Expanded(
                    child: _SegmentTab(
                      label: 'Applications',
                      selected: widget.section == RecordsSection.applications,
                      onTap: () {
                        if (widget.section != RecordsSection.applications) {
                          widget.onSectionChanged(RecordsSection.applications);
                          if (!applicationFilters.contains(widget.filter)) {
                            widget.onFilterChanged(RecordsFilter.all);
                          }
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: widget.section == RecordsSection.repayments
                ? _RepaymentsList(
                    items: _repayStore.filtered(
                      filter: active,
                      customRange: _repayStore.customRange,
                    ),
                    loading: _repayStore.loading,
                    error: _repayStore.error,
                    onRetry: () => _repayStore.refresh(),
                  )
                : _ApplicationsList(
                    items: _appsStore.filtered(
                      filter: active,
                      customRange: _repayStore.customRange,
                    ),
                    loading: _appsStore.loading,
                    error: _appsStore.error,
                    onRetry: () => _appsStore.refresh(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _CountLabel extends StatelessWidget {
  const _CountLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Text(
        text,
        style: const TextStyle(
          color: slateText,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _DateGroupHeader extends StatelessWidget {
  const _DateGroupHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 2),
      child: Text(
        label,
        style: const TextStyle(
          color: slateText,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _SegmentTab extends StatelessWidget {
  const _SegmentTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? forestEmerald : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : slateText,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _RepaymentsList extends StatelessWidget {
  const _RepaymentsList({
    required this.items,
    required this.loading,
    required this.error,
    required this.onRetry,
  });

  final List<FieldRepayment> items;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (error != null && items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFC62828), fontSize: 13),
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (items.isEmpty) {
      return const _EmptyState(message: 'No repayments for this filter.');
    }

    final now = DateTime.now();
    final groups = groupByLocalDate(items, (item) => item.recordedAt);
    final rows = <Object>[];
    for (final group in groups) {
      rows.add(group.label);
      rows.addAll(group.items);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CountLabel(text: '${items.length} Repayments'),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final row = rows[index];
              if (row is String) {
                return _DateGroupHeader(label: row);
              }
              final item = row as FieldRepayment;
              return _RecordCard(
                initials: item.initials,
                name: item.clientName,
                phone: item.phone,
                primaryAmount: formatCompactMoney(item.amount),
                secondaryValue: formatCompactMoney(item.loanAmount),
                secondaryColor: warmGold,
                timestamp: formatActivityTime(item.recordedAt, now),
                synced: item.synced,
                pendingLabel: 'Pending',
                onTap: () => showClientDetailsSheet(
                  context,
                  id: item.loanId.isNotEmpty ? item.loanId : item.id,
                  phone: item.phone,
                  fullName: item.clientName,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ApplicationsList extends StatelessWidget {
  const _ApplicationsList({
    required this.items,
    required this.loading,
    required this.error,
    required this.onRetry,
  });

  final List<FieldApplication> items;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (error != null && items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFC62828), fontSize: 13),
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (items.isEmpty) {
      return const _EmptyState(message: 'No applications for this filter.');
    }

    final now = DateTime.now();
    final groups = groupByLocalDate(items, (item) => item.registeredAt);
    final rows = <Object>[];
    for (final group in groups) {
      rows.add(group.label);
      rows.addAll(group.items);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CountLabel(text: '${items.length} Applications'),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final row = rows[index];
              if (row is String) {
                return _DateGroupHeader(label: row);
              }
              final item = row as FieldApplication;
              return _RecordCard(
                initials: item.initials,
                name: item.clientName,
                phone: item.phone,
                primaryAmount: formatMoney(item.amountRequested),
                secondaryValue: item.interestLabel,
                secondaryColor: midnightNavy,
                timestamp: formatActivityTime(item.registeredAt, now),
                synced: item.synced,
                pendingLabel: 'Pending Sync',
                onTap: () => showApplicationDetailsSheet(
                  context,
                  applicationId: item.id,
                  fallbackName: item.clientName,
                  fallbackPhone: item.phone,
                  fallbackAmount: item.amountRequested,
                  fallbackInterestPercent: item.interestRatePercent,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({
    required this.initials,
    required this.name,
    required this.phone,
    required this.primaryAmount,
    required this.secondaryValue,
    required this.secondaryColor,
    required this.timestamp,
    required this.synced,
    required this.pendingLabel,
    required this.onTap,
  });

  final String initials;
  final String name;
  final String phone;
  final String primaryAmount;
  final String secondaryValue;
  final Color secondaryColor;
  final String timestamp;
  final bool synced;
  final String pendingLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 11),
      decoration: BoxDecoration(
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: Text(
              initials,
              style: const TextStyle(
                color: forestEmerald,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      timestamp,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 12),
                    children: [
                      TextSpan(
                        text: phone,
                        style: const TextStyle(color: slateText),
                      ),
                      const TextSpan(
                        text: '  •  ',
                        style: TextStyle(
                          color: forestEmerald,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      TextSpan(
                        text: primaryAmount,
                        style: const TextStyle(
                          color: forestEmerald,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      TextSpan(
                        text: '  |  ',
                        style: TextStyle(
                          color: secondaryColor.withValues(alpha: 0.7),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      TextSpan(
                        text: secondaryValue,
                        style: TextStyle(
                          color: secondaryColor,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        synced ? Icons.check_circle : Icons.cloud_outlined,
                        size: 14,
                        color: synced ? forestEmerald : warmGold,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        synced ? 'Uploaded' : pendingLabel,
                        style: TextStyle(
                          color: synced ? forestEmerald : warmGold,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: slateText),
        ),
      ),
    );
  }
}
