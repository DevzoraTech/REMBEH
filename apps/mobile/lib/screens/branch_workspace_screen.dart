import 'dart:async';

import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/session_activity.dart';
import '../services/session_cleanup.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/account_access.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';
import 'account_locked_screen.dart';
import 'agent_shell.dart';
import 'login_screen.dart';

const _expenseCategories = [
  'TRANSPORT',
  'FUEL',
  'MEALS',
  'AIRTIME',
  'MOBILE_MONEY_CHARGES',
  'STATIONERY',
  'REPAIRS',
  'UTILITIES',
  'OTHER',
];

class BranchWorkspaceScreen extends StatefulWidget {
  const BranchWorkspaceScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<BranchWorkspaceScreen> createState() => _BranchWorkspaceScreenState();
}

class _BranchWorkspaceScreenState extends State<BranchWorkspaceScreen> {
  final _store = SessionStore();
  late final _api = ApiClient(_store);
  late final SessionActivityController _activity;

  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _agents = const [];
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _notice;
  int _index = 0;
  final String _date = _todayLabel();

  @override
  void initState() {
    super.initState();
    _activity = SessionActivityController(
      sessionStore: _store,
      onSessionCleared: _handleSessionCleared,
      onAccountBlocked: _handleAccountBlocked,
    );
    _activity.start();
    unawaited(_load());
  }

  @override
  void dispose() {
    _activity.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.getBranchOperation(
        session: widget.session,
        branchId: widget.session.branchId,
        date: _date,
      );
      var agents = <Map<String, dynamic>>[];
      if (widget.session.hasPermission('operation.float.manage') ||
          widget.session.hasPermission('operation.float.return') ||
          widget.session.hasPermission('operation.close')) {
        try {
          agents = await _api.listBranchAgents(
            session: widget.session,
            date: _date,
          );
        } catch (_) {
          agents = const [];
        }
      }
      if (!mounted) return;
      setState(() {
        _data = data;
        _agents = agents;
        _loading = false;
      });
    } catch (error) {
      final message = friendlyErrorMessage(error);
      if (isAccountAccessBlockedMessage(message)) {
        await _handleAccountBlocked(message);
        return;
      }
      if (!mounted) return;
      setState(() {
        _error = message;
        _loading = false;
      });
    }
  }

  Future<void> _handleSessionCleared() async {
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _handleAccountBlocked(String message) async {
    await clearTenantScopedClientState();
    await _store.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => AccountLockedScreen(message: message)),
      (_) => false,
    );
  }

  Future<void> _signOut() async {
    await clearTenantScopedClientState();
    await _store.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Map<String, dynamic>? get _operation =>
      _data?['operation'] as Map<String, dynamic>?;

  Map<String, dynamic>? get _branch =>
      _data?['branch'] as Map<String, dynamic>?;

  String get _branchName =>
      _string(_branch?['name']) ?? widget.session.branchName ?? 'Branch';

  bool get _dayOpen => _string(_operation?['status']) == 'OPEN';

  Future<void> _runSave(Future<void> Function() action) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
      await _load();
    } catch (error) {
      final message = friendlyErrorMessage(error);
      if (isAccountAccessBlockedMessage(message)) {
        await _handleAccountBlocked(message);
        return;
      }
      if (!mounted) return;
      setState(() => _error = message);
      throw ApiException(message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _setNotice(String message) {
    if (!mounted) return;
    setState(() => _notice = message);
  }

  void _openFieldTools() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AgentShell(session: widget.session)),
    );
  }

  Future<void> _showOpenDaySheet() async {
    final opening = TextEditingController(
      text: _moneyText(_num(_data?['openingBalance'])),
    );
    final cashAdded = TextEditingController();
    final notes = TextEditingController();
    await _showFormSheet(
      title: 'Open day',
      actionLabel: 'Open Day',
      builder: (setModalState) => [
        _AmountField(controller: opening, label: 'Opening cash'),
        const SizedBox(height: 10),
        _AmountField(controller: cashAdded, label: 'Cash added'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final openingAmount = _parseAmount(opening.text);
        final cashAddedAmount = _parseAmount(cashAdded.text) ?? 0;
        if (openingAmount == null || openingAmount < 0) {
          throw ApiException('Enter opening cash.');
        }
        await _api.openBranchOperation(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          openingBalance: openingAmount,
          cashAddedToday: cashAddedAmount,
          notes: notes.text,
        );
        _setNotice('Day opened.');
      },
    );
  }

  Future<void> _showTopUpSheet() async {
    final amount = TextEditingController();
    final description = TextEditingController();
    await _showFormSheet(
      title: 'Add cash',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: description, label: 'Reason', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);
        if (value == null || value <= 0) {
          throw ApiException('Enter the amount.');
        }
        await _api.recordBranchTopUp(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          amount: value,
          description: description.text,
        );
        _setNotice('Cash added.');
      },
    );
  }

  Future<void> _showExpenseSheet() async {
    final amount = TextEditingController();
    final description = TextEditingController();
    var category = 'TRANSPORT';
    await _showFormSheet(
      title: 'Expense',
      actionLabel: 'Save',
      builder: (setModalState) => [
        DropdownButtonFormField<String>(
          initialValue: category,
          items: _expenseCategories
              .map(
                (item) =>
                    DropdownMenuItem(value: item, child: Text(_label(item))),
              )
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setModalState(() => category = value);
          },
          decoration: const InputDecoration(labelText: 'Category'),
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: description, label: 'Details', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);
        if (value == null || value <= 0) {
          throw ApiException('Enter the amount.');
        }
        await _api.recordBranchExpense(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          category: category,
          amount: value,
          description: description.text,
        );
        _setNotice('Expense saved.');
      },
    );
  }

  Future<void> _showFloatSheet({required bool addMore}) async {
    if (_agents.isEmpty) {
      setState(() => _error = 'No field officers found.');
      return;
    }
    final amount = TextEditingController();
    final notes = TextEditingController();
    var agentId = _agents.first['id'] as String? ?? '';
    await _showFormSheet(
      title: addMore ? 'Add float' : 'Issue float',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _AgentPicker(
          agents: _agents,
          value: agentId,
          onChanged: (value) => setModalState(() => agentId = value),
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Amount'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);
        if (agentId.isEmpty) throw ApiException('Choose a field officer.');
        if (value == null || value <= 0) throw ApiException('Enter amount.');
        await _api.recordAgentFloat(
          session: widget.session,
          agentId: agentId,
          date: _date,
          amount: value,
          notes: notes.text,
          addMore: addMore,
        );
        _setNotice(addMore ? 'Float added.' : 'Float issued.');
      },
    );
  }

  Future<void> _showReturnSheet() async {
    if (_agents.isEmpty) {
      setState(() => _error = 'No field officers found.');
      return;
    }
    final amount = TextEditingController();
    final notes = TextEditingController();
    var agentId = _agents.first['id'] as String? ?? '';
    await _showFormSheet(
      title: 'Officer return',
      actionLabel: 'Save',
      builder: (setModalState) => [
        _AgentPicker(
          agents: _agents,
          value: agentId,
          onChanged: (value) => setModalState(() => agentId = value),
        ),
        const SizedBox(height: 10),
        _AmountField(controller: amount, label: 'Cash returned'),
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final value = _parseAmount(amount.text);
        if (agentId.isEmpty) throw ApiException('Choose a field officer.');
        if (value == null || value < 0) throw ApiException('Enter amount.');
        await _api.recordAgentReturn(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          agentId: agentId,
          amountReturned: value,
          notes: notes.text,
        );
        _setNotice('Return saved.');
      },
    );
  }

  Future<void> _showCloseDaySheet() async {
    final operation = _operation;
    if (operation == null) return;
    final expected = _num(operation['expectedClosingBalance']);
    final counted = TextEditingController(text: _moneyText(expected));
    final notes = TextEditingController();
    var responsibleId = _agents.isNotEmpty ? _agents.first['id'] as String : '';
    var variance = 0;

    void recompute(StateSetter setModalState) {
      final countedValue = _parseAmount(counted.text) ?? 0;
      setModalState(() => variance = (countedValue - expected).round());
    }

    await _showFormSheet(
      title: 'Close day',
      actionLabel: 'Close Day',
      builder: (setModalState) => [
        _MoneyPreview(label: 'Expected close', amount: expected),
        const SizedBox(height: 10),
        _AmountField(
          controller: counted,
          label: 'Counted cash',
          onChanged: (_) => recompute(setModalState),
        ),
        const SizedBox(height: 10),
        _VariancePreview(variance: variance),
        if (variance < 0) ...[
          const SizedBox(height: 10),
          _AgentPicker(
            agents: _agents,
            value: responsibleId,
            label: 'Responsible person',
            onChanged: (value) => setModalState(() => responsibleId = value),
          ),
        ],
        const SizedBox(height: 10),
        _TextField(controller: notes, label: 'Notes', maxLines: 3),
      ],
      onSubmit: () async {
        final countedValue = _parseAmount(counted.text);
        if (countedValue == null || countedValue < 0) {
          throw ApiException('Enter counted cash.');
        }
        final closeVariance = (countedValue - expected).round();
        if (closeVariance != 0 && notes.text.trim().isEmpty) {
          throw ApiException('Add a note for the difference.');
        }
        if (closeVariance < 0 && responsibleId.isEmpty) {
          throw ApiException('Choose who will account for the shortage.');
        }
        await _api.closeBranchOperation(
          session: widget.session,
          branchId: widget.session.branchId,
          date: _date,
          countedCash: countedValue,
          notes: notes.text,
          shortageResponsibleUserId: closeVariance < 0 ? responsibleId : null,
        );
        _setNotice('Day closed.');
      },
    );
  }

  Future<void> _showFormSheet({
    required String title,
    required String actionLabel,
    required List<Widget> Function(StateSetter setModalState) builder,
    required Future<void> Function() onSubmit,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) {
        var localError = '';
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _saving
                              ? null
                              : () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ...builder(setModalState),
                    if (localError.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _Banner(message: localError, tone: _BannerTone.error),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: _saving
                          ? null
                          : () async {
                              setModalState(() => localError = '');
                              try {
                                await _runSave(onSubmit);
                                if (context.mounted) {
                                  Navigator.of(context).pop();
                                }
                              } catch (error) {
                                setModalState(
                                  () =>
                                      localError = friendlyErrorMessage(error),
                                );
                              }
                            },
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(actionLabel),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return SessionActivityListener(
      controller: _activity,
      child: Scaffold(
        backgroundColor: softIvory,
        body: SafeArea(
          child: Column(
            children: [
              _BranchHeader(
                workspaceName: widget.session.workspaceName,
                branchName: _branchName,
                roleName: widget.session.roleName ?? 'Team',
                loading: _loading,
                onRefresh: _load,
                onSignOut: _signOut,
              ),
              if (_notice != null)
                _Banner(message: _notice!, tone: _BannerTone.success),
              if (_error != null)
                _Banner(message: _error!, tone: _BannerTone.error),
              Expanded(
                child: _loading && _data == null
                    ? const Center(
                        child: CircularProgressIndicator(color: forestEmerald),
                      )
                    : IndexedStack(
                        index: _index,
                        children: [
                          _OverviewTab(
                            session: widget.session,
                            operation: _operation,
                            branchName: _branchName,
                            agents: _agents,
                            dayOpen: _dayOpen,
                            onOpenDay: _showOpenDaySheet,
                            onTopUp: _showTopUpSheet,
                            onExpense: _showExpenseSheet,
                            onIssueFloat: () => _showFloatSheet(addMore: false),
                            onAddFloat: () => _showFloatSheet(addMore: true),
                            onReturn: _showReturnSheet,
                            onCloseDay: _showCloseDaySheet,
                            onRefresh: _load,
                            onOpenFieldTools:
                                widget.session.canUseFieldWorkspace
                                ? _openFieldTools
                                : null,
                          ),
                          _PeopleTab(agents: _agents),
                          _RecordsTab(operation: _operation),
                        ],
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: line)),
          ),
          child: SafeArea(
            top: false,
            child: NavigationBar(
              height: 64,
              selectedIndex: _index,
              onDestinationSelected: (index) {
                unawaited(_activity.touch());
                setState(() => _index = index);
              },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.dashboard_outlined),
                  selectedIcon: Icon(Icons.dashboard, color: forestEmerald),
                  label: 'Today',
                ),
                NavigationDestination(
                  icon: Icon(Icons.groups_outlined),
                  selectedIcon: Icon(Icons.groups, color: forestEmerald),
                  label: 'Team',
                ),
                NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined),
                  selectedIcon: Icon(Icons.receipt_long, color: forestEmerald),
                  label: 'Records',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.session,
    required this.operation,
    required this.branchName,
    required this.agents,
    required this.dayOpen,
    required this.onOpenDay,
    required this.onTopUp,
    required this.onExpense,
    required this.onIssueFloat,
    required this.onAddFloat,
    required this.onReturn,
    required this.onCloseDay,
    required this.onRefresh,
    this.onOpenFieldTools,
  });

  final RembehSession session;
  final Map<String, dynamic>? operation;
  final String branchName;
  final List<Map<String, dynamic>> agents;
  final bool dayOpen;
  final VoidCallback onOpenDay;
  final VoidCallback onTopUp;
  final VoidCallback onExpense;
  final VoidCallback onIssueFloat;
  final VoidCallback onAddFloat;
  final VoidCallback onReturn;
  final VoidCallback onCloseDay;
  final Future<void> Function() onRefresh;
  final VoidCallback? onOpenFieldTools;

  @override
  Widget build(BuildContext context) {
    final op = operation;
    final status = _string(op?['status']) ?? 'NOT_OPEN';
    final expected = _num(op?['expectedClosingBalance']);
    final counted = op?['closingBalance'] == null
        ? null
        : _num(op?['closingBalance']);
    final variance = counted == null ? null : (counted - expected).round();

    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _StatusPanel(
            branchName: branchName,
            status: _statusLabel(status),
            operationDate: _string(op?['operationDate']) ?? _todayLabel(),
          ),
          const SizedBox(height: 12),
          if (op == null)
            _EmptyDayCard(
              canOpen: session.hasPermission('operation.open'),
              onOpenDay: onOpenDay,
            )
          else ...[
            GridView.count(
              crossAxisCount: 2,
              childAspectRatio: 1.55,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              children: [
                _MetricCard(label: 'Expected close', amount: expected),
                _MetricCard(label: 'Counted cash', amount: counted ?? 0),
                _MetricCard(
                  label: 'Variance',
                  amount: variance == null ? 0 : variance.abs(),
                  tone: variance != null && variance < 0
                      ? _MetricTone.danger
                      : _MetricTone.good,
                ),
                _MetricCard(
                  label: 'Float left',
                  amount: _num(op['floatRemaining']),
                ),
                _MetricCard(
                  label: 'Collections',
                  amount: _num(op['collectionsReceived']),
                ),
                _MetricCard(
                  label: 'Expenses',
                  amount: _num(op['expensesTotal']),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _ActionGrid(
              actions: [
                if (dayOpen && session.hasPermission('operation.cash.topup'))
                  _BranchAction(
                    label: 'Add cash',
                    icon: Icons.add_card_outlined,
                    onTap: onTopUp,
                  ),
                if (dayOpen &&
                    session.hasPermission('operation.expense.create'))
                  _BranchAction(
                    label: 'Expense',
                    icon: Icons.payments_outlined,
                    onTap: onExpense,
                  ),
                if (dayOpen && session.hasPermission('operation.float.manage'))
                  _BranchAction(
                    label: 'Issue float',
                    icon: Icons.account_balance_wallet_outlined,
                    onTap: onIssueFloat,
                  ),
                if (dayOpen && session.hasPermission('operation.float.manage'))
                  _BranchAction(
                    label: 'Add float',
                    icon: Icons.wallet_outlined,
                    onTap: onAddFloat,
                  ),
                if (dayOpen && session.hasPermission('operation.float.return'))
                  _BranchAction(
                    label: 'Return',
                    icon: Icons.assignment_return_outlined,
                    onTap: onReturn,
                  ),
                if (dayOpen && session.hasPermission('operation.close'))
                  _BranchAction(
                    label: 'Close day',
                    icon: Icons.lock_outline,
                    onTap: onCloseDay,
                    strong: true,
                  ),
                if (onOpenFieldTools != null)
                  _BranchAction(
                    label: 'Field tools',
                    icon: Icons.phone_android_outlined,
                    onTap: onOpenFieldTools!,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PeopleTab extends StatelessWidget {
  const _PeopleTab({required this.agents});

  final List<Map<String, dynamic>> agents;

  @override
  Widget build(BuildContext context) {
    if (agents.isEmpty) {
      return const _EmptyState(
        icon: Icons.groups_outlined,
        title: 'No field officers',
        message: 'No field officers are available for this branch.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, index) {
        final agent = agents[index];
        return _SimpleTile(
          icon: Icons.person_outline,
          title: _string(agent['name']) ?? 'Field officer',
          subtitle: _string(agent['phone']) ?? _string(agent['email']) ?? '',
          trailing: _moneyOrDash(agent['floatToday']),
        );
      },
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemCount: agents.length,
    );
  }
}

class _RecordsTab extends StatelessWidget {
  const _RecordsTab({required this.operation});

  final Map<String, dynamic>? operation;

  @override
  Widget build(BuildContext context) {
    final op = operation;
    if (op == null) {
      return const _EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'No records yet',
        message: 'Open the day to start recording branch activity.',
      );
    }
    final topUps = _list(op['topUps']);
    final expenses = _list(op['expenses']);
    final returns = _list(op['agentReturns']);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _RecordSection(
          title: 'Cash added',
          rows: topUps
              .map(
                (row) => _SimpleTile(
                  icon: Icons.add_card_outlined,
                  title: _string(row['description']) ?? 'Cash added',
                  subtitle: _dateTime(row['addedAt']),
                  trailing: _moneyOrDash(row['amount']),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 14),
        _RecordSection(
          title: 'Expenses',
          rows: expenses
              .map(
                (row) => _SimpleTile(
                  icon: Icons.payments_outlined,
                  title: _label(_string(row['category']) ?? 'OTHER'),
                  subtitle:
                      _string(row['description']) ??
                      _dateTime(row['incurredAt']),
                  trailing: _moneyOrDash(row['amount']),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 14),
        _RecordSection(
          title: 'Returns',
          rows: returns
              .map(
                (row) => _SimpleTile(
                  icon: Icons.assignment_return_outlined,
                  title: _string(row['agentName']) ?? 'Field officer',
                  subtitle: _statusLabel(_string(row['status']) ?? ''),
                  trailing: row['amountReturned'] == null
                      ? 'Pending'
                      : _moneyOrDash(row['amountReturned']),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _BranchHeader extends StatelessWidget {
  const _BranchHeader({
    required this.workspaceName,
    required this.branchName,
    required this.roleName,
    required this.loading,
    required this.onRefresh,
    required this.onSignOut,
  });

  final String workspaceName;
  final String branchName;
  final String roleName;
  final bool loading;
  final VoidCallback onRefresh;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: sage,
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: const Icon(Icons.business_outlined, color: forestEmerald),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    workspaceName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    '$branchName - $roleName',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Refresh',
              onPressed: loading ? null : onRefresh,
              icon: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: forestEmerald,
                      ),
                    )
                  : const Icon(Icons.refresh, color: forestEmerald),
            ),
            IconButton(
              tooltip: 'Sign out',
              onPressed: onSignOut,
              icon: const Icon(Icons.logout, color: slateText),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({
    required this.branchName,
    required this.status,
    required this.operationDate,
  });

  final String branchName;
  final String status;
  final String operationDate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: midnightNavy,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Row(
        children: [
          const Icon(Icons.today_outlined, color: Colors.white, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  branchName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$operationDate - $status',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
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

class _EmptyDayCard extends StatelessWidget {
  const _EmptyDayCard({required this.canOpen, required this.onOpenDay});

  final bool canOpen;
  final VoidCallback onOpenDay;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.lock_open_outlined, color: forestEmerald, size: 36),
          const SizedBox(height: 10),
          const Text(
            'Day not open',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: midnightNavy,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: canOpen ? onOpenDay : null,
            child: const Text('Open Day'),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.amount,
    this.tone = _MetricTone.normal,
  });

  final String label;
  final num amount;
  final _MetricTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      _MetricTone.good => forestEmerald,
      _MetricTone.danger => const Color(0xFFB42318),
      _MetricTone.normal => midnightNavy,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: slateText,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              'UGX ${formatMoney(amount)}',
              style: TextStyle(
                color: color,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _MetricTone { normal, good, danger }

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({required this.actions});

  final List<_BranchAction> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    return GridView.count(
      crossAxisCount: 2,
      childAspectRatio: 2.25,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      children: actions,
    );
  }
}

class _BranchAction extends StatelessWidget {
  const _BranchAction({
    required this.label,
    required this.icon,
    required this.onTap,
    this.strong = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final bg = strong ? forestEmerald : Colors.white;
    final fg = strong ? Colors.white : midnightNavy;
    return Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        side: BorderSide(color: strong ? forestEmerald : line),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(icon, color: fg, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: fg,
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecordSection extends StatelessWidget {
  const _RecordSection({required this.title, required this.rows});

  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 14,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          const _SimpleTile(
            icon: Icons.info_outline,
            title: 'No records',
            subtitle: '',
            trailing: '',
          )
        else
          ...rows,
      ],
    );
  }
}

class _SimpleTile extends StatelessWidget {
  const _SimpleTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Icon(icon, color: forestEmerald, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (subtitle.isNotEmpty)
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            trailing,
            style: const TextStyle(
              color: forestEmerald,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: forestEmerald, size: 36),
            const SizedBox(height: 10),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: slateText, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _AmountField extends StatelessWidget {
  const _AmountField({
    required this.controller,
    required this.label,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: onChanged,
      decoration: InputDecoration(labelText: label, prefixText: 'UGX '),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String label;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      decoration: InputDecoration(labelText: label),
    );
  }
}

class _AgentPicker extends StatelessWidget {
  const _AgentPicker({
    required this.agents,
    required this.value,
    required this.onChanged,
    this.label = 'Field officer',
  });

  final List<Map<String, dynamic>> agents;
  final String value;
  final ValueChanged<String> onChanged;
  final String label;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value.isEmpty ? null : value,
      items: agents
          .map(
            (agent) => DropdownMenuItem(
              value: agent['id'] as String? ?? '',
              child: Text(_string(agent['name']) ?? 'Field officer'),
            ),
          )
          .toList(),
      onChanged: (value) {
        if (value == null) return;
        onChanged(value);
      },
      decoration: InputDecoration(labelText: label),
    );
  }
}

class _MoneyPreview extends StatelessWidget {
  const _MoneyPreview({required this.label, required this.amount});

  final String label;
  final num amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: sage,
        border: Border.all(color: forestEmerald.withValues(alpha: 0.22)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(amount)}',
            style: const TextStyle(
              color: forestEmerald,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _VariancePreview extends StatelessWidget {
  const _VariancePreview({required this.variance});

  final int variance;

  @override
  Widget build(BuildContext context) {
    final balanced = variance == 0;
    final short = variance < 0;
    final color = balanced || !short ? forestEmerald : const Color(0xFFB42318);
    final label = balanced
        ? 'Variance balanced'
        : short
        ? 'Shortage'
        : 'Excess';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(variance.abs())}',
            style: TextStyle(
              color: color,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

enum _BannerTone { success, error }

class _Banner extends StatelessWidget {
  const _Banner({required this.message, required this.tone});

  final String message;
  final _BannerTone tone;

  @override
  Widget build(BuildContext context) {
    final error = tone == _BannerTone.error;
    final color = error ? const Color(0xFFB42318) : forestEmerald;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.22)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

String _todayLabel() {
  final now = DateTime.now();
  final month = now.month.toString().padLeft(2, '0');
  final day = now.day.toString().padLeft(2, '0');
  return '${now.year}-$month-$day';
}

String _moneyText(num amount) {
  if (amount == 0) return '';
  return amount.round().toString();
}

num? _parseAmount(String value) {
  final cleaned = value.replaceAll(',', '').trim();
  if (cleaned.isEmpty) return null;
  return num.tryParse(cleaned);
}

num _num(Object? value) {
  if (value is num) return value;
  if (value is String) return num.tryParse(value) ?? 0;
  return 0;
}

String? _string(Object? value) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return null;
}

List<Map<String, dynamic>> _list(Object? value) {
  if (value is! List) return const [];
  return value.whereType<Map<String, dynamic>>().toList();
}

String _label(String value) {
  final words = value.toLowerCase().split('_');
  return words
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');
}

String _statusLabel(String status) {
  if (status == 'NOT_OPEN') return 'Not open';
  return _label(status);
}

String _moneyOrDash(Object? value) {
  if (value == null) return '-';
  return 'UGX ${formatMoney(_num(value))}';
}

String _dateTime(Object? value) {
  final raw = _string(value);
  if (raw == null) return '';
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  return formatActivityTime(parsed, DateTime.now());
}
