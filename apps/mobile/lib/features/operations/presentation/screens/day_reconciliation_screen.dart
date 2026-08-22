import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../report/screens/daily_report_screen.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import '../sheets/submit_reconciliation_sheet.dart';
import '../sheets/update_cash_count_sheet.dart';

class DayReconciliationScreen extends StatefulWidget {
  const DayReconciliationScreen({
    super.key,
    required this.session,
    required this.date,
    this.branchId,
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  @override
  State<DayReconciliationScreen> createState() =>
      _DayReconciliationScreenState();
}

class _DayReconciliationScreenState extends State<DayReconciliationScreen> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  final TextEditingController _notesController = TextEditingController();

  Map<String, dynamic>? _data;

  bool _loading = true;
  bool _starting = false;
  bool _savingNotes = false;

  String? _error;

  Map<String, dynamic>? get _operation =>
      _data?['operation'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _reconciliation =>
      _data?['reconciliation'] as Map<String, dynamic>?;

  List<Map<String, dynamic>> get _agentReturns {
    final raw = _operation?['agentReturns'];

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().toList();
  }

  List<Map<String, dynamic>> get _variances {
    final raw = _operation?['variances'];

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().toList();
  }

  num get _expectedClosingBalance =>
      _num(_operation?['expectedClosingBalance']);

  num? get _countedCash {
    final reconciliationValue = _reconciliation?['countedCash'];

    if (reconciliationValue != null) {
      return _nullableNum(reconciliationValue);
    }

    return _nullableNum(_operation?['reconciliationCountedCash']);
  }

  num? get _variance {
    final reconciliationValue = _reconciliation?['variance'];

    if (reconciliationValue != null) {
      return _nullableNum(reconciliationValue);
    }

    return _nullableNum(_operation?['reconciliationVariance']);
  }

  num get _openingCash => _num(_operation?['openingBalance']);

  num get _capitalReceived => _num(_operation?['cashAddedToday']);

  num get _collections => _num(_operation?['collectionsReceived']);

  num get _processingFees => _num(_operation?['processingFeesTotal']);

  num get _expenses => _num(_operation?['expensesTotal']);

  num get _floatNotReturned {
    return _agentReturns.fold<num>(0, (total, row) {
      final expected = _num(row['expectedReturn']);

      final returned = _nullableNum(row['amountReturned']) ?? 0;

      final difference = expected - returned;

      return total + (difference > 0 ? difference : 0);
    });
  }

  bool get _hasPendingAgentReturns {
    return _agentReturns.any((row) {
      final expected = _num(row['expectedReturn']);

      final returned = _nullableNum(row['amountReturned']);

      if (returned == null) {
        return true;
      }

      return returned < expected;
    });
  }

  @override
  void initState() {
    super.initState();
    unawaited(_initialise());
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _initialise() async {
    await _load();

    if (!mounted || _operation == null) {
      return;
    }

    if (_reconciliation == null) {
      await _startReconciliation();
    }
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final data = await _api.getBranchOperation(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
      );

      if (!mounted) return;

      final reconciliation = data['reconciliation'] as Map<String, dynamic>?;

      final savedNotes = _string(reconciliation?['notes']) ?? '';

      setState(() {
        _data = data;
        _loading = false;

        if (_notesController.text != savedNotes) {
          _notesController.text = savedNotes;
        }
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  Future<void> _startReconciliation() async {
    if (_starting) return;

    setState(() {
      _starting = true;
      _error = null;
    });

    try {
      await _api.startOperationReconciliation(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
      );

      await _load();
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _starting = false;
        });
      }
    }
  }

  Future<void> _updateCount() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return UpdateCashCountSheet(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
          expectedClosingBalance: _expectedClosingBalance,
          currentCountedCash: _countedCash,
          cashCounts:
              (_reconciliation?['cashCounts'] as List?)
                  ?.whereType<Map<String, dynamic>>()
                  .toList() ??
              const [],
        );
      },
    );

    if (changed == true) {
      await _load();
    }
  }

  Future<void> _sendReport() async {
    if (_countedCash == null) {
      setState(() {
        _error = 'Count the physical branch cash before sending the report.';
      });

      return;
    }

    final submitted = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return SubmitReconciliationSheet(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
          expectedClosingBalance: _expectedClosingBalance,
          countedCash: _countedCash!,
          variance: _variance ?? 0,
          notes: _notesController.text.trim(),
        );
      },
    );

    if (submitted == null || !mounted) {
      return;
    }

    Navigator.of(context).pop(submitted);
  }

  Future<void> _saveForLater() async {
    if (_savingNotes) return;

    setState(() {
      _savingNotes = true;
      _error = null;
    });

    try {
      final response = await _api.updateOperationReconciliationNotes(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
        notes: _notesController.text.trim(),
      );

      final reconciliation =
          response['reconciliation'] as Map<String, dynamic>?;

      final savedNotes = reconciliation?['notes']?.toString() ?? '';

      if (_notesController.text != savedNotes) {
        _notesController.text = savedNotes;
      }

      if (!mounted) return;

      Navigator.of(context).pop(false);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _savingNotes = false;
        });
      }
    }
  }

  Future<void> _viewReport() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DailyReportScreen(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final countedCash = _countedCash;
    final variance = _variance;

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () {
            Navigator.of(context).pop(false);
          },
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: midnightNavy,
            size: 22,
          ),
        ),
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Day reconciliation',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                Text(
                  _displayDate(widget.date),
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 4,
                  height: 4,
                  decoration: const BoxDecoration(
                    color: forestEmerald,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  'Reconciliation in progress',
                  style: TextStyle(
                    color: forestEmerald,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF4EC),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: forestEmerald.withValues(alpha: 0.16),
                  ),
                ),
                child: const Row(
                  children: [
                    ContainerDot(),
                    SizedBox(width: 5),
                    Text(
                      'Open day',
                      style: TextStyle(
                        color: forestEmerald,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: _loading && _data == null
          ? const Center(child: CircularProgressIndicator(color: forestEmerald))
          : RefreshIndicator(
              color: forestEmerald,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 150),
                children: [
                  if (_error != null) ...[
                    _ErrorCard(message: _error!),
                    const SizedBox(height: 10),
                  ],

                  _CashReconciliationSummary(
                    expected: _expectedClosingBalance,
                    counted: countedCash,
                    variance: variance,
                    openingCash: _openingCash,
                    capitalReceived: _capitalReceived,
                    collections: _collections,
                    processingFees: _processingFees,
                    expenses: _expenses,
                    floatNotReturned: _floatNotReturned,
                    onUpdateCount: _updateCount,
                  ),

                  const SizedBox(height: 10),

                  _AgentReturnsCard(
                    agents: _agentReturns,
                    hasPending: _hasPendingAgentReturns,
                  ),

                  const SizedBox(height: 10),

                  if (_variances.isNotEmpty || (variance ?? 0) != 0)
                    _DiscrepanciesCard(
                      variances: _variances,
                      fallbackVariance: variance,
                    ),

                  if (_variances.isNotEmpty || (variance ?? 0) != 0)
                    const SizedBox(height: 10),

                  _NotesCard(controller: _notesController),
                ],
              ),
            ),
      bottomNavigationBar: _loading && _data == null
          ? null
          : SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: line)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _viewReport,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(52),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              side: const BorderSide(color: forestEmerald),
                            ),
                            child: const _BottomActionContent(
                              icon: Icons.description_outlined,
                              title: 'View report',
                              subtitle: 'Preview daily report',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton(
                            onPressed: countedCash == null ? null : _sendReport,
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(52),
                              backgroundColor: forestEmerald,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                            ),
                            child: const _BottomActionContent(
                              icon: Icons.send_outlined,
                              title: 'Send report',
                              subtitle: 'To organization owner',
                              light: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _savingNotes ? null : _saveForLater,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(52),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              side: const BorderSide(color: forestEmerald),
                            ),
                            child: _savingNotes
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: forestEmerald,
                                    ),
                                  )
                                : const _BottomActionContent(
                                    icon: Icons.save_outlined,
                                    title: 'Save for later',
                                    subtitle: 'Continue later',
                                  ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.lock_outline_rounded,
                          size: 12,
                          color: slateText,
                        ),
                        SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            'Once the report is sent, the day will be closed and no more transactions can be recorded.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: slateText,
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
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

class ContainerDot extends StatelessWidget {
  const ContainerDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 5,
      height: 5,
      decoration: const BoxDecoration(
        color: forestEmerald,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _CashReconciliationSummary extends StatelessWidget {
  const _CashReconciliationSummary({
    required this.expected,
    required this.counted,
    required this.variance,
    required this.openingCash,
    required this.capitalReceived,
    required this.collections,
    required this.processingFees,
    required this.expenses,
    required this.floatNotReturned,
    required this.onUpdateCount,
  });

  final num expected;
  final num? counted;
  final num? variance;

  final num openingCash;
  final num capitalReceived;
  final num collections;
  final num processingFees;
  final num expenses;
  final num floatNotReturned;

  final VoidCallback onUpdateCount;

  @override
  Widget build(BuildContext context) {
    final currentVariance = variance ?? 0;

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Expanded(
                child: Text(
                  'Cash reconciliation summary',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Icon(Icons.info_outline_rounded, size: 16, color: slateText),
            ],
          ),

          const SizedBox(height: 14),

          Row(
            children: [
              Expanded(
                child: _SummaryMetric(
                  label: 'Expected cash',
                  value: 'UGX ${formatMoney(expected)}',
                  color: forestEmerald,
                ),
              ),
              const _VerticalDivider(),
              Expanded(
                child: _SummaryMetric(
                  label: 'Counted cash',
                  value: counted == null
                      ? 'Not counted'
                      : 'UGX ${formatMoney(counted!)}',
                ),
              ),
              const _VerticalDivider(),
              Expanded(
                child: _SummaryMetric(
                  label: 'Variance',
                  value: counted == null
                      ? '—'
                      : '${currentVariance < 0
                            ? '- '
                            : currentVariance > 0
                            ? '+ '
                            : ''}UGX ${formatMoney(currentVariance.abs())}',
                  color: currentVariance < 0
                      ? const Color(0xFFB42318)
                      : forestEmerald,
                  badge: counted != null && currentVariance != 0
                      ? currentVariance < 0
                            ? 'Shortage'
                            : 'Excess'
                      : null,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),
          const Divider(height: 1, color: line),
          const SizedBox(height: 10),

          _CashRow(label: 'Opening cash', value: openingCash),
          _CashRow(label: 'Capital received', value: capitalReceived),
          _CashRow(label: 'Collections', value: collections, positive: true),
          _CashRow(
            label: 'Processing fees',
            value: processingFees,
            positive: true,
          ),
          _CashRow(label: 'Expenses', value: expenses, negative: true),
          _CashRow(
            label: 'Float with field officers (not returned)',
            value: floatNotReturned,
            negative: true,
          ),

          const SizedBox(height: 8),
          const Divider(height: 1, color: line),
          const SizedBox(height: 10),

          _CashRow(
            label: 'Expected cash',
            value: expected,
            emphasized: true,
            positive: true,
          ),

          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFFF5F7FC),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.fact_check_outlined,
                  size: 19,
                  color: midnightNavy,
                ),
                const SizedBox(width: 9),
                const Expanded(
                  child: Text(
                    'Count and confirm the physical cash',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                OutlinedButton(
                  onPressed: onUpdateCount,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(94, 34),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: Text(
                    counted == null ? 'Count cash' : 'Update count',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentReturnsCard extends StatelessWidget {
  const _AgentReturnsCard({required this.agents, required this.hasPending});

  final List<Map<String, dynamic>> agents;
  final bool hasPending;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.groups_2_outlined, size: 19, color: forestEmerald),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Field officer float returns',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                'View all field officers',
                style: TextStyle(
                  color: forestEmerald,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
            color: const Color(0xFFFAFAFA),
            child: const Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Text('Field officer', style: _tableHeaderStyle),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Float issued',
                    textAlign: TextAlign.right,
                    style: _tableHeaderStyle,
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Returned',
                    textAlign: TextAlign.right,
                    style: _tableHeaderStyle,
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Balance',
                    textAlign: TextAlign.right,
                    style: _tableHeaderStyle,
                  ),
                ),
              ],
            ),
          ),

          for (final agent in agents) _AgentReturnRow(agent: agent),

          if (agents.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Text(
                'No field officer float was issued today.',
                textAlign: TextAlign.center,
                style: TextStyle(color: slateText, fontSize: 10),
              ),
            ),

          if (hasPending) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7ED),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: const Row(
                children: [
                  Icon(
                    Icons.warning_amber_rounded,
                    color: Color(0xFFD97706),
                    size: 20,
                  ),
                  SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Some float has not been returned.',
                          style: TextStyle(
                            color: Color(0xFF92400E),
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Follow up with the field officers before sending the report.',
                          style: TextStyle(
                            color: slateText,
                            fontSize: 9,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AgentReturnRow extends StatelessWidget {
  const _AgentReturnRow({required this.agent});

  final Map<String, dynamic> agent;

  @override
  Widget build(BuildContext context) {
    final name = _string(agent['agentName']) ?? 'Field Officer';

    final issued = _num(agent['amountGiven']);

    final returned = _nullableNum(agent['amountReturned']) ?? 0;

    final expected = _num(agent['expectedReturn']);

    final balance = expected - returned;

    final balanced = balance <= 0;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: line)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Row(
              children: [
                CircleAvatar(
                  radius: 15,
                  backgroundColor: forestEmerald.withValues(alpha: 0.08),
                  child: Text(
                    _initials(name),
                    style: const TextStyle(
                      color: forestEmerald,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              'UGX ${formatMoney(issued)}',
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              'UGX ${formatMoney(returned)}',
              textAlign: TextAlign.right,
              style: TextStyle(
                color: balanced ? forestEmerald : const Color(0xFFB42318),
                fontSize: 9,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    'UGX ${formatMoney(balance.abs())}',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: balanced ? forestEmerald : const Color(0xFFB42318),
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  balanced
                      ? Icons.check_circle_outline
                      : Icons.warning_amber_rounded,
                  color: balanced ? forestEmerald : const Color(0xFFB42318),
                  size: 14,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DiscrepanciesCard extends StatelessWidget {
  const _DiscrepanciesCard({
    required this.variances,
    required this.fallbackVariance,
  });

  final List<Map<String, dynamic>> variances;
  final num? fallbackVariance;

  @override
  Widget build(BuildContext context) {
    final rows = variances.isNotEmpty
        ? variances
        : [
            {
              'source': 'Shortage',
              'notes': 'Variance between expected and counted cash',
              'variance': fallbackVariance ?? 0,
            },
          ];

    final total = rows.fold<num>(
      0,
      (sum, row) => sum + _num(row['variance']).abs(),
    );

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.warning_amber_rounded,
                color: Color(0xFFB42318),
                size: 19,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Discrepancies',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                'Total: UGX ${formatMoney(total)}',
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _string(row['source']) ?? 'Shortage',
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _string(row['notes']) ??
                              'Variance between expected and counted cash',
                          style: const TextStyle(color: slateText, fontSize: 9),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'UGX ${formatMoney(_num(row['variance']).abs())}',
                    style: const TextStyle(
                      color: Color(0xFFB42318),
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: midnightNavy,
                    size: 17,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NotesCard extends StatelessWidget {
  const _NotesCard({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.note_alt_outlined, color: forestEmerald, size: 19),
              SizedBox(width: 8),
              Text(
                'Reconciliation notes',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
              SizedBox(width: 4),
              Text(
                '(optional)',
                style: TextStyle(color: slateText, fontSize: 9),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: controller,
            maxLines: 3,
            maxLength: 300,
            decoration: const InputDecoration(
              hintText:
                  'Add any notes or details about today’s reconciliation...',
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomActionContent extends StatelessWidget {
  const _BottomActionContent({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.light = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final color = light ? Colors.white : forestEmerald;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 17, color: color),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                title,
                maxLines: 1,
                style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 1),
        Text(
          subtitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: light ? Colors.white.withValues(alpha: 0.8) : slateText,
            fontSize: 7.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    this.color = midnightNavy,
    this.badge,
  });

  final String label;
  final String value;
  final Color color;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: slateText,
            fontSize: 9,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        if (badge != null) ...[
          const SizedBox(height: 3),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              badge!,
              style: TextStyle(
                color: color,
                fontSize: 8,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CashRow extends StatelessWidget {
  const _CashRow({
    required this.label,
    required this.value,
    this.positive = false,
    this.negative = false,
    this.emphasized = false,
  });

  final String label;
  final num value;
  final bool positive;
  final bool negative;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final valueColor = negative
        ? const Color(0xFFB42318)
        : positive
        ? forestEmerald
        : midnightNavy;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: emphasized ? midnightNavy : slateText,
                fontSize: 10,
                fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
          Text(
            '${positive
                ? '+ '
                : negative
                ? '- '
                : ''}UGX ${formatMoney(value.abs())}',
            style: TextStyle(
              color: valueColor,
              fontSize: 10,
              fontWeight: emphasized ? FontWeight.w900 : FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: child,
    );
  }
}

class _VerticalDivider extends StatelessWidget {
  const _VerticalDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 58, color: line);
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFB42318).withValues(alpha: 0.07),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: Color(0xFFB42318),
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

const _tableHeaderStyle = TextStyle(
  color: slateText,
  fontSize: 8,
  fontWeight: FontWeight.w700,
);

num _num(Object? value) {
  if (value is num) {
    return value;
  }

  if (value is String) {
    return num.tryParse(value) ?? 0;
  }

  return 0;
}

num? _nullableNum(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is num) {
    return value;
  }

  if (value is String) {
    return num.tryParse(value);
  }

  return null;
}

String? _string(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return null;
}

String _initials(String value) {
  final parts = value
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

  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

String _displayDate(String raw) {
  final parsed = DateTime.tryParse(raw);

  if (parsed == null) {
    return raw;
  }

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

  return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
}
