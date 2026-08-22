import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import 'day_reconciliation_screen.dart';

class AgentPositionsScreen extends StatefulWidget {
  const AgentPositionsScreen({
    super.key,
    required this.session,
    required this.date,
    required this.agents,
    required this.operation,
    required this.dayOpen,
    this.branchId,
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  final List<Map<String, dynamic>> agents;
  final Map<String, dynamic>? operation;

  final bool dayOpen;

  @override
  State<AgentPositionsScreen> createState() => _AgentPositionsScreenState();
}

class _AgentPositionsScreenState extends State<AgentPositionsScreen> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  late List<Map<String, dynamic>> _agents;
  Map<String, dynamic>? _operation;

  final TextEditingController _searchController = TextEditingController();

  bool _loading = false;

  String _query = '';

  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();

    _agents = List<Map<String, dynamic>>.from(widget.agents);

    _operation = widget.operation;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  String get _operationStatus =>
      (_string(_operation?['status']) ?? '').toUpperCase();

  bool get _dayIsOpen => _operationStatus == 'OPEN';

  List<Map<String, dynamic>> get _agentReturns {
    final raw = _operation?['agentReturns'];

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().toList();
  }

  Map<String, dynamic>? _positionFor(String agentId) {
    for (final row in _agentReturns) {
      if (_string(row['agentId']) == agentId) {
        return row;
      }
    }

    return null;
  }

  bool _isBalanced(Map<String, dynamic>? position) {
    if (position == null) {
      return false;
    }

    return _nullableNum(position['amountReturned']) != null;
  }

  bool _isShortage(Map<String, dynamic>? position) {
    if (!_isBalanced(position)) {
      return false;
    }

    return _num(position?['variance']) < 0;
  }

  bool _isExcess(Map<String, dynamic>? position) {
    if (!_isBalanced(position)) {
      return false;
    }

    return _num(position?['variance']) > 0;
  }

  int get _agentsToBalance => _agentReturns.length;

  int get _balancedCount => _agentReturns.where(_isBalanced).length;

  int get _notBalancedCount =>
      _agentReturns.where((row) => !_isBalanced(row)).length;

  int get _shortageCount => _agentReturns.where(_isShortage).length;

  int get _excessCount => _agentReturns.where(_isExcess).length;

  bool get _allBalanced =>
      _agentsToBalance > 0 && _balancedCount == _agentsToBalance;

  double get _progress {
    if (_agentsToBalance == 0) {
      return 0;
    }

    return _balancedCount / _agentsToBalance;
  }

  List<Map<String, dynamic>> get _visibleAgents {
    final query = _query.trim().toLowerCase();

    if (query.isEmpty) {
      return _agents;
    }

    return _agents.where((agent) {
      final name = (_string(agent['name']) ?? '').toLowerCase();

      final publicId = (_string(agent['publicId']) ?? '').toLowerCase();

      final phone = (_string(agent['phone']) ?? '').toLowerCase();

      return name.contains(query) ||
          publicId.contains(query) ||
          phone.contains(query);
    }).toList();
  }

  // ===========================================================================
  // LOAD
  // ===========================================================================

  Future<void> _refresh() async {
    if (_loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<Object?>([
        _api.getBranchOperation(
          session: widget.session,
          branchId: widget.branchId,
          date: widget.date,
        ),
        _api.listBranchAgents(session: widget.session, date: widget.date),
      ]);

      if (!mounted) return;

      setState(() {
        _operation = results[0] as Map<String, dynamic>;

        _agents = List<Map<String, dynamic>>.from(
          results[1] as List<Map<String, dynamic>>,
        );

        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  // ===========================================================================
  // FLOAT
  // ===========================================================================

  Future<void> _allocateFloat(
    Map<String, dynamic> agent, {
    required bool addMore,
  }) async {
    if (!_dayIsOpen) {
      setState(() {
        _error =
            'Float cannot be changed after field officer balancing has been locked.';
      });

      return;
    }

    final agentId = _string(agent['id']);

    if (agentId == null) {
      return;
    }

    final amount = TextEditingController();

    final notes = TextEditingController();

    try {
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) {
          return _AllocateFloatSheet(
            agentName: _string(agent['name']) ?? 'Field Officer',
            addMore: addMore,
            amountController: amount,
            notesController: notes,
            onSubmit: () async {
              final value = _parseAmount(amount.text);

              if (value == null || value <= 0) {
                throw ApiException('Enter the float amount.');
              }

              await _api.recordAgentFloat(
                session: widget.session,
                agentId: agentId,
                date: widget.date,
                amount: value,
                notes: notes.text,
                addMore: addMore,
              );
            },
          );
        },
      );

      if (saved == true) {
        if (!mounted) return;

        setState(() {
          _notice = addMore ? 'Additional float recorded.' : 'Float allocated.';
        });

        await _refresh();
      }
    } finally {
      amount.dispose();
      notes.dispose();
    }
  }

  // ===========================================================================
  // AGENT
  // ===========================================================================

  Future<void> _openAgent(Map<String, dynamic> agent) async {
    final id = _string(agent['id']);

    if (id == null) {
      return;
    }

    final position = _positionFor(id);

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AgentPositionDetailScreen(
          session: widget.session,
          branchId: widget.branchId,
          date: widget.date,
          agent: agent,
          position: position,
          dayOpen: _dayIsOpen,
          onAllocateFloat: position == null && _dayIsOpen
              ? () => _allocateFloat(agent, addMore: false)
              : null,
          onAddFloat: position != null && !_isBalanced(position) && _dayIsOpen
              ? () => _allocateFloat(agent, addMore: true)
              : null,
        ),
      ),
    );

    if (changed == true) {
      await _refresh();
    }
  }

  Future<void> _proceedToReconciliation() async {
    if (!_allBalanced) {
      setState(() {
        _error =
            'Complete all field officer handovers before starting branch reconciliation.';
      });

      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DayReconciliationScreen(
          session: widget.session,
          branchId: widget.branchId,
          date: widget.date,
        ),
      ),
    );

    if (changed == true && mounted) {
      Navigator.of(context).pop(true);
    } else {
      await _refresh();
    }
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: softIvory,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () {
            Navigator.of(context).pop(true);
          },
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: midnightNavy,
            size: 19,
          ),
        ),
        titleSpacing: 2,
        title: const Text(
          'Field Officer Balancing',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Filter',
            onPressed: () {},
            icon: const Icon(Icons.filter_alt_outlined, color: midnightNavy),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 5, 16, 30),
          children: [
            _SearchField(
              controller: _searchController,
              onChanged: (value) {
                setState(() {
                  _query = value;
                });
              },
            ),

            const SizedBox(height: 10),

            if (_error != null) ...[
              _MessageCard(message: _error!, error: true),
              const SizedBox(height: 10),
            ],

            if (_notice != null) ...[
              _MessageCard(message: _notice!),
              const SizedBox(height: 10),
            ],

            if (_allBalanced)
              _AllBalancedCard(
                balanced: _balancedCount,
                total: _agentsToBalance,
                onProceed: () {
                  unawaited(_proceedToReconciliation());
                },
              )
            else
              _BalancingSummaryCard(
                balanced: _balancedCount,
                total: _agentsToBalance,
                progress: _progress,
                pending: _notBalancedCount,
                shortage: _shortageCount,
                excess: _excessCount,
              ),

            const SizedBox(height: 12),

            if (_visibleAgents.isEmpty)
              const _EmptyAgents()
            else
              ..._visibleAgents.map((agent) {
                final id = _string(agent['id']) ?? '';

                final position = _positionFor(id);

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AgentBalancingCard(
                    agent: agent,
                    position: position,
                    dayOpen: _dayIsOpen,
                    onTap: () {
                      unawaited(_openAgent(agent));
                    },
                    onAllocate: position == null && _dayIsOpen
                        ? () {
                            unawaited(_allocateFloat(agent, addMore: false));
                          }
                        : null,
                  ),
                );
              }),

            if (_loading)
              const Padding(
                padding: EdgeInsets.only(top: 18),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// AGENT DETAIL
// =============================================================================

class AgentPositionDetailScreen extends StatefulWidget {
  const AgentPositionDetailScreen({
    super.key,
    required this.session,
    required this.date,
    required this.agent,
    required this.position,
    required this.dayOpen,
    this.branchId,
    this.onAllocateFloat,
    this.onAddFloat,
  });

  final RembehSession session;

  final String date;
  final String? branchId;

  final Map<String, dynamic> agent;
  final Map<String, dynamic>? position;

  final bool dayOpen;

  final Future<void> Function()? onAllocateFloat;

  final Future<void> Function()? onAddFloat;

  @override
  State<AgentPositionDetailScreen> createState() =>
      _AgentPositionDetailScreenState();
}

class _AgentPositionDetailScreenState extends State<AgentPositionDetailScreen> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  bool _saving = false;

  String? _error;

  Map<String, dynamic>? get _position => widget.position;

  bool get _balanced => _nullableNum(_position?['amountReturned']) != null;

  num get _amountGiven => _num(_position?['amountGiven']);

  num get _amountDisbursed => _num(_position?['amountDisbursed']);

  num get _unusedFloat {
    final explicit = _nullableNum(_position?['unusedFloat']);

    if (explicit != null) {
      return explicit;
    }

    final calculated = _amountGiven - _amountDisbursed;

    return calculated < 0 ? 0 : calculated;
  }

  num get _collections => _num(_position?['amountCollected']);

  num get _processingFees => _num(_position?['processingFees']);

  num get _expected => _num(_position?['expectedReturn']);

  num? get _returned => _nullableNum(_position?['amountReturned']);

  num? get _variance => _nullableNum(_position?['variance']);

  Future<void> _balanceAgent() async {
    if (_position == null) {
      return;
    }

    if (_balanced) {
      return;
    }

    final result = await showModalBottomSheet<_HandoverResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return _RecordHandoverSheet(expected: _expected);
      },
    );

    if (result == null || !mounted) {
      return;
    }

    if (result.variance < 0) {
      final shortage = await showModalBottomSheet<_ShortageConfirmation>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) {
          return _ConfirmShortageSheet(
            agentName: _string(widget.agent['name']) ?? 'Field Officer',
            shortage: result.variance.abs(),
          );
        },
      );

      if (shortage == null || !mounted) {
        return;
      }

      await _recordReturn(
        amount: result.amount,
        shortageReason: shortage.reason,
        notes: shortage.notes,
      );

      return;
    }

    if (result.variance > 0) {
      final confirmed = await showModalBottomSheet<bool>(
        context: context,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) {
          return _ConfirmExcessSheet(
            agentName: _string(widget.agent['name']) ?? 'Field Officer',
            amount: result.variance,
          );
        },
      );

      if (confirmed != true || !mounted) {
        return;
      }

      await _recordReturn(
        amount: result.amount,
        notes:
            'Field officer handed over excess cash of UGX ${formatMoney(result.variance)}.',
      );

      return;
    }

    await _recordReturn(amount: result.amount);
  }

  Future<void> _recordReturn({
    required num amount,
    String? shortageReason,
    String? notes,
  }) async {
    final agentId = _string(widget.agent['id']);

    if (agentId == null) {
      return;
    }

    if (_saving) {
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api.recordAgentReturn(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
        agentId: agentId,
        amountReturned: amount,
        shortageReason: shortageReason,
        notes: notes,
      );

      if (!mounted) return;

      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) {
          return _BalancedSuccessDialog(
            agentName: _string(widget.agent['name']) ?? 'Field Officer',
          );
        },
      );

      if (!mounted) return;

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final returned = _returned;

    final variance = _variance ?? 0;

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: softIvory,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () {
            Navigator.of(context).pop(false);
          },
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: midnightNavy,
            size: 19,
          ),
        ),
        titleSpacing: 2,
        title: Text(
          _balanced ? 'Field Officer Details' : 'Field Officer Position',
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.more_vert_rounded, color: midnightNavy),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 5, 16, 30),
        children: [
          if (_error != null) ...[
            _MessageCard(message: _error!, error: true),
            const SizedBox(height: 10),
          ],

          _AgentIdentityHeader(agent: widget.agent, balanced: _balanced),

          const SizedBox(height: 10),

          if (widget.position == null)
            _NoFloatCard(
              dayOpen: widget.dayOpen,
              onAllocate: widget.onAllocateFloat,
            )
          else if (_balanced)
            _BalancedAgentCard(
              expected: _expected,
              actual: returned ?? 0,
              variance: variance,
              balancedBy:
                  _string(_position?['returnedByName']) ??
                  _string(_position?['balancedByName']) ??
                  widget.session.userName,
              balancedAt:
                  _string(_position?['returnedAt']) ??
                  _string(_position?['balancedAt']),
            )
          else ...[
            _ExpectedHandoverCard(amount: _expected),

            const SizedBox(height: 10),

            _PositionBreakdownCard(
              floatReceived: _amountGiven,
              loansIssued: _amountDisbursed,
              unusedFloat: _unusedFloat,
              repaymentsCollected: _collections,
              processingFees: _processingFees,
              expectedHandover: _expected,
            ),

            const SizedBox(height: 10),

            _ActivitySummaryCard(position: _position),

            if (widget.dayOpen && widget.onAddFloat != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  await widget.onAddFloat!();

                  if (context.mounted) {
                    Navigator.of(context).pop(true);
                  }
                },
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add float'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: forestEmerald,
                  side: const BorderSide(color: forestEmerald),
                  minimumSize: const Size.fromHeight(45),
                ),
              ),
            ],

            const SizedBox(height: 12),

            FilledButton(
              onPressed: _saving ? null : _balanceAgent,
              style: FilledButton.styleFrom(
                backgroundColor: forestEmerald,
                minimumSize: const Size.fromHeight(50),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Balance Field Officer',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ],
        ],
      ),
    );
  }
}

// =============================================================================
// LIST SUMMARY
// =============================================================================

class _BalancingSummaryCard extends StatelessWidget {
  const _BalancingSummaryCard({
    required this.balanced,
    required this.total,
    required this.progress,
    required this.pending,
    required this.shortage,
    required this.excess,
  });

  final int balanced;
  final int total;
  final double progress;

  final int pending;
  final int shortage;
  final int excess;

  @override
  Widget build(BuildContext context) {
    final percent = (progress * 100).round();

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Field officer reconciliation',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$balanced of $total balanced',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 42,
                height: 42,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircularProgressIndicator(
                      value: progress,
                      strokeWidth: 4,
                      backgroundColor: const Color(0xFFE5E9E6),
                      color: forestEmerald,
                    ),
                    Text(
                      '$percent%',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 8,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 7),

        Row(
          children: [
            Expanded(
              child: _StatusCounter(
                value: pending,
                label: 'Not balanced',
                background: const Color(0xFFF4F6FA),
                foreground: const Color(0xFF1D3557),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _StatusCounter(
                value: balanced,
                label: 'Balanced',
                background: const Color(0xFFEEF8F0),
                foreground: forestEmerald,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _StatusCounter(
                value: shortage,
                label: 'Shortage',
                background: const Color(0xFFFFF1F0),
                foreground: const Color(0xFFB42318),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _StatusCounter(
                value: excess,
                label: 'Excess',
                background: const Color(0xFFFFF7E8),
                foreground: const Color(0xFFA15C00),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _StatusCounter extends StatelessWidget {
  const _StatusCounter({
    required this.value,
    required this.label,
    required this.background,
    required this.foreground,
  });

  final int value;
  final String label;

  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: foreground.withValues(alpha: 0.12)),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$value',
            style: TextStyle(
              color: foreground,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: foreground,
              fontSize: 7.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _AllBalancedCard extends StatelessWidget {
  const _AllBalancedCard({
    required this.balanced,
    required this.total,
    required this.onProceed,
  });

  final int balanced;
  final int total;
  final VoidCallback onProceed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF2FAF3),
        border: Border.all(color: forestEmerald.withValues(alpha: 0.2)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 31,
                height: 31,
                decoration: const BoxDecoration(
                  color: forestEmerald,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'All field officers balanced',
                      style: TextStyle(
                        color: forestEmerald,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$balanced of $total field officers have been balanced successfully.',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 9,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(7),
            child: InkWell(
              onTap: onProceed,
              borderRadius: BorderRadius.circular(7),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: forestEmerald.withValues(alpha: 0.22),
                  ),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Proceed to Day Reconciliation',
                        style: TextStyle(
                          color: forestEmerald,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: forestEmerald,
                      size: 18,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// AGENT LIST CARD
// =============================================================================

class _AgentBalancingCard extends StatelessWidget {
  const _AgentBalancingCard({
    required this.agent,
    required this.position,
    required this.dayOpen,
    required this.onTap,
    this.onAllocate,
  });

  final Map<String, dynamic> agent;
  final Map<String, dynamic>? position;

  final bool dayOpen;

  final VoidCallback onTap;
  final VoidCallback? onAllocate;

  @override
  Widget build(BuildContext context) {
    final name = _string(agent['name']) ?? 'Field Officer';

    final float = _num(position?['amountGiven']);

    final collected = _num(position?['amountCollected']);

    final fees = _num(position?['processingFees']);

    final expected = _num(position?['expectedReturn']);

    final returned = _nullableNum(position?['amountReturned']);

    final variance = _nullableNum(position?['variance']);

    final status = _balanceStatus(position);

    return Material(
      color: Colors.white,
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  _Avatar(
                    name: name,
                    photoUrl: _string(agent['photoUrl']),
                    size: 34,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  _BalanceChip(status: status),
                ],
              ),

              const SizedBox(height: 9),

              if (position == null)
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'No float assigned',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (onAllocate != null)
                      TextButton(
                        onPressed: onAllocate,
                        child: const Text(
                          'Allocate',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: _MiniMetric(label: 'Float', value: float),
                    ),
                    Expanded(
                      child: _MiniMetric(label: 'Collected', value: collected),
                    ),
                    Expanded(
                      child: _MiniMetric(label: 'Fees', value: fees),
                    ),
                    Expanded(
                      child: _MiniMetric(
                        label: returned == null
                            ? 'Expected'
                            : variance != null && variance < 0
                            ? 'Shortage'
                            : variance != null && variance > 0
                            ? 'Excess'
                            : 'Actual',
                        value: returned == null
                            ? expected
                            : variance != null && variance != 0
                            ? variance.abs()
                            : returned,
                        danger: variance != null && variance < 0,
                        positive: returned == null || (variance ?? 0) >= 0,
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: slateText,
                      size: 18,
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

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({
    required this.label,
    required this.value,
    this.danger = false,
    this.positive = false,
  });

  final String label;
  final num value;

  final bool danger;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final color = danger
        ? const Color(0xFFB42318)
        : positive
        ? forestEmerald
        : midnightNavy;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 7,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatMoney(value),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 8,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// DETAIL COMPONENTS
// =============================================================================

class _AgentIdentityHeader extends StatelessWidget {
  const _AgentIdentityHeader({required this.agent, required this.balanced});

  final Map<String, dynamic> agent;

  final bool balanced;

  @override
  Widget build(BuildContext context) {
    final name = _string(agent['name']) ?? 'Field Officer';

    return Row(
      children: [
        _Avatar(name: name, photoUrl: _string(agent['photoUrl']), size: 42),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 1),
              const Text(
                'Field Officer',
                style: TextStyle(
                  color: slateText,
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (balanced)
          const _BalanceChip(status: _AgentBalanceStatus.balanced)
        else
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF2FAF3),
              border: Border.all(color: forestEmerald.withValues(alpha: 0.24)),
              borderRadius: BorderRadius.circular(99),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Today',
                  style: TextStyle(
                    color: forestEmerald,
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(width: 3),
                Icon(
                  Icons.calendar_today_outlined,
                  color: forestEmerald,
                  size: 10,
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ExpectedHandoverCard extends StatelessWidget {
  const _ExpectedHandoverCard({required this.amount});

  final num amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        children: [
          const Text(
            'Expected handover',
            style: TextStyle(
              color: slateText,
              fontSize: 8.5,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            'UGX ${formatMoney(amount)}',
            style: const TextStyle(
              color: forestEmerald,
              fontSize: 19,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionBreakdownCard extends StatelessWidget {
  const _PositionBreakdownCard({
    required this.floatReceived,
    required this.loansIssued,
    required this.unusedFloat,
    required this.repaymentsCollected,
    required this.processingFees,
    required this.expectedHandover,
  });

  final num floatReceived;
  final num loansIssued;
  final num unusedFloat;

  final num repaymentsCollected;
  final num processingFees;

  final num expectedHandover;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(12, 11, 12, 7),
            child: Text(
              'Position breakdown',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          _PositionLine(label: 'Float received', value: floatReceived),

          _PositionLine(label: 'Loans issued', value: -loansIssued),

          _PositionLine(label: 'Unused float', value: unusedFloat),

          const Divider(height: 15, color: line),

          _PositionLine(
            label: 'Repayments collected',
            value: repaymentsCollected,
          ),

          _PositionLine(label: 'Processing fees', value: processingFees),

          Container(
            margin: const EdgeInsets.only(top: 7),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(color: Color(0xFFF2FAF3)),
            child: _PositionLine(
              label: 'Expected handover',
              value: expectedHandover,
              strong: true,
              padding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionLine extends StatelessWidget {
  const _PositionLine({
    required this.label,
    required this.value,
    this.strong = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
  });

  final String label;
  final num value;

  final bool strong;

  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: strong ? forestEmerald : midnightNavy,
                fontSize: 9,
                fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
          Text(
            '${value < 0 ? '- ' : ''}UGX ${formatMoney(value.abs())}',
            style: TextStyle(
              color: strong ? forestEmerald : midnightNavy,
              fontSize: strong ? 10 : 9,
              fontWeight: strong ? FontWeight.w900 : FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActivitySummaryCard extends StatelessWidget {
  const _ActivitySummaryCard({required this.position});

  final Map<String, dynamic>? position;

  @override
  Widget build(BuildContext context) {
    final repayments = _num(position?['repaymentsCount']).round();

    final fees = _num(position?['processingFeesCount']).round();

    final loans = _num(position?['loansIssuedCount']).round();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Activity summary',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 7),
          _ActivityLine(
            icon: Icons.payments_outlined,
            label: 'Repayments collected ($repayments)',
          ),
          _ActivityLine(
            icon: Icons.receipt_long_outlined,
            label: 'Processing fees ($fees)',
          ),
          _ActivityLine(
            icon: Icons.link_outlined,
            label: 'Loans issued ($loans)',
          ),
        ],
      ),
    );
  }
}

class _ActivityLine extends StatelessWidget {
  const _ActivityLine({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 14, color: midnightNavy),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const Text(
            'View',
            style: TextStyle(
              color: forestEmerald,
              fontSize: 8.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// BALANCED DETAIL
// =============================================================================

class _BalancedAgentCard extends StatelessWidget {
  const _BalancedAgentCard({
    required this.expected,
    required this.actual,
    required this.variance,
    required this.balancedBy,
    required this.balancedAt,
  });

  final num expected;
  final num actual;
  final num variance;

  final String balancedBy;
  final String? balancedAt;

  @override
  Widget build(BuildContext context) {
    final shortage = variance < 0;

    final excess = variance > 0;

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Column(
            children: [
              _LockedRow(
                label: 'Expected handover',
                value: 'UGX ${formatMoney(expected)}',
              ),
              _LockedRow(
                label: 'Actual handover',
                value: 'UGX ${formatMoney(actual)}',
              ),
              if (variance != 0)
                _LockedRow(
                  label: shortage ? 'Shortage' : 'Excess',
                  value:
                      '${shortage ? '- ' : '+ '}UGX ${formatMoney(variance.abs())}',
                  danger: shortage,
                  positive: excess,
                ),
              const Divider(height: 17, color: line),
              _LockedRow(label: 'Balanced by', value: balancedBy),
              _LockedRow(
                label: 'Date & time',
                value: _friendlyDateTime(balancedAt),
              ),
            ],
          ),
        ),

        if (shortage) ...[
          const SizedBox(height: 8),
          _LockedAction(
            icon: Icons.lock_outline_rounded,
            label: 'View shortage',
            onTap: () {},
          ),
        ],

        const SizedBox(height: 8),

        _LockedAction(
          icon: Icons.history_rounded,
          label: 'View activity',
          onTap: () {},
        ),

        const SizedBox(height: 10),

        Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F6FB),
            border: Border.all(color: const Color(0xFFD6E3EF)),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline_rounded,
                color: Color(0xFF335D82),
                size: 16,
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'This record is locked. Contact an administrator to make corrections.',
                  style: TextStyle(
                    color: Color(0xFF335D82),
                    fontSize: 9,
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LockedRow extends StatelessWidget {
  const _LockedRow({
    required this.label,
    required this.value,
    this.danger = false,
    this.positive = false,
  });

  final String label;
  final String value;

  final bool danger;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final color = danger
        ? const Color(0xFFB42318)
        : positive
        ? forestEmerald
        : midnightNavy;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _LockedAction extends StatelessWidget {
  const _LockedAction({
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
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Row(
            children: [
              Icon(icon, size: 16, color: midnightNavy),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: slateText,
                size: 17,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// HANDOVER
// =============================================================================

class _HandoverResult {
  const _HandoverResult({required this.amount, required this.variance});

  final num amount;
  final num variance;
}

class _RecordHandoverSheet extends StatefulWidget {
  const _RecordHandoverSheet({required this.expected});

  final num expected;

  @override
  State<_RecordHandoverSheet> createState() => _RecordHandoverSheetState();
}

class _RecordHandoverSheetState extends State<_RecordHandoverSheet> {
  final TextEditingController _amount = TextEditingController();

  @override
  void initState() {
    super.initState();

    _amount.text = widget.expected.round().toString();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  num? get _actual => _parseAmount(_amount.text);

  num get _variance => (_actual ?? 0) - widget.expected;

  void _continue() {
    final actual = _actual;

    if (actual == null || actual < 0) {
      return;
    }

    Navigator.of(
      context,
    ).pop(_HandoverResult(amount: actual, variance: actual - widget.expected));
  }

  @override
  Widget build(BuildContext context) {
    final actual = _actual;

    final variance = actual == null ? 0 : _variance;

    final shortage = actual != null && variance < 0;

    final excess = actual != null && variance > 0;

    final varianceColor = shortage
        ? const Color(0xFFB42318)
        : excess
        ? const Color(0xFFA15C00)
        : forestEmerald;

    return _SheetShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SheetHeader(
            title: 'Record handover',
            onClose: () {
              Navigator.of(context).pop();
            },
          ),

          const SizedBox(height: 17),

          const Text(
            'Expected handover',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 2),

          Text(
            'UGX ${formatMoney(widget.expected)}',
            style: const TextStyle(
              color: forestEmerald,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 13),

          const Text(
            'Amount handed over (UGX)',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: 5),

          TextField(
            controller: _amount,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) {
              setState(() {});
            },
            decoration: InputDecoration(
              hintText: '0',
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(
                  color: shortage ? const Color(0xFFB42318) : line,
                ),
              ),
            ),
          ),

          const SizedBox(height: 13),

          const Text(
            'Variance',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 2),

          Text(
            '${variance < 0
                ? '- '
                : variance > 0
                ? '+ '
                : ''}UGX ${formatMoney(variance.abs())}',
            style: TextStyle(
              color: varianceColor,
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),

          if (shortage) ...[
            const SizedBox(height: 12),

            _WarningBox(
              title: 'Shortage detected',
              message:
                  'Field officer handed over less than the expected amount.',
              color: const Color(0xFFB42318),
            ),
          ],

          if (excess) ...[
            const SizedBox(height: 12),

            _WarningBox(
              title: 'Excess detected',
              message:
                  'Field officer handed over more than the expected amount.',
              color: const Color(0xFFA15C00),
            ),
          ],

          const SizedBox(height: 16),

          FilledButton(
            onPressed: actual == null ? null : _continue,
            style: FilledButton.styleFrom(
              backgroundColor: forestEmerald,
              minimumSize: const Size.fromHeight(46),
            ),
            child: Text(shortage || excess ? 'Continue' : 'Confirm Handover'),
          ),

          const SizedBox(height: 7),

          OutlinedButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
            ),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHORTAGE CONFIRMATION
// =============================================================================

class _ShortageConfirmation {
  const _ShortageConfirmation({required this.reason, required this.notes});

  final String reason;
  final String notes;
}

class _ConfirmShortageSheet extends StatefulWidget {
  const _ConfirmShortageSheet({
    required this.agentName,
    required this.shortage,
  });

  final String agentName;
  final num shortage;

  @override
  State<_ConfirmShortageSheet> createState() => _ConfirmShortageSheetState();
}

class _ConfirmShortageSheetState extends State<_ConfirmShortageSheet> {
  final TextEditingController _notes = TextEditingController();

  String _reason = 'CASH_NOT_RETURNED';

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SheetHeader(
            title: 'Shortage detected',
            onClose: () {
              Navigator.of(context).pop();
            },
          ),

          const SizedBox(height: 14),

          Center(
            child: Text(
              '- UGX ${formatMoney(widget.shortage)}',
              style: const TextStyle(
                color: Color(0xFFB42318),
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          const SizedBox(height: 4),

          Text(
            '${widget.agentName} handed over less than the expected amount.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: slateText,
              fontSize: 9.5,
              height: 1.4,
              fontWeight: FontWeight.w500,
            ),
          ),

          const SizedBox(height: 17),

          const Text(
            'Reason',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: 5),

          DropdownButtonFormField<String>(
            initialValue: _reason,
            items: const [
              DropdownMenuItem(
                value: 'CASH_NOT_RETURNED',
                child: Text('Cash not returned'),
              ),
              DropdownMenuItem(value: 'CASH_LOST', child: Text('Cash lost')),
              DropdownMenuItem(
                value: 'UNEXPLAINED_SHORTAGE',
                child: Text('Unexplained shortage'),
              ),
              DropdownMenuItem(value: 'OTHER', child: Text('Other')),
            ],
            onChanged: (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _reason = value;
              });
            },
          ),

          const SizedBox(height: 12),

          const Text(
            'Note (optional)',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: 5),

          TextField(
            controller: _notes,
            maxLines: 2,
            maxLength: 500,
            decoration: const InputDecoration(
              hintText: 'Add any relevant details...',
              counterText: '',
            ),
          ),

          const SizedBox(height: 16),

          FilledButton(
            onPressed: () {
              Navigator.of(context).pop(
                _ShortageConfirmation(
                  reason: _reason,
                  notes: _notes.text.trim(),
                ),
              );
            },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFD92D20),
              minimumSize: const Size.fromHeight(46),
            ),
            child: const Text('Record Shortage & Balance Field Officer'),
          ),

          const SizedBox(height: 7),

          OutlinedButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
            ),
            child: const Text('Go Back'),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// EXCESS
// =============================================================================

class _ConfirmExcessSheet extends StatelessWidget {
  const _ConfirmExcessSheet({required this.agentName, required this.amount});

  final String agentName;
  final num amount;

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SheetHeader(
            title: 'Excess detected',
            onClose: () {
              Navigator.of(context).pop(false);
            },
          ),

          const SizedBox(height: 15),

          Center(
            child: Text(
              '+ UGX ${formatMoney(amount)}',
              style: const TextStyle(
                color: Color(0xFFA15C00),
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          const SizedBox(height: 6),

          Text(
            '$agentName handed over more than the expected amount.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: slateText,
              fontSize: 9.5,
              height: 1.4,
            ),
          ),

          const SizedBox(height: 18),

          FilledButton(
            onPressed: () {
              Navigator.of(context).pop(true);
            },
            style: FilledButton.styleFrom(
              backgroundColor: forestEmerald,
              minimumSize: const Size.fromHeight(46),
            ),
            child: const Text('Confirm Excess & Balance Field Officer'),
          ),

          const SizedBox(height: 7),

          OutlinedButton(
            onPressed: () {
              Navigator.of(context).pop(false);
            },
            child: const Text('Go Back'),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SUCCESS
// =============================================================================

class _BalancedSuccessDialog extends StatelessWidget {
  const _BalancedSuccessDialog({required this.agentName});

  final String agentName;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 30),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(
                color: forestEmerald,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_rounded,
                color: Colors.white,
                size: 30,
              ),
            ),

            const SizedBox(height: 14),

            const Text(
              'Field officer balanced',
              style: TextStyle(
                color: forestEmerald,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 6),

            Text(
              '$agentName has been balanced successfully.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: slateText,
                fontSize: 10,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 18),

            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              style: FilledButton.styleFrom(
                backgroundColor: forestEmerald,
                minimumSize: const Size.fromHeight(45),
              ),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// FLOAT
// =============================================================================

class _NoFloatCard extends StatelessWidget {
  const _NoFloatCard({required this.dayOpen, this.onAllocate});

  final bool dayOpen;

  final Future<void> Function()? onAllocate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.account_balance_wallet_outlined,
            color: forestEmerald,
            size: 28,
          ),
          const SizedBox(height: 9),
          const Text(
            'No float assigned',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            dayOpen
                ? 'This field officer has not received float for this business day.'
                : 'This field officer did not receive float for this business day.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: slateText, fontSize: 10, height: 1.4),
          ),
          if (dayOpen && onAllocate != null) ...[
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () async {
                await onAllocate!();

                if (context.mounted) {
                  Navigator.of(context).pop(true);
                }
              },
              style: FilledButton.styleFrom(
                backgroundColor: forestEmerald,
                minimumSize: const Size.fromHeight(45),
              ),
              child: const Text('Allocate float'),
            ),
          ],
        ],
      ),
    );
  }
}

class _AllocateFloatSheet extends StatefulWidget {
  const _AllocateFloatSheet({
    required this.agentName,
    required this.addMore,
    required this.amountController,
    required this.notesController,
    required this.onSubmit,
  });

  final String agentName;

  final bool addMore;

  final TextEditingController amountController;

  final TextEditingController notesController;

  final Future<void> Function() onSubmit;

  @override
  State<_AllocateFloatSheet> createState() => _AllocateFloatSheetState();
}

class _AllocateFloatSheetState extends State<_AllocateFloatSheet> {
  bool _saving = false;

  String? _error;

  Future<void> _save() async {
    if (_saving) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.onSubmit();

      if (!mounted) return;

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SheetHeader(
            title: widget.addMore ? 'Add float' : 'Allocate float',
            onClose: () {
              Navigator.of(context).pop();
            },
          ),

          const SizedBox(height: 5),

          Text(
            widget.addMore
                ? 'Add more branch float to ${widget.agentName}.'
                : 'Assign today’s working float to ${widget.agentName}.',
            style: const TextStyle(color: slateText, fontSize: 10, height: 1.4),
          ),

          const SizedBox(height: 16),

          TextField(
            controller: widget.amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Amount (UGX)'),
          ),

          const SizedBox(height: 10),

          TextField(
            controller: widget.notesController,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notes (optional)'),
          ),

          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: const TextStyle(
                color: Color(0xFFB42318),
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],

          const SizedBox(height: 16),

          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: forestEmerald,
              minimumSize: const Size.fromHeight(46),
            ),
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(widget.addMore ? 'Add Float' : 'Allocate Float'),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHARED UI
// =============================================================================

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;

  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 42,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        decoration: const InputDecoration(
          hintText: 'Search field officers',
          prefixIcon: Icon(Icons.search_rounded, size: 19),
          contentPadding: EdgeInsets.symmetric(vertical: 0),
        ),
      ),
    );
  }
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        9,
        20,
        MediaQuery.of(context).viewInsets.bottom + 18,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFD8D8D8),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 15),
            child,
          ],
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.onClose});

  final String title;

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        IconButton(
          onPressed: onClose,
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.close_rounded, size: 20),
        ),
      ],
    );
  }
}

class _WarningBox extends StatelessWidget {
  const _WarningBox({
    required this.title,
    required this.message,
    required this.color,
  });

  final String title;
  final String message;

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        border: Border.all(color: color.withValues(alpha: 0.23)),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: const Icon(
              Icons.priority_high_rounded,
              color: Colors.white,
              size: 13,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  message,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 8.5,
                    height: 1.4,
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

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.photoUrl, this.size = 40});

  final String name;
  final String? photoUrl;

  final double size;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl;

    return ClipOval(
      child: Container(
        width: size,
        height: size,
        color: const Color(0xFFE8F4EA),
        child: url != null
            ? Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) =>
                    _Initials(name: name),
              )
            : _Initials(name: name),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();

    final initials = parts.isEmpty
        ? 'A'
        : parts.length == 1
        ? parts.first.substring(0, parts.first.length.clamp(1, 2)).toUpperCase()
        : '${parts.first[0]}${parts.last[0]}'.toUpperCase();

    return Center(
      child: Text(
        initials,
        style: const TextStyle(
          color: forestEmerald,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

enum _AgentBalanceStatus { noFloat, pending, balanced, shortage, excess }

_AgentBalanceStatus _balanceStatus(Map<String, dynamic>? position) {
  if (position == null) {
    return _AgentBalanceStatus.noFloat;
  }

  final returned = _nullableNum(position['amountReturned']);

  if (returned == null) {
    return _AgentBalanceStatus.pending;
  }

  final variance = _num(position['variance']);

  if (variance < 0) {
    return _AgentBalanceStatus.shortage;
  }

  if (variance > 0) {
    return _AgentBalanceStatus.excess;
  }

  return _AgentBalanceStatus.balanced;
}

class _BalanceChip extends StatelessWidget {
  const _BalanceChip({required this.status});

  final _AgentBalanceStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, color, background) = switch (status) {
      _AgentBalanceStatus.noFloat => (
        'No float',
        slateText,
        const Color(0xFFF4F5F4),
      ),
      _AgentBalanceStatus.pending => (
        'Not balanced',
        const Color(0xFFA15C00),
        const Color(0xFFFFF7E8),
      ),
      _AgentBalanceStatus.balanced => (
        'Balanced',
        forestEmerald,
        const Color(0xFFEEF8F0),
      ),
      _AgentBalanceStatus.shortage => (
        'Shortage',
        const Color(0xFFB42318),
        const Color(0xFFFFF1F0),
      ),
      _AgentBalanceStatus.excess => (
        'Excess',
        const Color(0xFFA15C00),
        const Color(0xFFFFF7E8),
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 7.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _EmptyAgents extends StatelessWidget {
  const _EmptyAgents();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: const Column(
        children: [
          Icon(Icons.people_outline_rounded, color: slateText),
          SizedBox(height: 7),
          Text(
            'No field officers found',
            style: TextStyle(color: midnightNavy, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, this.error = false});

  final String message;

  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? const Color(0xFFB42318) : forestEmerald;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

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

num? _parseAmount(String value) {
  final clean = value.replaceAll(',', '').trim();

  if (clean.isEmpty) {
    return null;
  }

  return num.tryParse(clean);
}

String? _string(Object? value) {
  if (value is! String) {
    return null;
  }

  final clean = value.trim();

  return clean.isEmpty ? null : clean;
}

String _friendlyDateTime(String? raw) {
  if (raw == null || raw.isEmpty) {
    return '-';
  }

  final date = DateTime.tryParse(raw)?.toLocal();

  if (date == null) {
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

  final hour = date.hour == 0
      ? 12
      : date.hour > 12
      ? date.hour - 12
      : date.hour;

  final minute = date.minute.toString().padLeft(2, '0');

  final period = date.hour >= 12 ? 'PM' : 'AM';

  return '${date.day} '
      '${months[date.month - 1]} '
      '${date.year}, '
      '$hour:$minute $period';
}
