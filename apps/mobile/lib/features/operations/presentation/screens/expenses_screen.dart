import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import '../sheets/expense_details_sheet.dart';
import '../sheets/record_expense_sheet.dart';

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({
    super.key,
    required this.session,
    required this.date,
    required this.operation,
    required this.dayOpen,
    this.branchId,
  });

  final RembehSession session;
  final String date;
  final String? branchId;
  final Map<String, dynamic>? operation;
  final bool dayOpen;

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  Map<String, dynamic>? _operation;

  bool _loading = false;

  String? _error;

  @override
  void initState() {
    super.initState();

    _operation = widget.operation;
  }

  List<Map<String, dynamic>> get _expenses {
    final raw = _operation?['expenses'];

    if (raw is! List) {
      return const [];
    }

    return raw.whereType<Map<String, dynamic>>().toList();
  }

  List<Map<String, dynamic>> get _activeExpenses {
    return _expenses.where((expense) => expense['voidedAt'] == null).toList();
  }

  num get _spentToday {
    return _activeExpenses.fold<num>(
      0,
      (sum, expense) => sum + _num(expense['amount']),
    );
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await _api.getBranchOperation(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
      );

      if (!mounted) return;

      setState(() {
        _operation = data['operation'] as Map<String, dynamic>?;
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

  Future<void> _recordExpense() async {
    if (!widget.dayOpen) {
      setState(() {
        _error = 'Expenses can only be recorded while the branch day is open.';
      });

      return;
    }

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return RecordExpenseSheet(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
        );
      },
    );

    if (saved == true) {
      await _refresh();
    }
  }

  Future<void> _openExpense(Map<String, dynamic> expense) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return ExpenseDetailsSheet(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
          expense: expense,
          dayOpen: widget.dayOpen,
        );
      },
    );

    if (changed == true) {
      await _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = List<Map<String, dynamic>>.from(_expenses);

    rows.sort((a, b) {
      final aDate =
          DateTime.tryParse(_string(a['incurredAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);

      final bDate =
          DateTime.tryParse(_string(b['incurredAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);

      return bDate.compareTo(aDate);
    });

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
        title: const Text(
          'Expenses',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
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
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
          children: [
            if (_error != null) ...[
              _MessageCard(message: _error!, error: true),
              const SizedBox(height: 10),
            ],

            _SummaryCard(total: _spentToday, count: _activeExpenses.length),

            const SizedBox(height: 14),

            FilledButton.icon(
              onPressed: widget.dayOpen ? _recordExpense : null,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Record Expense'),
              style: FilledButton.styleFrom(
                backgroundColor: forestEmerald,
                minimumSize: const Size.fromHeight(48),
              ),
            ),

            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  child: Text(
                    _dateHeading(widget.date),
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const Text(
                  'Newest first',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.sort_rounded, size: 16, color: slateText),
              ],
            ),

            const SizedBox(height: 10),

            if (rows.isEmpty)
              const _EmptyExpenses()
            else
              ...rows.map(
                (expense) => Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: _ExpenseRow(
                    expense: expense,
                    onTap: () {
                      unawaited(_openExpense(expense));
                    },
                  ),
                ),
              ),

            if (rows.isNotEmpty) ...[
              const SizedBox(height: 3),

              _TotalCard(total: _spentToday),
            ],

            const SizedBox(height: 12),

            const _InfoCard(),

            if (_loading)
              const Padding(
                padding: EdgeInsets.only(top: 20),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.total, required this.count});

  final num total;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Spent today',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'UGX ${formatMoney(total)}',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '$count expense${count == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 58,
            height: 58,
            decoration: const BoxDecoration(
              color: Color(0xFFEAF5EC),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.account_balance_wallet_outlined,
              color: forestEmerald,
              size: 27,
            ),
          ),
        ],
      ),
    );
  }
}

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({required this.expense, required this.onTap});

  final Map<String, dynamic> expense;

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final expenseName = _string(expense['description']) ?? 'Expense';

    final description = _string(expense['description']);

    final recordedBy = _string(expense['recordedByName']) ?? '';

    final incurredAt = DateTime.tryParse(_string(expense['incurredAt']) ?? '');

    final voided = expense['voidedAt'] != null;

    return Material(
      color: Colors.white,
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusMd),
          ),
          child: Row(
            children: [
              const _ExpenseIcon(category: 'OTHER'),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            expenseName,
                            style: TextStyle(
                              color: voided ? slateText : midnightNavy,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              decoration: voided
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                        ),
                        Text(
                          'UGX ${formatMoney(_num(expense['amount']))}',
                          style: TextStyle(
                            color: voided ? slateText : midnightNavy,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w900,
                            decoration: voided
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                      ],
                    ),
                    if (description != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      '${_timeLabel(incurredAt)}'
                      '${recordedBy.isEmpty ? '' : '  •  $recordedBy'}',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 9,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (voided) ...[
                      const SizedBox(height: 4),
                      const Text(
                        'Voided',
                        style: TextStyle(
                          color: Color(0xFFB42318),
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 5),
              const Icon(
                Icons.chevron_right_rounded,
                color: slateText,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExpenseIcon extends StatelessWidget {
  const _ExpenseIcon({required this.category});

  final String category;

  @override
  Widget build(BuildContext context) {
    final icon = _categoryIcon(category);

    return Container(
      width: 39,
      height: 39,
      decoration: const BoxDecoration(
        color: Color(0xFFEAF5EC),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: forestEmerald, size: 19),
    );
  }
}

class _TotalCard extends StatelessWidget {
  const _TotalCard({required this.total});

  final num total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Total spent today',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(total)}',
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

class _InfoCard extends StatelessWidget {
  const _InfoCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F8F3),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: forestEmerald, size: 18),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'Expenses are recorded from branch cash.\n'
              'Edit or void only while the day is open.',
              style: TextStyle(
                color: slateText,
                fontSize: 9.5,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyExpenses extends StatelessWidget {
  const _EmptyExpenses();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: const Column(
        children: [
          Icon(Icons.receipt_long_outlined, color: slateText),
          SizedBox(height: 8),
          Text(
            'No expenses recorded',
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
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _categoryLabel(String value) {
  return value
      .toLowerCase()
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');
}

IconData _categoryIcon(String category) {
  switch (category.toUpperCase()) {
    case 'TRANSPORT':
      return Icons.directions_car_outlined;
    case 'FUEL':
      return Icons.local_gas_station_outlined;
    case 'MEALS':
      return Icons.restaurant_outlined;
    case 'AIRTIME':
      return Icons.phone_outlined;
    case 'MOBILE_MONEY_CHARGES':
      return Icons.phone_android_outlined;
    case 'STATIONERY':
      return Icons.shopping_bag_outlined;
    case 'REPAIRS':
      return Icons.build_outlined;
    case 'UTILITIES':
      return Icons.bolt_outlined;
    default:
      return Icons.receipt_long_outlined;
  }
}

String _dateHeading(String value) {
  final date = DateTime.tryParse(value);

  if (date == null) {
    return value;
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

  return 'Today, ${date.day} ${months[date.month - 1]} ${date.year}';
}

String _timeLabel(DateTime? date) {
  if (date == null) {
    return '';
  }

  final hour12 = date.hour == 0
      ? 12
      : date.hour > 12
      ? date.hour - 12
      : date.hour;

  final minute = date.minute.toString().padLeft(2, '0');

  final period = date.hour >= 12 ? 'PM' : 'AM';

  return '$hour12:$minute $period';
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

String? _string(Object? value) {
  if (value is! String) {
    return null;
  }

  final clean = value.trim();

  return clean.isEmpty ? null : clean;
}
