import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../report/screens/daily_report_screen.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import '../../domain/models/agent_float_position.dart';
import '../sheets/submit_reconciliation_sheet.dart';
import '../sheets/update_cash_count_sheet.dart';
import 'agent_positions_screen.dart';

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

  List<AgentFloatPosition> get _activeOfficerPositions {
    return _agentReturns
        .map(_positionFromReturn)
        .where((position) => position.id.isNotEmpty && position.isActiveToday)
        .toList(growable: false);
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

  num get _expenses => _firstAvailableMoney(_operation ?? const {}, const [
    'expensesTotal',
    'branchCashExpensesTotal',
  ]);

  num get _salaries => _num(_operation?['salariesTotal']);

  num get _loansIssued => _firstAvailableMoney(_operation ?? const {}, const [
    'loansIssuedPrincipal',
    'loansDisbursed',
  ]);

  num get _shortageRecoveries =>
      _num(_operation?['shortageRecoveriesTotal']);

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

  bool get _canBalanceFieldOfficers {
    final status = (_string(_operation?['status']) ?? '').toUpperCase();

    return status == 'OPEN' || status == 'CLOSING' || status == 'RECONCILING';
  }

  AgentFloatPosition _positionFromReturn(Map<String, dynamic> position) {
    return AgentFloatPosition(
      id: _string(position['agentId']) ?? '',
      name: _string(position['agentName']) ?? 'Field Officer',
      phone: _string(position['agentPhone']) ?? _string(position['phone']),
      roleName:
          _string(position['agentRoleName']) ??
          _string(position['roleName']) ??
          'Field Officer',
      photoUrl:
          _string(position['agentPhotoUrl']) ?? _string(position['photoUrl']),
      publicId:
          _string(position['agentPublicId']) ?? _string(position['publicId']),
      remainingFloat: _firstAvailableMoney(position, const [
        'unusedFloat',
        'remainingFloat',
      ]),
      floatAllocated: _firstAvailableMoney(position, const [
        'amountGiven',
        'floatRemaining',
      ]),
      loansIssued: _firstAvailableMoney(position, const ['amountDisbursed']),
      repaymentsCollected: _firstAvailableMoney(position, const [
        'amountCollected',
      ]),
      processingFees: _firstAvailableMoney(position, const ['processingFees']),
      expectedHandover: _firstAvailableMoney(position, const [
        'expectedReturn',
      ]),
      expensesTotal: _firstAvailableMoney(position, const ['expensesTotal']),
    );
  }

  Map<String, dynamic>? _rawPositionFor(String officerId) {
    for (final position in _agentReturns) {
      if (_string(position['agentId']) == officerId) {
        return position;
      }
    }

    return null;
  }

  Map<String, dynamic> _agentForPosition(AgentFloatPosition position) {
    final raw = _rawPositionFor(position.id);

    return {
      'id': position.id,
      'name': position.name,
      'phone': position.phone ?? _string(raw?['agentPhone']),
      'roleName': position.roleName ?? 'Field Officer',
      'photoUrl': position.photoUrl ?? _string(raw?['agentPhotoUrl']),
      'publicId': position.publicId ?? _string(raw?['agentPublicId']),
    };
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

      final nextData = Map<String, dynamic>.from(data);
      final operation = nextData['operation'];

      final returnedPositions = operation is Map<String, dynamic>
          ? operation['agentReturns']
          : null;

      if (operation is Map<String, dynamic> &&
          (returnedPositions is! List || returnedPositions.isEmpty) &&
          _agentReturns.isNotEmpty) {
        nextData['operation'] = {...operation, 'agentReturns': _agentReturns};
      }

      final reconciliation =
          nextData['reconciliation'] as Map<String, dynamic>?;

      final savedNotes = _string(reconciliation?['notes']) ?? '';

      setState(() {
        _data = nextData;
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

  void _close() {
    if (!mounted) {
      return;
    }

    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
      return;
    }

    unawaited(Navigator.of(context, rootNavigator: true).maybePop());
  }

  Future<void> _openOfficerPosition(AgentFloatPosition position) async {
    final rawPosition = _rawPositionFor(position.id);

    if (rawPosition == null) {
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AgentPositionDetailScreen(
          session: widget.session,
          branchId: widget.branchId,
          date: widget.date,
          operation: _operation,
          agent: _agentForPosition(position),
          position: rawPosition,
          dayOpen: _canBalanceFieldOfficers,
        ),
      ),
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

      _close();
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
          onPressed: _close,
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
                    salaries: _salaries,
                    loansIssued: _loansIssued,
                    shortageRecoveries: _shortageRecoveries,
                    onUpdateCount: _updateCount,
                  ),

                  const SizedBox(height: 10),

                  _AgentReturnsCard(
                    officers: _activeOfficerPositions,
                    hasPending: _hasPendingAgentReturns,
                    onTap: (officer) {
                      unawaited(_openOfficerPosition(officer));
                    },
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
    required this.salaries,
    this.loansIssued = 0,
    this.shortageRecoveries = 0,
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
  final num salaries;
  final num loansIssued;
  final num shortageRecoveries;

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
                  label: 'Expected closing balance',
                  value: 'UGX ${formatMoney(expected)}',
                  color: forestEmerald,
                ),
              ),
              const _VerticalDivider(),
              Expanded(
                child: _SummaryMetric(
                  label: 'Counted closing balance',
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

          _MovementBlock(
            title: 'ADDITIONS',
            icon: Icons.arrow_upward_rounded,
            accent: forestEmerald,
            fill: const Color(0xFFEFF8F2),
            totalLabel: 'TOTAL',
            totalAmount:
                openingCash +
                capitalReceived +
                collections +
                processingFees +
                shortageRecoveries,
            children: [
              _CashRow(label: 'Opening Balance', value: openingCash),
              _CashRow(label: 'Capital received', value: capitalReceived),
              _CashRow(label: 'Cash in', value: collections, positive: true),
              _CashRow(
                label: 'Processing fees',
                value: processingFees,
                positive: true,
              ),
              _CashRow(
                label: 'Shortage cleared',
                value: shortageRecoveries,
                positive: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _MovementBlock(
            title: 'CASHOUTS',
            icon: Icons.arrow_downward_rounded,
            accent: const Color(0xFFC62828),
            fill: const Color(0xFFFFF0EC),
            totalLabel: 'TOTAL',
            totalAmount: expenses + salaries + loansIssued,
            children: [
              _CashRow(
                label: 'Total Expenses',
                value: expenses,
                negative: true,
              ),
              _CashRow(label: 'Salary', value: salaries, negative: true),
              _CashRow(
                label: 'Loans issued',
                value: loansIssued,
                negative: true,
              ),
            ],
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
                    'Count and confirm the physical closing balance',
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
  const _AgentReturnsCard({
    required this.officers,
    required this.hasPending,
    required this.onTap,
  });

  final List<AgentFloatPosition> officers;
  final bool hasPending;
  final ValueChanged<AgentFloatPosition> onTap;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.groups_2_outlined,
                size: 19,
                color: forestEmerald,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Field officers active today',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                'Today (${officers.length})',
                style: const TextStyle(
                  color: forestEmerald,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          if (officers.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Text(
                'No field officers were active for this day.',
                textAlign: TextAlign.center,
                style: TextStyle(color: slateText, fontSize: 10),
              ),
            )
          else
            Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(0, 10, 0, 9),
                  child: Row(
                    children: [
                      Expanded(flex: 28, child: _OfficerHeaderCell('Name')),
                      Expanded(
                        flex: 17,
                        child: _OfficerHeaderCell('Cash in', alignEnd: true),
                      ),
                      Expanded(
                        flex: 14,
                        child: _OfficerHeaderCell('Loans', alignEnd: true),
                      ),
                      Expanded(
                        flex: 20,
                        child: _OfficerHeaderCell(
                          'Processing\nfees',
                          alignEnd: true,
                        ),
                      ),
                      Expanded(
                        flex: 23,
                        child: _OfficerHeaderCell(
                          'Expected\nhandover',
                          alignEnd: true,
                        ),
                      ),
                      SizedBox(width: 14),
                    ],
                  ),
                ),
                const Divider(height: 1, color: line),
                ...List.generate(officers.length, (index) {
                  final officer = officers[index];

                  return Column(
                    children: [
                      _OfficerReturnRow(
                        officer: officer,
                        onTap: () {
                          onTap(officer);
                        },
                      ),
                      if (index != officers.length - 1)
                        const Divider(height: 1, color: line),
                    ],
                  );
                }),
              ],
            ),

          const SizedBox(height: 9),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: hasPending
                  ? const Color(0xFFFFF0EC)
                  : const Color(0xFFEFF8F2),
              border: Border.all(
                color: hasPending
                    ? const Color(0xFFF7CBC2)
                    : forestEmerald.withValues(alpha: 0.16),
              ),
              borderRadius: rembehBorderRadius(rembehRadiusSm),
            ),
            child: Row(
              children: [
                Icon(
                  hasPending
                      ? Icons.info_outline_rounded
                      : Icons.check_circle_outline_rounded,
                  color: hasPending ? const Color(0xFFC2412D) : forestEmerald,
                  size: 17,
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    hasPending
                        ? 'Select a field officer to balance them off before sending the report.'
                        : 'All active field officers are balanced for this day.',
                    style: TextStyle(
                      color: hasPending
                          ? const Color(0xFFC2412D)
                          : forestEmerald,
                      fontSize: 11,
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

class _OfficerReturnRow extends StatelessWidget {
  const _OfficerReturnRow({required this.officer, required this.onTap});

  final AgentFloatPosition officer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              Expanded(
                flex: 28,
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 17,
                      backgroundColor: forestEmerald.withValues(alpha: 0.08),
                      child: Text(
                        _initials(officer.name),
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
                        officer.displaySurname,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 17,
                child: _OfficerMoneyCell(officer.repaymentsCollected),
              ),
              Expanded(flex: 14, child: _OfficerMoneyCell(officer.loansIssued)),
              Expanded(
                flex: 20,
                child: _OfficerMoneyCell(officer.processingFees),
              ),
              Expanded(
                flex: 23,
                child: _OfficerMoneyCell(officer.expectedHandover, green: true),
              ),
              const SizedBox(width: 2),
              const Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: slateText,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfficerHeaderCell extends StatelessWidget {
  const _OfficerHeaderCell(this.label, {this.alignEnd = false});

  final String label;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: alignEnd ? 8 : 0, right: alignEnd ? 0 : 6),
      child: Text(
        label,
        textAlign: alignEnd ? TextAlign.end : TextAlign.start,
        maxLines: 2,
        softWrap: true,
        overflow: TextOverflow.visible,
        style: const TextStyle(
          color: midnightNavy,
          fontSize: 8,
          height: 1.2,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _OfficerMoneyCell extends StatelessWidget {
  const _OfficerMoneyCell(this.amount, {this.green = false});

  final num amount;
  final bool green;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: Align(
        alignment: Alignment.centerRight,
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            formatMoney(amount),
            textAlign: TextAlign.end,
            maxLines: 1,
            style: TextStyle(
              color: green ? forestEmerald : midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
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
              'notes': 'Variance between expected and counted closing balance',
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
                          _varianceNotes(row),
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

class _MovementBlock extends StatelessWidget {
  const _MovementBlock({
    required this.title,
    required this.icon,
    required this.accent,
    required this.fill,
    required this.totalLabel,
    required this.totalAmount,
    required this.children,
  });

  final String title;
  final IconData icon;
  final Color accent;
  final Color fill;
  final String totalLabel;
  final num totalAmount;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: accent.withValues(alpha: 0.16)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
            child: Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, size: 13, color: accent),
                ),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
            child: Column(children: children),
          ),
          Container(
            width: double.infinity,
            color: fill,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    totalLabel,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  'UGX ${formatMoney(totalAmount)}',
                  style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
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

class _CashRow extends StatelessWidget {
  const _CashRow({
    required this.label,
    required this.value,
    this.positive = false,
    this.negative = false,
  });

  final String label;
  final num value;
  final bool positive;
  final bool negative;

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
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(value)}',
            style: TextStyle(
              color: valueColor,
              fontSize: 12,
              fontWeight: FontWeight.w700,
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

num _firstAvailableMoney(Map<String, dynamic>? values, List<String> keys) {
  if (values == null) {
    return 0;
  }

  for (final key in keys) {
    final value = _nullableNum(values[key]);

    if (value != null) {
      return value;
    }
  }

  return 0;
}

String? _string(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return null;
}

String _varianceNotes(Map<String, dynamic> row) {
  final clearedBy = _string(row['clearedByName']);
  if (clearedBy != null) {
    return 'Shortage cleared by $clearedBy';
  }
  return _string(row['notes']) ??
      'Variance between expected and counted closing balance';
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
