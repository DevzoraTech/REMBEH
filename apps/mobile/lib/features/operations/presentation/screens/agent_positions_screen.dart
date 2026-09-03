// ignore_for_file: unused_element, unused_element_parameter

import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import '../../domain/models/agent_float_position.dart';
import '../../domain/utils/operation_formatters.dart';

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

  num get _totalRepayments {
    return _agentReturns.fold<num>(
      0,
      (total, row) => total + _num(row['amountCollected']),
    );
  }

  num get _totalProcessingFees {
    return _agentReturns.fold<num>(
      0,
      (total, row) => total + _num(row['processingFees']),
    );
  }

  num get _totalExpectedHandover {
    return _agentReturns.fold<num>(
      0,
      (total, row) => total + _num(row['expectedReturn']),
    );
  }

  List<AgentFloatPosition> get _activeOfficerPositions {
    final agentsById = <String, Map<String, dynamic>>{
      for (final agent in _agents)
        if ((_string(agent['id']) ?? '').isNotEmpty)
          _string(agent['id'])!: agent,
    };

    return _agentReturns
        .map((position) {
          final id = _string(position['agentId']) ?? '';
          final agent = agentsById[id];

          return AgentFloatPosition(
            id: id,
            name:
                _string(position['agentName']) ??
                _string(agent?['name']) ??
                'Field Officer',
            phone: _string(position['agentPhone']) ?? _string(agent?['phone']),
            roleName:
                _string(position['agentRoleName']) ??
                _string(agent?['roleName']),
            photoUrl:
                _string(position['agentPhotoUrl']) ??
                _string(agent?['photoUrl']),
            publicId:
                _string(position['agentPublicId']) ??
                _string(agent?['publicId']),
            remainingFloat: _num(position['unusedFloat']),
            floatAllocated: _num(position['amountGiven']),
            loansIssued: _num(position['amountDisbursed']),
            repaymentsCollected: _num(position['amountCollected']),
            processingFees: _num(position['processingFees']),
            expectedHandover: _num(position['expectedReturn']),
            expensesTotal: _num(position['expensesTotal']),
          );
        })
        .where((position) => position.id.isNotEmpty && position.isActiveToday)
        .toList(growable: false);
  }

  List<AgentFloatPosition> get _visibleOfficerPositions {
    final query = _query.trim().toLowerCase();
    final positions = _activeOfficerPositions;

    if (query.isEmpty) {
      return positions;
    }

    return positions
        .where((position) {
          final name = position.name.toLowerCase();
          final publicId = (position.publicId ?? '').toLowerCase();
          final phone = (position.phone ?? '').toLowerCase();

          return name.contains(query) ||
              publicId.contains(query) ||
              phone.contains(query);
        })
        .toList(growable: false);
  }

  Map<String, dynamic>? _positionFor(String agentId) {
    for (final row in _agentReturns) {
      if (_string(row['agentId']) == agentId) {
        return row;
      }
    }

    return null;
  }

  Map<String, dynamic> _agentForPosition(AgentFloatPosition position) {
    for (final agent in _agents) {
      if (_string(agent['id']) == position.id) {
        return agent;
      }
    }

    return {
      'id': position.id,
      'name': position.name,
      'phone': position.phone,
      'roleName': position.roleName ?? 'Field Officer',
      'photoUrl': position.photoUrl,
      'publicId': position.publicId,
    };
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
      final operation = await _api.getBranchOperation(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
      );

      final nextOperation = Map<String, dynamic>.from(operation);

      final returnedPositions = nextOperation['agentReturns'];

      if ((returnedPositions is! List || returnedPositions.isEmpty) &&
          _agentReturns.isNotEmpty) {
        nextOperation['agentReturns'] = _agentReturns;
      }

      var agents = _agents;

      try {
        agents = await _api.listBranchAgents(
          session: widget.session,
          date: widget.date,
        );
      } catch (_) {
        agents = _agents;
      }

      if (!mounted) return;

      setState(() {
        _operation = nextOperation;
        _agents = List<Map<String, dynamic>>.from(agents);
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
            'Float cannot be changed after staff balancing has been locked.';
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
            agentName: _string(agent['name']) ?? 'Staff member',
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
          operation: _operation,
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

  Future<void> _openOfficerPosition(AgentFloatPosition officer) async {
    final agent = _agentForPosition(officer);
    await _openAgent(agent);
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final visiblePositions = _visibleOfficerPositions;

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
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Field officers active today',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.calendar_today_outlined,
                  color: forestEmerald,
                  size: 12,
                ),
                const SizedBox(width: 5),
                Text(
                  operationDate(
                    DateTime.tryParse(widget.date) ?? DateTime.now(),
                  ),
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
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
              child: Text(
                'Today (${_activeOfficerPositions.length})',
                style: const TextStyle(
                  color: forestEmerald,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
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
            _ActiveOfficerTotalsCard(
              repayments: _totalRepayments,
              processingFees: _totalProcessingFees,
              expectedHandover: _totalExpectedHandover,
            ),

            const SizedBox(height: 14),

            _SearchField(
              controller: _searchController,
              onChanged: (value) {
                setState(() {
                  _query = value;
                });
              },
            ),

            const SizedBox(height: 12),

            if (_error != null) ...[
              _MessageCard(message: _error!, error: true),
              const SizedBox(height: 10),
            ],

            if (_notice != null) ...[
              _MessageCard(message: _notice!),
              const SizedBox(height: 10),
            ],

            const _BalanceGuidanceCard(),

            const SizedBox(height: 13),

            if (visiblePositions.isEmpty && _loading)
              const Padding(
                padding: EdgeInsets.only(top: 18),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if (visiblePositions.isEmpty)
              const _EmptyAgents()
            else
              _ActiveOfficerTable(
                officers: visiblePositions,
                onTap: (officer) {
                  unawaited(_openOfficerPosition(officer));
                },
              ),

            if (_loading && visiblePositions.isNotEmpty)
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
    required this.operation,
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
  final Map<String, dynamic>? operation;

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

  _OfficerActivityFilter _activityFilter = _OfficerActivityFilter.all;

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

  num get _expensesTotal => _num(_position?['expensesTotal']);

  num get _expected => _num(_position?['expectedReturn']);

  num? get _returned => _nullableNum(_position?['amountReturned']);

  num? get _variance => _nullableNum(_position?['variance']);

  String get _agentName => _string(widget.agent['name']) ?? 'Field Officer';

  bool get _agentIsManager {
    final role = (_string(widget.agent['roleName']) ?? '').toLowerCase();
    return role.contains('manager');
  }

  bool get _agentUsesBranchCashDirectly {
    final role = (_string(widget.agent['roleName']) ?? '').toLowerCase();
    return role.contains('manager') || role.contains('cashier');
  }

  String get _staffLabel {
    final role = (_string(widget.agent['roleName']) ?? '').toLowerCase();
    if (role.contains('manager')) return 'Manager';
    if (role.contains('cashier')) return 'Cashier';
    return 'Field Officer';
  }

  String? get _agentPublicId =>
      _string(_position?['agentPublicId']) ?? _string(widget.agent['publicId']);

  List<_OfficerActivityEntry> get _activityEntries {
    final entries = <_OfficerActivityEntry>[];
    final operation = widget.operation;

    if (operation == null) {
      return entries;
    }

    for (final row in _listPayload(operation['repayments'])) {
      if (!_rowMatchesOfficer(row, nameKeys: const ['recordedByName'])) {
        continue;
      }

      final occurredAt = _dateFromFields(row, const [
        'paidAt',
        'recordedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OfficerActivityEntry(
          type: _OfficerActivityFilter.repayments,
          label: 'Repayment collected',
          client:
              _string(row['borrowerName']) ??
              _string(row['clientName']) ??
              'Borrower',
          amount: _num(row['amount']),
          occurredAt: occurredAt,
        ),
      );
    }

    for (final row in _listPayload(operation['loansIssued'])) {
      if (!_rowMatchesOfficer(row, nameKeys: const ['officerName'])) {
        continue;
      }

      final occurredAt = _dateFromFields(row, const [
        'issuedAt',
        'disbursedAt',
        'submittedAt',
        'createdAt',
      ]);

      if (occurredAt == null) {
        continue;
      }

      entries.add(
        _OfficerActivityEntry(
          type: _OfficerActivityFilter.loans,
          label: 'Loan issued',
          client:
              _string(row['borrowerName']) ??
              _string(row['clientName']) ??
              'Borrower',
          amount: -_num(row['principalAmount']),
          occurredAt: occurredAt,
        ),
      );
    }

    entries.sort((a, b) => b.occurredAt.compareTo(a.occurredAt));

    if (_activityFilter == _OfficerActivityFilter.all) {
      return entries;
    }

    return entries
        .where((entry) => entry.type == _activityFilter)
        .toList(growable: false);
  }

  bool _rowMatchesOfficer(
    Map<String, dynamic> row, {
    required List<String> nameKeys,
  }) {
    final publicId = _agentPublicId;

    if (publicId != null &&
        (_string(row['recordedByPublicId']) == publicId ||
            _string(row['officerPublicId']) == publicId)) {
      return true;
    }

    final normalizedAgent = _normalizeName(_agentName);

    for (final key in nameKeys) {
      final rowName = _string(row[key]);

      if (rowName != null && _normalizeName(rowName) == normalizedAgent) {
        return true;
      }
    }

    return false;
  }

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
        return _RecordHandoverSheet(
          expected: _expected,
          staffLabel: _staffLabel,
        );
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
            agentName: _agentName,
            staffLabel: _staffLabel,
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
            agentName: _agentName,
            staffLabel: _staffLabel,
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
            '${_staffLabel.toLowerCase()} handed over excess cash of UGX ${formatMoney(result.variance)}.',
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
    final canAllocate =
        widget.dayOpen &&
        !_agentUsesBranchCashDirectly &&
        (widget.onAddFloat != null || widget.onAllocateFloat != null);
    final canBalance = widget.position != null && widget.dayOpen && !_balanced;

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
        title: const SizedBox.shrink(),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: Center(
              child: Row(
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    color: midnightNavy,
                    size: 16,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    operationDate(
                      DateTime.tryParse(widget.date) ?? DateTime.now(),
                    ),
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 2, 16, 30),
        children: [
          if (_error != null) ...[
            _MessageCard(message: _error!, error: true),
            const SizedBox(height: 10),
          ],

          _OfficerDetailHeader(agent: widget.agent, balanced: _balanced),

          const SizedBox(height: 10),

          if (widget.position == null)
            _NoFloatCard(
              dayOpen: widget.dayOpen,
              onAllocate: widget.onAllocateFloat,
            )
          else ...[
            _OfficerExpectedHandoverCard(
              amount: _expected,
              floatAllocated: _amountGiven,
              repaymentsCollected: _collections,
              processingFees: _processingFees,
              loansIssued: _amountDisbursed,
              expensesTotal: _expensesTotal,
              expectedHandover: _expected,
              returned: _returned,
              variance: _variance,
            ),

            const SizedBox(height: 10),

            _OfficerDetailActions(
              canAllocate: canAllocate,
              canBalance: canBalance,
              saving: _saving,
              balanceLabel: _agentIsManager
                  ? 'Balance Manager'
                  : _staffLabel == 'Cashier'
                  ? 'Balance Cashier'
                  : 'Balance off officer',
              onAllocate: canAllocate
                  ? () async {
                      final action =
                          widget.onAddFloat ?? widget.onAllocateFloat;
                      await action!();

                      if (context.mounted) {
                        Navigator.of(context).pop(true);
                      }
                    }
                  : null,
              onBalance: _balanceAgent,
            ),

            const SizedBox(height: 16),

            _OfficerActivitySection(
              selected: _activityFilter,
              entries: _activityEntries,
              onChanged: (filter) {
                setState(() {
                  _activityFilter = filter;
                });
              },
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

class _ActiveOfficerTotalsCard extends StatelessWidget {
  const _ActiveOfficerTotalsCard({
    required this.repayments,
    required this.processingFees,
    required this.expectedHandover,
  });

  final num repayments;
  final num processingFees;
  final num expectedHandover;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ActiveTotalMetric(
              icon: Icons.south_rounded,
              label: 'Total repayments',
              value: repayments,
            ),
          ),
          const _VerticalDivider(),
          Expanded(
            child: _ActiveTotalMetric(
              icon: Icons.percent_rounded,
              label: 'Total processing fees',
              value: processingFees,
            ),
          ),
          const _VerticalDivider(),
          Expanded(
            child: _ActiveTotalMetric(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Total expected handover',
              value: expectedHandover,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActiveTotalMetric extends StatelessWidget {
  const _ActiveTotalMetric({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final num value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: Color(0xFFE8F4EA),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: forestEmerald, size: 21),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: slateText,
            fontSize: 9,
            height: 1.2,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'UGX ${formatMoney(value)}',
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: forestEmerald,
            fontSize: 12,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _VerticalDivider extends StatelessWidget {
  const _VerticalDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 88,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: line,
    );
  }
}

class _BalanceGuidanceCard extends StatelessWidget {
  const _BalanceGuidanceCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0EC),
        border: Border.all(color: const Color(0xFFF7CBC2)),
        borderRadius: rembehBorderRadius(rembehRadiusSm),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline_rounded, color: Color(0xFFC2412D), size: 17),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'Select a field officer to balance them off.',
              style: TextStyle(
                color: Color(0xFFC2412D),
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActiveOfficerTable extends StatelessWidget {
  const _ActiveOfficerTable({required this.officers, required this.onTap});

  final List<AgentFloatPosition> officers;
  final ValueChanged<AgentFloatPosition> onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(0, 10, 0, 9),
          child: Row(
            children: [
              Expanded(flex: 34, child: _ActiveHeaderCell('Name')),
              Expanded(
                flex: 17,
                child: _ActiveHeaderCell('Cash in', alignEnd: true),
              ),
              Expanded(
                flex: 17,
                child: _ActiveHeaderCell('Loans', alignEnd: true),
              ),
              Expanded(
                flex: 20,
                child: _ActiveHeaderCell('Processing fees', alignEnd: true),
              ),
              Expanded(
                flex: 22,
                child: _ActiveHeaderCell('Expected handover', alignEnd: true),
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
              _ActiveOfficerRow(
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
    );
  }
}

class _ActiveOfficerRow extends StatelessWidget {
  const _ActiveOfficerRow({required this.officer, required this.onTap});

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
                flex: 34,
                child: Row(
                  children: [
                    _Avatar(
                      name: officer.name,
                      photoUrl: officer.photoUrl,
                      size: 38,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            fieldOfficerSurname(officer.name),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            officer.staffLabel,
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
                  ],
                ),
              ),
              Expanded(
                flex: 17,
                child: _ActiveMoneyCell(officer.repaymentsCollected),
              ),
              Expanded(flex: 17, child: _ActiveMoneyCell(officer.loansIssued)),
              Expanded(
                flex: 20,
                child: _ActiveMoneyCell(officer.processingFees),
              ),
              Expanded(
                flex: 22,
                child: _ActiveMoneyCell(officer.expectedHandover, green: true),
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

class _ActiveHeaderCell extends StatelessWidget {
  const _ActiveHeaderCell(this.label, {this.alignEnd = false});

  final String label;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      textAlign: alignEnd ? TextAlign.end : TextAlign.start,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: midnightNavy,
        fontSize: 7.4,
        height: 1.15,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _ActiveMoneyCell extends StatelessWidget {
  const _ActiveMoneyCell(this.amount, {this.green = false});

  final num amount;
  final bool green;

  @override
  Widget build(BuildContext context) {
    return Align(
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
    );
  }
}

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

class _OfficerDetailHeader extends StatelessWidget {
  const _OfficerDetailHeader({required this.agent, required this.balanced});

  final Map<String, dynamic> agent;
  final bool balanced;

  @override
  Widget build(BuildContext context) {
    final name = _string(agent['name']) ?? 'Field Officer';
    final phone = _string(agent['phone']);

    return Row(
      children: [
        _Avatar(name: name, photoUrl: _string(agent['photoUrl']), size: 54),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Text(
                    'Field Officer',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    '•',
                    style: TextStyle(
                      color: forestEmerald,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    balanced ? 'Balanced' : 'Active',
                    style: const TextStyle(
                      color: forestEmerald,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              if (phone != null) ...[
                const SizedBox(height: 3),
                Row(
                  children: [
                    const Icon(
                      Icons.phone_outlined,
                      color: slateText,
                      size: 12,
                    ),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        phone,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _OfficerExpectedHandoverCard extends StatelessWidget {
  const _OfficerExpectedHandoverCard({
    required this.amount,
    required this.floatAllocated,
    required this.repaymentsCollected,
    required this.processingFees,
    required this.loansIssued,
    required this.expensesTotal,
    required this.expectedHandover,
    required this.returned,
    required this.variance,
  });

  final num amount;
  final num floatAllocated;
  final num repaymentsCollected;
  final num processingFees;
  final num loansIssued;
  final num expensesTotal;
  final num expectedHandover;
  final num? returned;
  final num? variance;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 14, 13, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF7FBF7),
        border: Border.all(color: forestEmerald.withValues(alpha: 0.18)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Expected handover',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'UGX ${formatMoney(amount)}',
                      style: const TextStyle(
                        color: forestEmerald,
                        fontSize: 30,
                        height: 1.05,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Color(0xFFE8F4EA),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.payments_outlined,
                  color: forestEmerald,
                  size: 28,
                ),
              ),
            ],
          ),
          const SizedBox(height: 13),
          const Divider(height: 1, color: line),
          const SizedBox(height: 7),
          _OfficerCashLine(label: 'Float allocated', value: floatAllocated),
          _OfficerCashLine(
            label: 'Cash in',
            value: repaymentsCollected,
            signed: true,
          ),
          _OfficerCashLine(
            label: 'Processing fees collected',
            value: processingFees,
            signed: true,
          ),
          _OfficerCashLine(
            label: 'Field expenses',
            value: -expensesTotal,
            signed: true,
          ),
          _OfficerCashLine(
            label: 'Loans issued',
            value: -loansIssued,
            signed: true,
          ),
          const Divider(height: 17, color: line),
          _OfficerCashLine(
            label: 'Expected handover',
            value: expectedHandover,
            strong: true,
          ),
          if (returned != null) ...[
            const SizedBox(height: 6),
            _OfficerCashLine(label: 'Actual handover', value: returned!),
            if (variance != null && variance != 0)
              _OfficerCashLine(
                label: variance! < 0 ? 'Shortage' : 'Excess',
                value: variance!,
                signed: true,
                danger: variance! < 0,
                strong: true,
              ),
          ],
        ],
      ),
    );
  }
}

class _OfficerCashLine extends StatelessWidget {
  const _OfficerCashLine({
    required this.label,
    required this.value,
    this.signed = false,
    this.strong = false,
    this.danger = false,
  });

  final String label;
  final num value;
  final bool signed;
  final bool strong;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final positive = value > 0;
    final negative = value < 0;
    final color = danger || negative
        ? const Color(0xFFB42318)
        : strong || (signed && positive)
        ? forestEmerald
        : midnightNavy;
    final prefix = !signed
        ? (negative ? '- ' : '')
        : negative
        ? '- '
        : positive
        ? '+ '
        : '';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: strong ? midnightNavy : slateText,
                fontSize: 11,
                fontWeight: strong ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
          ),
          Text(
            '${prefix}UGX ${formatMoney(value.abs())}',
            style: TextStyle(
              color: color,
              fontSize: strong ? 12 : 11,
              fontWeight: strong ? FontWeight.w900 : FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfficerDetailActions extends StatelessWidget {
  const _OfficerDetailActions({
    required this.canAllocate,
    required this.canBalance,
    required this.saving,
    required this.balanceLabel,
    required this.onBalance,
    this.onAllocate,
  });

  final bool canAllocate;
  final bool canBalance;
  final bool saving;
  final String balanceLabel;
  final Future<void> Function()? onAllocate;
  final VoidCallback onBalance;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: canAllocate && onAllocate != null
                ? () {
                    unawaited(onAllocate!());
                  }
                : null,
            icon: const Icon(Icons.outbox_outlined, size: 18),
            label: const Text('Allocate float'),
            style: OutlinedButton.styleFrom(
              foregroundColor: forestEmerald,
              side: const BorderSide(color: forestEmerald),
              minimumSize: const Size.fromHeight(48),
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.icon(
            onPressed: canBalance && !saving ? onBalance : null,
            icon: saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check_circle_outline, size: 18),
            label: Text(saving ? 'Saving...' : balanceLabel),
            style: FilledButton.styleFrom(
              backgroundColor: forestEmerald,
              minimumSize: const Size.fromHeight(48),
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _OfficerActivitySection extends StatelessWidget {
  const _OfficerActivitySection({
    required this.selected,
    required this.entries,
    required this.onChanged,
  });

  final _OfficerActivityFilter selected;
  final List<_OfficerActivityEntry> entries;
  final ValueChanged<_OfficerActivityFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Activity',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        _OfficerActivityTabs(selected: selected, onChanged: onChanged),
        const SizedBox(height: 9),
        if (entries.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: const Text(
              'No activity found for this selection.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: slateText,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
            ),
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(12, 11, 12, 8),
                  child: Row(
                    children: [
                      Expanded(flex: 30, child: _ActiveHeaderCell('Type')),
                      Expanded(flex: 27, child: _ActiveHeaderCell('Client')),
                      Expanded(
                        flex: 25,
                        child: _ActiveHeaderCell(
                          'Amount (UGX)',
                          alignEnd: true,
                        ),
                      ),
                      Expanded(
                        flex: 18,
                        child: _ActiveHeaderCell('Time', alignEnd: true),
                      ),
                      SizedBox(width: 16),
                    ],
                  ),
                ),
                const Divider(height: 1, color: line),
                ...List.generate(entries.length, (index) {
                  final entry = entries[index];

                  return Column(
                    children: [
                      _OfficerActivityRow(entry: entry),
                      if (index != entries.length - 1)
                        const Divider(height: 1, color: line),
                    ],
                  );
                }),
              ],
            ),
          ),
      ],
    );
  }
}

class _OfficerActivityTabs extends StatelessWidget {
  const _OfficerActivityTabs({required this.selected, required this.onChanged});

  final _OfficerActivityFilter selected;
  final ValueChanged<_OfficerActivityFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: _OfficerActivityFilter.values
            .map((filter) {
              final active = selected == filter;

              return Expanded(
                child: InkWell(
                  onTap: () {
                    onChanged(filter);
                  },
                  borderRadius: rembehBorderRadius(rembehRadiusSm),
                  child: Container(
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: active
                          ? forestEmerald.withValues(alpha: 0.10)
                          : null,
                      borderRadius: rembehBorderRadius(rembehRadiusSm),
                    ),
                    child: Text(
                      filter.label,
                      style: TextStyle(
                        color: active ? forestEmerald : slateText,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              );
            })
            .toList(growable: false),
      ),
    );
  }
}

class _OfficerActivityRow extends StatelessWidget {
  const _OfficerActivityRow({required this.entry});

  final _OfficerActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    final positive = entry.amount >= 0;
    final color = positive ? forestEmerald : const Color(0xFFB42318);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      child: Row(
        children: [
          Expanded(
            flex: 30,
            child: Row(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.10),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    positive ? Icons.south_rounded : Icons.north_east_rounded,
                    color: color,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    entry.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: color,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 27,
            child: Text(
              entry.client,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            flex: 25,
            child: Text(
              '${positive ? '+ ' : '- '}UGX ${formatMoney(entry.amount.abs())}',
              textAlign: TextAlign.end,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 9,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Expanded(
            flex: 18,
            child: Text(
              operationTime(entry.occurredAt),
              textAlign: TextAlign.end,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: slateText,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: slateText, size: 16),
        ],
      ),
    );
  }
}

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
            label: 'Cash in',
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
            label: 'Cash in ($repayments)',
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
  const _RecordHandoverSheet({
    required this.expected,
    required this.staffLabel,
  });

  final num expected;
  final String staffLabel;

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

    if (actual == null) {
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
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
              signed: true,
            ),
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
                  '${widget.staffLabel} handed over less than the expected amount.',
              color: const Color(0xFFB42318),
            ),
          ],

          if (excess) ...[
            const SizedBox(height: 12),

            _WarningBox(
              title: 'Excess detected',
              message:
                  '${widget.staffLabel} handed over more than the expected amount.',
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
    required this.staffLabel,
    required this.shortage,
  });

  final String agentName;
  final String staffLabel;
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
            child: Text('Record Shortage & Balance ${widget.staffLabel}'),
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
  const _ConfirmExcessSheet({
    required this.agentName,
    required this.staffLabel,
    required this.amount,
  });

  final String agentName;
  final String staffLabel;
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
            child: Text('Confirm Excess & Balance $staffLabel'),
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
                ? 'This staff member has not received float for this business day.'
                : 'This staff member did not receive float for this business day.',
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
          hintText: 'Search field officer by name...',
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

enum _OfficerActivityFilter {
  all('All'),
  repayments('Repayments'),
  loans('Loans');

  const _OfficerActivityFilter(this.label);

  final String label;
}

class _OfficerActivityEntry {
  const _OfficerActivityEntry({
    required this.type,
    required this.label,
    required this.client,
    required this.amount,
    required this.occurredAt,
  });

  final _OfficerActivityFilter type;
  final String label;
  final String client;
  final num amount;
  final DateTime occurredAt;
}

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

List<Map<String, dynamic>> _listPayload(Object? raw) {
  if (raw is! List) {
    return const [];
  }

  return raw.whereType<Map<String, dynamic>>().toList(growable: false);
}

DateTime? _dateFromFields(Map<String, dynamic> row, List<String> keys) {
  for (final key in keys) {
    final raw = _string(row[key]);

    if (raw == null) {
      continue;
    }

    final parsed = DateTime.tryParse(raw);

    if (parsed != null) {
      return parsed.toLocal();
    }
  }

  return null;
}

String _normalizeName(String value) {
  return value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
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
