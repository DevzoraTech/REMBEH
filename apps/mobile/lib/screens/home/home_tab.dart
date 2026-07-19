import 'package:flutter/material.dart';

import '../../features/applications_list/data/applications_live_store.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../models/field_records.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/greeting.dart';
import '../../utils/money.dart';
import '../../widgets/client_details_sheet.dart';
import '../loan_application/new_loan_application_screen.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({
    super.key,
    required this.session,
    required this.onOpenProfile,
    required this.onOpenSearch,
    required this.onOpenRecords,
  });

  final RembehSession session;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenSearch;
  final void Function({
    required RecordsSection section,
    required RecordsFilter filter,
  }) onOpenRecords;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  final _store = RepaymentsLiveStore.instance;
  late HomeSummary _summary;

  @override
  void initState() {
    super.initState();
    _summary = _buildSummary();
    _store
      ..addListener(_onChanged)
      ..start(widget.session);
    ApplicationsLiveStore.instance
      ..addListener(_onChanged)
      ..start(widget.session);
  }

  @override
  void dispose() {
    _store.removeListener(_onChanged);
    ApplicationsLiveStore.instance.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (!mounted) return;
    setState(() => _summary = _buildSummary());
  }

  HomeSummary _buildSummary() {
    final base = _store.summary;
    final now = DateTime.now();
    final appsToday = ApplicationsLiveStore.instance.applications
        .where(
          (item) =>
              item.registeredAt.year == now.year &&
              item.registeredAt.month == now.month &&
              item.registeredAt.day == now.day,
        )
        .length;
    return HomeSummary(
      amountCollectedToday: base.amountCollectedToday,
      repaymentsTodayCount: base.repaymentsTodayCount,
      dueTodayCount: base.dueTodayCount,
      newApplicationsTodayCount: appsToday,
      pendingSyncCount: base.pendingSyncCount,
      clientsDueToday: base.clientsDueToday,
    );
  }

  Future<void> _refresh() async {
    await Future.wait([
      _store.refresh(),
      ApplicationsLiveStore.instance.refresh(),
    ]);
    if (!mounted) return;
    setState(() => _summary = _buildSummary());
  }

  Future<void> _openNewApplication() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => NewLoanApplicationScreen(session: widget.session),
      ),
    );
    if (created == true && mounted) {
      await ApplicationsLiveStore.instance.refresh();
      if (!mounted) return;
      setState(() => _summary = _buildSummary());
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final surname = surnameFromFullName(widget.session.userName);
    final greeting = '${timeOfDayGreeting(now)}, $surname';
    final duePreview = _summary.clientsDueToday.take(8).toList();

    return SafeArea(
      child: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        greeting,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        greetingSubtext(now),
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                InkWell(
                  onTap: widget.onOpenProfile,
                  child: Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: sage,
                      border: Border.all(color: line),
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      _initials(widget.session.userName),
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Material(
              color: Colors.white,
              child: InkWell(
                onTap: widget.onOpenSearch,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                  decoration: BoxDecoration(
                    border: Border.all(color: line),
                    borderRadius: rembehBorderRadius(rembehRadiusLg),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.search, size: 20, color: slateText),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Search client by name or phone...',
                          style: TextStyle(
                            color: slateText,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.chevron_right,
                        size: 20,
                        color: slateText,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusLg),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 12, 12, 8),
                    child: Text(
                      'Today’s Summary',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.account_balance_wallet_outlined,
                            iconColor: forestEmerald,
                            label: 'Collected',
                            value: formatMoney(_summary.amountCollectedToday),
                            valueColor: forestEmerald,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.collectedToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.groups_outlined,
                            iconColor: forestEmerald,
                            label: 'Repayments',
                            value: '${_summary.repaymentsTodayCount}',
                            valueColor: forestEmerald,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.collectedToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.calendar_today_outlined,
                            iconColor: warmGold,
                            label: 'Due Today',
                            value: '${_summary.dueTodayCount}',
                            valueColor: warmGold,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.dueToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.note_add_outlined,
                            iconColor: midnightNavy,
                            label: 'New Applications',
                            value: '${_summary.newApplicationsTodayCount}',
                            valueColor: midnightNavy,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.applications,
                              filter: RecordsFilter.today,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: line),
                  Material(
                    color: Colors.white,
                    child: InkWell(
                      onTap: () => widget.onOpenRecords(
                        section: RecordsSection.repayments,
                        filter: RecordsFilter.pendingSync,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 11,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.sync,
                              size: 18,
                              color: _summary.pendingSyncCount > 0
                                  ? warmGold
                                  : forestEmerald,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${_summary.pendingSyncCount} Pending Sync',
                                style: TextStyle(
                                  color: _summary.pendingSyncCount > 0
                                      ? warmGold
                                      : midnightNavy,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right,
                              size: 18,
                              color: slateText,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Material(
              color: Colors.white,
              child: InkWell(
                onTap: _openNewApplication,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: line),
                    borderRadius: rembehBorderRadius(rembehRadiusLg),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: sage,
                          border: Border.all(color: line),
                          borderRadius: rembehBorderRadius(rembehRadiusMd),
                        ),
                        child: const Icon(
                          Icons.note_add_outlined,
                          color: forestEmerald,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'New',
                              style: TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Register a new client for a loan.',
                              style: TextStyle(
                                color: slateText,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: slateText,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Clients Due Today (${_summary.dueTodayCount})',
                    style: const TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => widget.onOpenRecords(
                    section: RecordsSection.repayments,
                    filter: RecordsFilter.dueToday,
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: forestEmerald,
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'Show all ${_summary.dueTodayCount} ›',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (duePreview.isEmpty)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusLg),
                ),
                child: const Text(
                  'No clients due today.',
                  style: TextStyle(color: slateText, fontSize: 13),
                ),
              )
            else
              ...duePreview.map(
                (client) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _DueClientCard(
                    client: client,
                    now: now,
                    onTap: () => showClientDetailsSheet(
                      context,
                      id: client.id,
                      phone: client.phone,
                      fullName: client.fullName,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'A';
    if (parts.length == 1) {
      return parts.first.substring(0, parts.first.length.clamp(0, 2)).toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.valueColor,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final Color valueColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Column(
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 17, color: iconColor),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 10,
                  height: 1.15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: valueColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DueClientCard extends StatelessWidget {
  const _DueClientCard({
    required this.client,
    required this.now,
    required this.onTap,
  });

  final DueClient client;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: rembehBorderRadius(rembehRadiusLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: Text(
              client.initials,
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
                        client.fullName,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formatActivityTime(client.lastActivityAt, now),
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 12),
                    children: [
                      TextSpan(
                        text: '${client.phone} • ',
                        style: const TextStyle(color: slateText),
                      ),
                      TextSpan(
                        text: 'Paid ${formatCompactMoney(client.amountPaid)}',
                        style: const TextStyle(
                          color: forestEmerald,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      TextSpan(
                        text: ' · ${formatCompactMoney(client.loanAmount)}',
                        style: const TextStyle(
                          color: warmGold,
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
                        client.synced
                            ? Icons.check_circle
                            : Icons.cloud_outlined,
                        size: 14,
                        color: client.synced ? forestEmerald : warmGold,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        client.synced ? 'Uploaded' : 'Pending',
                        style: TextStyle(
                          color: client.synced ? forestEmerald : warmGold,
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
