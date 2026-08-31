import 'dart:async';

import 'package:flutter/material.dart';

import '../../features/applications_list/data/applications_live_store.dart';
import '../../features/marketing/domain/models/mobile_marketing_campaign.dart';
import '../../features/marketing/presentation/widgets/mobile_marketing_banner.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../models/agent_day_status.dart';
import '../../models/field_records.dart';
import '../../models/pending_disbursement.dart';
import '../../services/api_client.dart';
import '../../services/offline_cache_store.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/greeting.dart';
import '../../utils/money.dart';
import '../../widgets/client_details_sheet.dart';
import '../loan_application/new_loan_application_screen.dart';
import '../pending_disbursements_screen.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({
    super.key,
    required this.session,
    required this.dayStatus,
    required this.onRefreshDayStatus,
    required this.onOpenProfile,
    required this.onOpenSearch,
    required this.onOpenRecords,
    this.marketingCampaign,
    this.onMarketingTap,
  });

  final RembehSession session;
  final AgentDayStatus dayStatus;
  final Future<void> Function() onRefreshDayStatus;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenSearch;
  final MobileMarketingCampaign? marketingCampaign;
  final VoidCallback? onMarketingTap;
  final void Function({
    required RecordsSection section,
    required RecordsFilter filter,
  })
  onOpenRecords;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  final _store = RepaymentsLiveStore.instance;
  final _sessionStore = SessionStore();
  final _offlineCache = OfflineCacheStore.instance;
  late final ApiClient _api = ApiClient(_sessionStore);
  late HomeSummary _summary;
  List<PendingDisbursement> _pendingDisbursements = const [];

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
    unawaited(_loadPendingDisbursements());
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
      widget.onRefreshDayStatus(),
      _loadPendingDisbursements(),
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

  Future<void> _loadPendingDisbursements() async {
    if (!widget.session.hasPermission('loan.read')) {
      return;
    }
    final cacheKey = OfflineCacheKeys.pendingDisbursements(
      widget.session.tenantId ?? 'tenant',
      widget.session.branchId ?? 'branch',
    );
    final cached = await _offlineCache.getPayload(cacheKey);
    final cachedItems = (cached as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(PendingDisbursement.fromJson)
        .toList(growable: false);
    if (cachedItems.isNotEmpty && mounted) {
      setState(() {
        _pendingDisbursements = cachedItems;
      });
    }

    try {
      final response = await _api.listPendingDisbursements(widget.session);
      if (!mounted) return;
      await _offlineCache.putJson(
        cacheKey,
        response.items.map((item) => item.toJson()).toList(),
      );
      setState(() {
        _pendingDisbursements = response.items;
      });
    } catch (_) {
      // The rest of the field workspace can continue from cached live stores.
    }
  }

  Future<void> _openPendingDisbursements() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PendingDisbursementsScreen(
          session: widget.session,
          initialItems: _pendingDisbursements,
        ),
      ),
    );
    if (mounted && changed == true) {
      await Future.wait([
        _loadPendingDisbursements(),
        widget.onRefreshDayStatus(),
        ApplicationsLiveStore.instance.refresh(),
      ]);
      if (mounted) setState(() => _summary = _buildSummary());
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
                        style: const TextStyle(color: slateText, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                InkWell(
                  onTap: widget.onOpenProfile,
                  child: _HomeProfileAvatar(session: widget.session),
                ),
              ],
            ),
            if (widget.marketingCampaign != null) ...[
              const SizedBox(height: 12),
              MobileMarketingBanner(
                campaign: widget.marketingCampaign!,
                onTap: widget.onMarketingTap,
              ),
            ],
            const SizedBox(height: 16),
            Material(
              color: Colors.white,
              child: InkWell(
                onTap: widget.onOpenSearch,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 13,
                  ),
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
                          style: TextStyle(color: slateText, fontSize: 14),
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 20, color: slateText),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF0B6A3B),
                border: Border.all(
                  color: forestEmerald.withValues(alpha: 0.22),
                ),
                borderRadius: rembehBorderRadius(rembehRadiusLg),
                boxShadow: [
                  BoxShadow(
                    color: forestEmerald.withValues(alpha: 0.18),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(12, 12, 12, 4),
                    child: Text(
                      'Today’s Summary',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
                    child: Row(
                      children: [
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.account_balance_wallet,
                            iconColor: forestEmerald,
                            label: 'Collected',
                            value: formatMoney(_summary.amountCollectedToday),
                            valueColor: Colors.white,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.collectedToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.groups,
                            iconColor: forestEmerald,
                            label: 'Repayments',
                            value: '${_summary.repaymentsTodayCount}',
                            valueColor: Colors.white,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.collectedToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.calendar_today,
                            iconColor: warmGold,
                            label: 'Due Today',
                            value: '${_summary.dueTodayCount}',
                            valueColor: Colors.white,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.repayments,
                              filter: RecordsFilter.dueToday,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _SummaryMetric(
                            icon: Icons.note_add,
                            iconColor: midnightNavy,
                            label: 'Applications',
                            value: '${_summary.newApplicationsTodayCount}',
                            valueColor: Colors.white,
                            onTap: () => widget.onOpenRecords(
                              section: RecordsSection.applications,
                              filter: RecordsFilter.today,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _HandoverStrip(status: widget.dayStatus),
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
                          Icons.note_add,
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
                              'New Loan Application',
                              style: TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Start a loan application.',
                              style: TextStyle(color: slateText, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: slateText),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),
            if (_pendingDisbursements.isNotEmpty) ...[
              _PendingDisbursementHomeTile(
                items: _pendingDisbursements,
                onTap: _openPendingDisbursements,
              ),
              const SizedBox(height: 18),
            ],
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
}

class _HomeProfileAvatar extends StatelessWidget {
  const _HomeProfileAvatar({required this.session});

  final RembehSession session;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(session.userName);
    final photoUrl = session.profilePhotoUrl;
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: sage,
        border: Border.all(color: line),
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child: photoUrl != null && photoUrl.isNotEmpty
          ? Image.network(
              photoUrl,
              width: 44,
              height: 44,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Text(
                initials,
                style: const TextStyle(
                  color: forestEmerald,
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            )
          : Text(
              initials,
              style: const TextStyle(
                color: forestEmerald,
                fontWeight: FontWeight.w800,
                fontSize: 14,
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
      return parts.first
          .substring(0, parts.first.length.clamp(0, 2))
          .toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }
}

class _PendingDisbursementHomeTile extends StatelessWidget {
  const _PendingDisbursementHomeTile({
    required this.items,
    required this.onTap,
  });

  final List<PendingDisbursement> items;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final total = items.fold<int>(0, (sum, item) => sum + item.remainingAmount);

    return Material(
      color: const Color(0xFFFFEAED),
      borderRadius: rembehBorderRadius(rembehRadiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFFFCAD1)),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Color(0xFFFFD9DF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.account_balance_wallet_outlined,
                  color: Color(0xFFE11D2E),
                  size: 25,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Pending Disbursements',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${items.length} borrower${items.length == 1 ? '' : 's'} have not received their full loans',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                'UGX ${formatMoney(total)}',
                style: const TextStyle(
                  color: Color(0xFFE11D2E),
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right, color: midnightNavy),
            ],
          ),
        ),
      ),
    );
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
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
          child: Container(
            constraints: const BoxConstraints(minHeight: 58),
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Column(
              children: [
                Container(
                  width: 23,
                  height: 23,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: rembehBorderRadius(rembehRadiusSm),
                  ),
                  child: Icon(icon, size: 13, color: iconColor),
                ),
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 9,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                SizedBox(
                  width: double.infinity,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      value,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: TextStyle(
                        color: valueColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HandoverStrip extends StatelessWidget {
  const _HandoverStrip({required this.status});

  final AgentDayStatus status;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 2, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: _HandoverMetric(
              label: 'Float received',
              value: status.float.amountReceived,
              icon: Icons.account_balance_wallet_outlined,
              iconColor: forestEmerald,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _HandoverMetric(
              label: 'Expected handover',
              value: status.float.expectedHandover,
              icon: Icons.outbox_outlined,
              iconColor: warmGold,
              onTap: () => _showExpectedHandoverSheet(context, status: status),
            ),
          ),
        ],
      ),
    );
  }
}

class _HandoverMetric extends StatelessWidget {
  const _HandoverMetric({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
    this.onTap,
  });

  final String label;
  final int value;
  final IconData icon;
  final Color iconColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 170;
        final iconSize = compact ? 22.0 : 24.0;

        return Container(
          constraints: const BoxConstraints(minHeight: 52),
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 7 : 9,
            vertical: compact ? 6 : 7,
          ),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.7),
            border: Border.all(color: Colors.white.withValues(alpha: 0.58)),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Container(
                    width: iconSize,
                    height: iconSize,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: iconColor.withValues(alpha: 0.12),
                      borderRadius: rembehBorderRadius(rembehRadiusSm),
                    ),
                    child: Icon(
                      icon,
                      color: iconColor,
                      size: compact ? 13 : 14,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        label,
                        maxLines: 1,
                        style: TextStyle(
                          color: slateText,
                          fontSize: compact ? 9.5 : 10,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              SizedBox(
                width: double.infinity,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'UGX ${formatMoney(value)}',
                    maxLines: 1,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                      height: 1.05,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );

    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: content,
      ),
    );
  }
}

void _showExpectedHandoverSheet(
  BuildContext context, {
  required AgentDayStatus status,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (_) {
      final float = status.float;
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.54,
        minChildSize: 0.36,
        maxChildSize: 0.76,
        builder: (context, controller) {
          return ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
            children: [
              Center(
                child: Container(
                  width: 34,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line.withValues(alpha: 0.78),
                    borderRadius: rembehBorderRadius(20),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Expected handover',
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  height: 1.08,
                ),
              ),
              const SizedBox(height: 12),
              _ExpectedHandoverTotalCard(amount: float.expectedHandover),
              const SizedBox(height: 12),
              _HandoverBreakdownCard(
                floatReceived: float.amountReceived,
                loansIssued: float.amountDisbursed,
                unusedFloat: float.unusedFloat,
                collectedRepayments: float.amountCollected,
                processingFees: float.processingFees,
                expectedHandover: float.expectedHandover,
              ),
            ],
          );
        },
      );
    },
  );
}

class _ExpectedHandoverTotalCard extends StatelessWidget {
  const _ExpectedHandoverTotalCard({required this.amount});

  final int amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 82),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: softIvory,
        borderRadius: rembehBorderRadius(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Expected to hand over',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 7),
                SizedBox(
                  width: double.infinity,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'UGX ${formatMoney(amount)}',
                      maxLines: 1,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                        height: 0.95,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.account_balance_wallet_outlined,
              color: forestEmerald,
              size: 26,
            ),
          ),
        ],
      ),
    );
  }
}

class _HandoverBreakdownCard extends StatelessWidget {
  const _HandoverBreakdownCard({
    required this.floatReceived,
    required this.loansIssued,
    required this.unusedFloat,
    required this.collectedRepayments,
    required this.processingFees,
    required this.expectedHandover,
  });

  final int floatReceived;
  final int loansIssued;
  final int unusedFloat;
  final int collectedRepayments;
  final int processingFees;
  final int expectedHandover;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 14, 13, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(14),
        boxShadow: [
          BoxShadow(
            color: midnightNavy.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Text(
              'Handover breakdown',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 15,
                fontWeight: FontWeight.w900,
                height: 1.1,
              ),
            ),
          ),
          _HandoverBreakdownLine(
            icon: Icons.file_download_outlined,
            label: 'Float received',
            value: floatReceived,
            iconColor: forestEmerald,
          ),
          _HandoverBreakdownLine(
            icon: Icons.open_in_new_rounded,
            label: 'Loans issued',
            value: loansIssued,
            iconColor: warmGold,
            subtract: true,
          ),
          const _HandoverDivider(),
          _HandoverBreakdownLine(
            icon: Icons.account_balance_wallet_outlined,
            label: 'Unused float',
            value: unusedFloat,
            iconColor: forestEmerald,
            valueColor: forestEmerald,
          ),
          _HandoverBreakdownLine(
            icon: Icons.payments_outlined,
            label: 'Collected repayments',
            value: collectedRepayments,
            iconColor: forestEmerald,
          ),
          _HandoverBreakdownLine(
            icon: Icons.percent_rounded,
            label: 'Processing fees',
            value: processingFees,
            iconColor: forestEmerald,
          ),
          const _HandoverDivider(),
          _HandoverTotalLine(value: expectedHandover),
        ],
      ),
    );
  }
}

class _HandoverBreakdownLine extends StatelessWidget {
  const _HandoverBreakdownLine({
    required this.icon,
    required this.label,
    required this.value,
    required this.iconColor,
    this.valueColor = midnightNavy,
    this.subtract = false,
  });

  final IconData icon;
  final String label;
  final int value;
  final Color iconColor;
  final Color valueColor;
  final bool subtract;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 15),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 6,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                height: 1.1,
              ),
            ),
          ),
          const SizedBox(width: 7),
          _FittedMoneyText(
            value: value,
            color: valueColor,
            subtract: subtract,
            fontSize: 14,
          ),
        ],
      ),
    );
  }
}

class _HandoverDivider extends StatelessWidget {
  const _HandoverDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      margin: const EdgeInsets.only(left: 0, right: 0, bottom: 13),
      color: line.withValues(alpha: 0.62),
    );
  }
}

class _HandoverTotalLine extends StatelessWidget {
  const _HandoverTotalLine({required this.value});

  final int value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          const Expanded(
            flex: 6,
            child: Text(
              'Expected handover',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: midnightNavy,
                fontSize: 14,
                fontWeight: FontWeight.w900,
                height: 1.1,
              ),
            ),
          ),
          const SizedBox(width: 8),
          _FittedMoneyText(value: value, color: forestEmerald, fontSize: 15),
        ],
      ),
    );
  }
}

class _FittedMoneyText extends StatelessWidget {
  const _FittedMoneyText({
    required this.value,
    required this.color,
    required this.fontSize,
    this.subtract = false,
  });

  final int value;
  final Color color;
  final double fontSize;
  final bool subtract;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      flex: 4,
      child: Align(
        alignment: Alignment.centerRight,
        child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerRight,
          child: Text(
            '${subtract ? '- ' : ''}UGX ${formatMoney(value)}',
            maxLines: 1,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w900,
              fontSize: fontSize,
              height: 1.05,
            ),
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
      color: const Color(0xFFFCFEFD),
      borderRadius: rembehBorderRadius(rembehRadiusLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: forestEmerald.withValues(alpha: 0.12)),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            boxShadow: [
              BoxShadow(
                color: midnightNavy.withValues(alpha: 0.03),
                blurRadius: 14,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 4,
                  color: warmGold.withValues(alpha: 0.75),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: sage,
                        borderRadius: rembehBorderRadius(rembehRadiusMd),
                      ),
                      child: Text(
                        client.initials,
                        style: const TextStyle(
                          color: forestEmerald,
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  client.fullName,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: midnightNavy,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 13.5,
                                    height: 1.12,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: sage.withValues(alpha: 0.8),
                                  borderRadius: rembehBorderRadius(
                                    rembehRadiusSm,
                                  ),
                                ),
                                child: Text(
                                  formatActivityTime(
                                    client.lastActivityAt,
                                    now,
                                  ),
                                  maxLines: 1,
                                  style: const TextStyle(
                                    color: slateText,
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w800,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text(
                            client.phone,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Row(
                            children: [
                              Expanded(
                                child: _ClientAmountLine(
                                  label: 'Paid',
                                  value: client.amountPaid,
                                  color: forestEmerald,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _ClientAmountLine(
                                  label: 'Due',
                                  value: client.loanAmount,
                                  color: warmGold,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          client.synced
                              ? Icons.check_circle
                              : Icons.cloud_outlined,
                          size: 15,
                          color: client.synced ? forestEmerald : warmGold,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          client.synced ? 'Uploaded' : 'Pending',
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
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

class _ClientAmountLine extends StatelessWidget {
  const _ClientAmountLine({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$label ',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: slateText,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatCompactMoney(value),
              maxLines: 1,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w900,
                height: 1,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
