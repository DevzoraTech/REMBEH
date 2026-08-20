import 'package:flutter/material.dart';

import '../../models/field_records.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/money.dart';
import 'needs_attention_section.dart';
import 'recent_activity_list.dart';
import 'stat_card.dart';

class ManagerOwnerHomeTab extends StatefulWidget {
  const ManagerOwnerHomeTab({
    super.key,
    required this.session,
    required this.onOpenProfile,
    required this.onOpenSearch,
    required this.onOpenRecords,
    required this.onOpenNewLoan,
    required this.onOpenNewBorrower,
    required this.onOpenDailyOps,
    required this.onOpenRecordRepayment,
    required this.onOpenFindClient,

    // Finance
    this.collectedToday = 0,
    this.expensesToday = 0,
    this.shortagesAmount = 0,
    this.expectedClosingCash = 0,

    // Loans
    this.loansIssuedToday = 0,
    this.amountIssuedToday = 0,
    this.overdueLoansCount = 0,
    this.activeLoansCount = 0,

    // Borrowers
    this.borrowersDueToday = 0,
    this.newBorrowersToday = 0,
    this.overdueBorrowersCount = 0,
    this.activeBorrowersCount = 0,

    // Alerts/activity
    this.attentionItems = const [],
    this.recentActivities = const [],
  });

  final RembehSession session;

  final VoidCallback onOpenProfile;
  final VoidCallback onOpenSearch;

  final void Function({
    RecordsSection section,
    RecordsFilter filter,
  }) onOpenRecords;

  final VoidCallback onOpenNewLoan;
  final VoidCallback onOpenNewBorrower;
  final VoidCallback onOpenDailyOps;
  final VoidCallback onOpenRecordRepayment;
  final VoidCallback onOpenFindClient;

  // Finance
  final int collectedToday;
  final int expensesToday;
  final int shortagesAmount;
  final int expectedClosingCash;

  // Loans
  final int loansIssuedToday;
  final int amountIssuedToday;
  final int overdueLoansCount;
  final int activeLoansCount;

  // Borrowers
  final int borrowersDueToday;
  final int newBorrowersToday;
  final int overdueBorrowersCount;
  final int activeBorrowersCount;

  // Alerts/activity
  final List<AttentionItem> attentionItems;
  final List<ActivityItem> recentActivities;

  @override
  State<ManagerOwnerHomeTab> createState() =>
      _ManagerOwnerHomeTabState();
}

class _ManagerOwnerHomeTabState extends State<ManagerOwnerHomeTab> {
  late final PageController _pageController;

  int _currentPage = 0;

  @override
  void initState() {
    super.initState();

    _pageController = PageController(
      viewportFraction: 0.88,
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Home only previews the first 2 records.
    // Everything else remains available through View all.
    final visibleAttentionItems =
        widget.attentionItems.take(2).toList(growable: false);

    final visibleRecentActivities =
        widget.recentActivities.take(2).toList(growable: false);

    return SafeArea(
      top: false,
      bottom: false,
      child: ListView(
        padding: EdgeInsets.zero,
        physics: const BouncingScrollPhysics(),
        children: [
          // ------------------------------------------------------------------
          // Summary cards
          // ------------------------------------------------------------------

          const SizedBox(height: 14),

          _buildSummaryCarousel(),

          const SizedBox(height: 10),

          _buildPageIndicators(),

          // ------------------------------------------------------------------
          // Search
          // ------------------------------------------------------------------

          const SizedBox(height: 14),

          _buildSearchBar(),

          // ------------------------------------------------------------------
          // Quick actions
          // ------------------------------------------------------------------

          const SizedBox(height: 16),

          _buildQuickActions(),

          // ------------------------------------------------------------------
          // Needs attention
          // ------------------------------------------------------------------

          if (visibleAttentionItems.isNotEmpty) ...[
            const SizedBox(height: 22),

            NeedsAttentionSection(
              items: visibleAttentionItems,
              onViewAll: () {
                widget.onOpenRecords(
                  section: RecordsSection.applications,
                  filter: RecordsFilter.all,
                );
              },
            ),
          ],

          // ------------------------------------------------------------------
          // Recent activity
          // ------------------------------------------------------------------

          if (visibleRecentActivities.isNotEmpty) ...[
            const SizedBox(height: 20),

            RecentActivityList(
              activities: visibleRecentActivities,
              onViewAll: () {
                widget.onOpenRecords(
                  section: RecordsSection.repayments,
                  filter: RecordsFilter.all,
                );
              },
            ),
          ],

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ==========================================================================
  // SUMMARY CAROUSEL
  // ==========================================================================

  Widget _buildSummaryCarousel() {
    return SizedBox(
      height: 188,
      child: PageView(
        controller: _pageController,
        padEnds: false,
        physics: const BouncingScrollPhysics(),
        onPageChanged: (index) {
          if (_currentPage == index) return;

          setState(() {
            _currentPage = index;
          });
        },
        children: [
          // ------------------------------------------------------------------
          // Finances
          // ------------------------------------------------------------------

          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: StatCard(
              title: 'Finances',
              subtitle: 'Today',
              icon: Icons.account_balance_wallet_outlined,
              iconBackgroundColor: forestEmerald,
              primaryMetricLabel: 'Collected today',
              primaryMetricValue:
                  'UGX ${formatMoney(widget.collectedToday)}',
              primaryMetricColor: forestEmerald,
              supportingMetrics: [
                SupportingMetric(
                  icon: Icons.north_east_rounded,
                  iconColor: forestEmerald,
                  label: 'Expenses',
                  value: 'UGX ${formatMoney(widget.expensesToday)}',
                ),
                SupportingMetric(
                  icon: Icons.warning_amber_rounded,
                  iconColor: warmGold,
                  label: 'Shortages',
                  value: 'UGX ${formatMoney(widget.shortagesAmount)}',
                ),
              ],
              overallLabel: 'Overall | Expected closing cash',
              overallValue:
                  'UGX ${formatMoney(widget.expectedClosingCash)}',
              buttonLabel: 'Open',
            ),
          ),

          // ------------------------------------------------------------------
          // Loans
          // ------------------------------------------------------------------

          StatCard(
            title: 'Loans',
            subtitle: 'Today',
            icon: Icons.business_center_outlined,
            iconBackgroundColor: const Color(0xFF6D50B5),
            primaryMetricLabel: 'Loans issued today',
            primaryMetricValue: '${widget.loansIssuedToday}',
            primaryMetricColor: const Color(0xFF6D50B5),
            supportingMetrics: [
              SupportingMetric(
                icon: Icons.bar_chart_rounded,
                iconColor: const Color(0xFF6D50B5),
                label: 'Amount issued',
                value: 'UGX ${formatMoney(widget.amountIssuedToday)}',
              ),
              SupportingMetric(
                icon: Icons.warning_amber_rounded,
                iconColor: warmGold,
                label: 'Overdue loans',
                value: '${widget.overdueLoansCount}',
              ),
            ],
            overallLabel: 'Overall | Active loans',
            overallValue: '${widget.activeLoansCount}',
          ),

          // ------------------------------------------------------------------
          // Borrowers
          // ------------------------------------------------------------------

          Padding(
            padding: const EdgeInsets.only(right: 18),
            child: StatCard(
              title: 'Borrowers',
              subtitle: 'Today',
              icon: Icons.people_outline_rounded,
              iconBackgroundColor: const Color(0xFFB96D15),
              primaryMetricLabel: 'Borrowers due today',
              primaryMetricValue: '${widget.borrowersDueToday}',
              primaryMetricColor: const Color(0xFFA35808),
              supportingMetrics: [
                SupportingMetric(
                  icon: Icons.person_add_alt_1_outlined,
                  iconColor: forestEmerald,
                  label: 'New borrowers',
                  value: '${widget.newBorrowersToday}',
                ),
                SupportingMetric(
                  icon: Icons.warning_amber_rounded,
                  iconColor: warmGold,
                  label: 'Overdue borrowers',
                  value: '${widget.overdueBorrowersCount}',
                ),
              ],
              overallLabel: 'Overall | Active borrowers',
              overallValue: '${widget.activeBorrowersCount}',
            ),
          ),
        ],
      ),
    );
  }

  // ==========================================================================
  // PAGE INDICATORS
  // ==========================================================================

  Widget _buildPageIndicators() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(
        3,
        (index) {
          final active = index == _currentPage;

          return AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            width: active ? 8 : 7,
            height: active ? 8 : 7,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: active
                  ? forestEmerald
                  : const Color(0xFFE0E5E2),
              shape: BoxShape.circle,
            ),
          );
        },
      ),
    );
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: widget.onOpenSearch,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 50,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(
                color: const Color(0xFFD8DDDA),
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              children: [
                Icon(
                  Icons.search_rounded,
                  size: 22,
                  color: Color(0xFF555B62),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Find client by name or phone number',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Color(0xFF666B71),
                      fontSize: 13.5,
                      fontWeight: FontWeight.w400,
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

  // ==========================================================================
  // QUICK ACTIONS
  // ==========================================================================

  Widget _buildQuickActions() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Quick actions',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 15,
              fontWeight: FontWeight.w800,
              height: 1.1,
            ),
          ),

          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(
                child: _QuickActionTile(
                  icon: Icons.payments_outlined,
                  label: 'Record\nrepayment',
                  onTap: widget.onOpenRecordRepayment,
                ),
              ),

              const SizedBox(width: 10),

              Expanded(
                child: _QuickActionTile(
                  icon: Icons.note_add_outlined,
                  label: 'New loan',
                  onTap: widget.onOpenNewLoan,
                ),
              ),

              const SizedBox(width: 10),

              Expanded(
                child: _QuickActionTile(
                  icon: Icons.person_add_alt_1_outlined,
                  label: 'New borrower',
                  onTap: widget.onOpenNewBorrower,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// QUICK ACTION TILE
// ============================================================================

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 86,
          padding: const EdgeInsets.symmetric(
            horizontal: 8,
            vertical: 11,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(
              color: const Color(0xFFEDF0EE),
            ),
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [
              BoxShadow(
                color: Color(0x09000000),
                blurRadius: 9,
                offset: Offset(0, 3),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: forestEmerald,
                size: 27,
              ),

              const SizedBox(height: 8),

              Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
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