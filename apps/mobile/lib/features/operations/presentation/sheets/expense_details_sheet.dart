import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import 'record_expense_sheet.dart';

class ExpenseDetailsSheet extends StatefulWidget {
  const ExpenseDetailsSheet({
    super.key,
    required this.session,
    required this.date,
    required this.expense,
    required this.dayOpen,
    this.branchId,
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  final Map<String, dynamic> expense;
  final bool dayOpen;

  @override
  State<ExpenseDetailsSheet> createState() => _ExpenseDetailsSheetState();
}

class _ExpenseDetailsSheetState extends State<ExpenseDetailsSheet> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  bool _saving = false;
  String? _error;

  bool get _voided => widget.expense['voidedAt'] != null;

  Future<void> _edit() async {
    if (!widget.dayOpen || _voided) {
      return;
    }

    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return RecordExpenseSheet(
          session: widget.session,
          date: widget.date,
          branchId: widget.branchId,
          initialExpense: widget.expense,
        );
      },
    );

    if (changed == true && mounted) {
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _voidExpense() async {
    if (!widget.dayOpen || _voided || _saving) {
      return;
    }

    final reason = TextEditingController();

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _VoidExpenseSheet(reasonController: reason);
      },
    );

    if (confirmed != true) {
      reason.dispose();
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final expenseId = _string(widget.expense['id']);

      if (expenseId == null) {
        throw ApiException('Expense record is not available.');
      }

      await _api.voidBranchExpense(
        session: widget.session,
        expenseId: expenseId,
        reason: reason.text,
      );

      if (!mounted) return;

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      reason.dispose();

      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final category = _string(widget.expense['category']) ?? 'OTHER';

    final amount = _num(widget.expense['amount']);

    final description =
        _string(widget.expense['description']) ?? 'No description';

    final recordedBy = _string(widget.expense['recordedByName']) ?? 'Unknown';

    final incurredAt = DateTime.tryParse(
      _string(widget.expense['incurredAt']) ?? '',
    );

    final voidedBy = _string(widget.expense['voidedByName']);

    final voidReason = _string(widget.expense['voidReason']);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        10,
        20,
        MediaQuery.of(context).viewInsets.bottom + 18,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD8D8D8),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),

            const SizedBox(height: 16),

            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Expense details',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _saving
                      ? null
                      : () {
                          Navigator.of(context).pop(false);
                        },
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),

            const SizedBox(height: 8),

            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEAF5EC),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _categoryIcon(category),
                    color: forestEmerald,
                    size: 22,
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _categoryLabel(category),
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),

                Text(
                  'UGX ${formatMoney(amount)}',
                  style: TextStyle(
                    color: _voided ? slateText : forestEmerald,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    decoration: _voided ? TextDecoration.lineThrough : null,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),

            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Column(
                children: [
                  _DetailsRow(
                    icon: Icons.description_outlined,
                    label: 'Description',
                    value: description,
                  ),

                  const Divider(height: 1, color: line),

                  const _DetailsRow(
                    icon: Icons.payments_outlined,
                    label: 'Paid from',
                    value: 'Branch cash',
                    iconColor: forestEmerald,
                  ),

                  const Divider(height: 1, color: line),

                  _DetailsRow(
                    icon: Icons.person_outline,
                    label: 'Recorded by',
                    value: recordedBy,
                  ),

                  const Divider(height: 1, color: line),

                  _DetailsRow(
                    icon: Icons.calendar_today_outlined,
                    label: 'Recorded on',
                    value: _dateTimeLabel(incurredAt),
                  ),

                  if (_voided) ...[
                    const Divider(height: 1, color: line),

                    _DetailsRow(
                      icon: Icons.block_outlined,
                      label: 'Status',
                      value: voidedBy == null
                          ? 'Voided'
                          : 'Voided by $voidedBy',
                      iconColor: const Color(0xFFB42318),
                    ),

                    if (voidReason != null) ...[
                      const Divider(height: 1, color: line),
                      _DetailsRow(
                        icon: Icons.notes_outlined,
                        label: 'Void reason',
                        value: voidReason,
                      ),
                    ],
                  ],
                ],
              ),
            ),

            const SizedBox(height: 14),

            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _voided
                    ? const Color(0xFFFDF2F2)
                    : const Color(0xFFF3F8F3),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    _voided
                        ? Icons.info_outline_rounded
                        : Icons.info_outline_rounded,
                    color: _voided ? const Color(0xFFB42318) : forestEmerald,
                    size: 18,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      _voided
                          ? 'This expense was voided and no longer affects branch cash.'
                          : widget.dayOpen
                          ? 'You can edit or void this expense while the day is open. Changes are saved in the audit trail.'
                          : 'This expense is locked because the business day is no longer open.',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 9.5,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                  color: Color(0xFFB42318),
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],

            if (widget.dayOpen && !_voided) ...[
              const SizedBox(height: 14),

              OutlinedButton.icon(
                onPressed: _saving ? null : _edit,
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Edit expense'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: forestEmerald,
                  side: const BorderSide(color: forestEmerald),
                  minimumSize: const Size.fromHeight(49),
                ),
              ),

              const SizedBox(height: 8),

              OutlinedButton.icon(
                onPressed: _saving ? null : _voidExpense,
                icon: const Icon(Icons.block_outlined),
                label: const Text('Void expense'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFB42318),
                  side: const BorderSide(color: Color(0xFFB42318)),
                  minimumSize: const Size.fromHeight(49),
                ),
              ),
            ],

            const SizedBox(height: 8),

            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () {
                      Navigator.of(context).pop(false);
                    },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(49),
              ),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}

class _VoidExpenseSheet extends StatelessWidget {
  const _VoidExpenseSheet({required this.reasonController});

  final TextEditingController reasonController;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        10,
        20,
        MediaQuery.of(context).viewInsets.bottom + 18,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFD8D8D8),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),

          const SizedBox(height: 18),

          const Text(
            'Void expense?',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 5),

          const Text(
            'The record will remain in the audit trail but will no longer affect today’s branch cash.',
            style: TextStyle(
              color: slateText,
              fontSize: 10.5,
              height: 1.45,
              fontWeight: FontWeight.w500,
            ),
          ),

          const SizedBox(height: 16),

          TextField(
            controller: reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              hintText: 'Why is this expense being voided?',
            ),
          ),

          const SizedBox(height: 20),

          FilledButton(
            onPressed: () {
              Navigator.of(context).pop(true);
            },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFB42318),
              minimumSize: const Size.fromHeight(49),
            ),
            child: const Text('Void Expense'),
          ),

          const SizedBox(height: 8),

          OutlinedButton(
            onPressed: () {
              Navigator.of(context).pop(false);
            },
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(49),
            ),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

class _DetailsRow extends StatelessWidget {
  const _DetailsRow({
    required this.icon,
    required this.label,
    required this.value,
    this.iconColor = midnightNavy,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10.5,
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

IconData _categoryIcon(String value) {
  switch (value.toUpperCase()) {
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

String _dateTimeLabel(DateTime? value) {
  if (value == null) {
    return '-';
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

  final hour = value.hour == 0
      ? 12
      : value.hour > 12
      ? value.hour - 12
      : value.hour;

  final minute = value.minute.toString().padLeft(2, '0');

  final period = value.hour >= 12 ? 'PM' : 'AM';

  return '${value.day} '
      '${months[value.month - 1]} '
      '${value.year}, '
      '$hour:$minute $period';
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
