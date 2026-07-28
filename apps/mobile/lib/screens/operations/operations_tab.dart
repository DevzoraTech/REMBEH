import 'package:flutter/material.dart';

import '../../features/applications_list/data/applications_live_store.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../models/field_records.dart';
import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/money.dart';
import '../loan_application/new_loan_application_screen.dart';
import '../records/records_tab.dart';

enum OperationsMode { overview, collections, loans, wallet }

class OperationsTab extends StatefulWidget {
  const OperationsTab({
    super.key,
    required this.session,
    required this.mode,
    required this.recordsSection,
    required this.recordsFilter,
    required this.onModeChanged,
    required this.onRecordsSectionChanged,
    required this.onRecordsFilterChanged,
  });

  final RembehSession session;
  final OperationsMode mode;
  final RecordsSection recordsSection;
  final RecordsFilter recordsFilter;
  final ValueChanged<OperationsMode> onModeChanged;
  final ValueChanged<RecordsSection> onRecordsSectionChanged;
  final ValueChanged<RecordsFilter> onRecordsFilterChanged;

  @override
  State<OperationsTab> createState() => _OperationsTabState();
}

class _OperationsTabState extends State<OperationsTab> {
  final _api = ApiClient(SessionStore());
  final _repayments = RepaymentsLiveStore.instance;
  final _applications = ApplicationsLiveStore.instance;
  _AgentOperation? _operation;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _repayments
      ..addListener(_onLiveChanged)
      ..start(widget.session);
    _applications
      ..addListener(_onLiveChanged)
      ..start(widget.session);
    _load();
  }

  @override
  void dispose() {
    _repayments.removeListener(_onLiveChanged);
    _applications.removeListener(_onLiveChanged);
    super.dispose();
  }

  void _onLiveChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = await _api.getMyAgentDetail(session: widget.session);
      if (!mounted) return;
      setState(() {
        _operation = _AgentOperation.fromApi(
          payload['agent'] as Map<String, dynamic>? ?? const {},
        );
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      _load(),
      _repayments.refresh(),
      _applications.refresh(),
    ]);
  }

  Future<void> _openNewLoan() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => NewLoanApplicationScreen(session: widget.session),
      ),
    );
    if (created == true) {
      await Future.wait([_applications.refresh(), _load()]);
    }
  }

  void _openRecords(RecordsSection section, RecordsFilter filter) {
    widget.onRecordsSectionChanged(section);
    widget.onRecordsFilterChanged(filter);
    widget.onModeChanged(
      section == RecordsSection.repayments
          ? OperationsMode.collections
          : OperationsMode.loans,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.mode == OperationsMode.collections ||
        widget.mode == OperationsMode.loans) {
      return RecordsTab(
        session: widget.session,
        section: widget.recordsSection,
        filter: widget.recordsFilter,
        onSectionChanged: widget.onRecordsSectionChanged,
        onFilterChanged: widget.onRecordsFilterChanged,
        title: widget.mode == OperationsMode.collections
            ? 'Collections'
            : 'Loans',
        onBack: () => widget.onModeChanged(OperationsMode.overview),
      );
    }

    if (widget.mode == OperationsMode.wallet) {
      return _WalletView(
        operation: _operation,
        loading: _loading,
        error: _error,
        onRefresh: _refreshAll,
        onBack: () => widget.onModeChanged(OperationsMode.overview),
      );
    }

    return SafeArea(
      child: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _refreshAll,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Operations',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _refreshAll,
                  icon: const Icon(Icons.refresh, color: midnightNavy),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              widget.session.branchName ?? 'Assigned branch',
              style: const TextStyle(
                color: forestEmerald,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 14),
            _DailyOperationsCard(
              operation: _operation,
              customersDue: _repayments.summary.dueTodayCount,
              loading: _loading,
              error: _error,
              onRetry: _load,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _ActionCard(
                    icon: Icons.note_add_outlined,
                    title: 'New Loan',
                    subtitle: 'Start application',
                    onTap: _openNewLoan,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ActionCard(
                    icon: Icons.payments_outlined,
                    title: 'Collect Payment',
                    subtitle: 'Due today',
                    onTap: () => _openRecords(
                      RecordsSection.repayments,
                      RecordsFilter.dueToday,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _OperationMenuTile(
              icon: Icons.assignment_turned_in_outlined,
              title: 'Collections',
              subtitle:
                  '${_repayments.summary.dueTodayCount} due today · ${formatMoney(_repayments.summary.amountCollectedToday)} collected',
              onTap: () =>
                  _openRecords(RecordsSection.repayments, RecordsFilter.all),
            ),
            _OperationMenuTile(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Loans',
              subtitle:
                  '${_applications.applications.length} submitted applications',
              onTap: () =>
                  _openRecords(RecordsSection.applications, RecordsFilter.all),
            ),
            _OperationMenuTile(
              icon: Icons.wallet_outlined,
              title: 'Wallet',
              subtitle: 'Float, collections held, expected cash',
              onTap: () => widget.onModeChanged(OperationsMode.wallet),
            ),
          ],
        ),
      ),
    );
  }
}

class _AgentOperation {
  const _AgentOperation({
    required this.status,
    required this.floatReceived,
    required this.loansIssued,
    required this.collections,
    required this.expectedCash,
    required this.remainingFloat,
    required this.floatRecordedAt,
    required this.recordedBy,
  });

  final String status;
  final int floatReceived;
  final int loansIssued;
  final int collections;
  final int expectedCash;
  final int remainingFloat;
  final DateTime? floatRecordedAt;
  final String? recordedBy;

  factory _AgentOperation.fromApi(Map<String, dynamic> json) {
    final accountability =
        json['accountability'] as Map<String, dynamic>? ?? const {};
    final float = json['float'] as Map<String, dynamic>?;
    final floatReceived = ((accountability['amountGiven'] as num?) ?? 0)
        .round();
    final loansIssued = ((accountability['amountDisbursed'] as num?) ?? 0)
        .round();
    final collections = ((accountability['amountCollected'] as num?) ?? 0)
        .round();
    final remainingFloat =
        ((floatReceived - loansIssued).clamp(0, 1 << 31) as num).round();
    return _AgentOperation(
      status: floatReceived > 0 ? 'Working' : 'Waiting for float',
      floatReceived: floatReceived,
      loansIssued: loansIssued,
      collections: collections,
      expectedCash: ((accountability['expectedCash'] as num?) ?? 0).round(),
      remainingFloat: remainingFloat,
      floatRecordedAt: DateTime.tryParse(float?['recordedAt'] as String? ?? ''),
      recordedBy: float?['recordedByName'] as String?,
    );
  }
}

class _DailyOperationsCard extends StatelessWidget {
  const _DailyOperationsCard({
    required this.operation,
    required this.customersDue,
    required this.loading,
    required this.error,
    required this.onRetry,
  });

  final _AgentOperation? operation;
  final int customersDue;
  final bool loading;
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading && operation == null) {
      return const _Panel(
        child: Padding(
          padding: EdgeInsets.all(28),
          child: Center(child: CircularProgressIndicator(color: forestEmerald)),
        ),
      );
    }

    if (error != null && operation == null) {
      return _Panel(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFC62828)),
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final data =
        operation ??
        const _AgentOperation(
          status: 'Waiting for float',
          floatReceived: 0,
          loansIssued: 0,
          collections: 0,
          expectedCash: 0,
          remainingFloat: 0,
          floatRecordedAt: null,
          recordedBy: null,
        );

    return _Panel(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Daily Operations',
                    style: TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: data.floatReceived > 0
                        ? sage
                        : warmGold.withValues(alpha: 0.12),
                    border: Border.all(
                      color: data.floatReceived > 0 ? forestEmerald : warmGold,
                    ),
                    borderRadius: rembehBorderRadius(rembehRadiusSm),
                  ),
                  child: Text(
                    data.status,
                    style: TextStyle(
                      color: data.floatReceived > 0
                          ? forestEmerald
                          : midnightNavy,
                      fontWeight: FontWeight.w900,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
            if (data.recordedBy != null && data.recordedBy!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Float recorded by ${data.recordedBy}',
                style: const TextStyle(color: slateText, fontSize: 12),
              ),
            ],
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              childAspectRatio: 1.85,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
                _MetricBox(label: 'Today\'s float', value: data.floatReceived),
                _MetricBox(
                  label: 'Remaining float',
                  value: data.remainingFloat,
                ),
                _MetricBox(label: 'Loans issued', value: data.loansIssued),
                _MetricBox(label: 'Collected', value: data.collections),
                _MetricBox(
                  label: 'Expected cash',
                  value: data.expectedCash,
                  highlight: true,
                ),
                _MetricBox(
                  label: 'Customers due',
                  value: customersDue,
                  money: false,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WalletView extends StatelessWidget {
  const _WalletView({
    required this.operation,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onBack,
  });

  final _AgentOperation? operation;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final data =
        operation ??
        const _AgentOperation(
          status: 'Waiting for float',
          floatReceived: 0,
          loansIssued: 0,
          collections: 0,
          expectedCash: 0,
          remainingFloat: 0,
          floatRecordedAt: null,
          recordedBy: null,
        );

    return SafeArea(
      child: RefreshIndicator(
        color: forestEmerald,
        onRefresh: onRefresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back, color: midnightNavy),
                ),
                const Expanded(
                  child: Text(
                    'Wallet',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (loading && operation == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if (error != null && operation == null)
              _Panel(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFC62828)),
                  ),
                ),
              )
            else ...[
              _WalletLine(label: 'Opening float', value: data.floatReceived),
              _WalletLine(label: 'Current float', value: data.remainingFloat),
              _WalletLine(label: 'Collections held', value: data.collections),
              _WalletLine(label: 'Loans issued', value: data.loansIssued),
              _WalletLine(
                label: 'Expected return',
                value: data.expectedCash,
                highlight: true,
              ),
              const SizedBox(height: 12),
              const _Panel(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Manager verification will appear here after the end-day flow is enabled.',
                    style: TextStyle(color: slateText, fontSize: 13),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: forestEmerald),
              const SizedBox(height: 10),
              Text(
                title,
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(color: slateText, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OperationMenuTile extends StatelessWidget {
  const _OperationMenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.white,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Row(
              children: [
                Icon(icon, color: forestEmerald),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(color: slateText, fontSize: 12),
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
    );
  }
}

class _MetricBox extends StatelessWidget {
  const _MetricBox({
    required this.label,
    required this.value,
    this.highlight = false,
    this.money = true,
  });

  final String label;
  final int value;
  final bool highlight;
  final bool money;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlight ? sage : softIvory,
        border: Border.all(color: highlight ? forestEmerald : line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(color: slateText, fontSize: 11)),
          const SizedBox(height: 4),
          Text(
            money ? 'UGX ${formatMoney(value)}' : '$value',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: highlight ? forestEmerald : midnightNavy,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletLine extends StatelessWidget {
  const _WalletLine({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final int value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: highlight ? sage : Colors.white,
        border: Border.all(color: highlight ? forestEmerald : line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(value)}',
            style: TextStyle(
              color: highlight ? forestEmerald : midnightNavy,
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: child,
    );
  }
}
