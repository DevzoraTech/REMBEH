import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';

class RecordExpenseSheet extends StatefulWidget {
  const RecordExpenseSheet({
    super.key,
    required this.session,
    required this.date,
    this.branchId,
    this.initialExpense,
    this.paidFromAgentFloat = false,
    this.remainingCash,
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  /// When supplied, the sheet edits an existing expense.
  final Map<String, dynamic>? initialExpense;

  /// Field officers pay from issued float, not branch till cash.
  final bool paidFromAgentFloat;

  /// Cash still available from this source after earlier expenses.
  final num? remainingCash;

  @override
  State<RecordExpenseSheet> createState() => _RecordExpenseSheetState();
}

class _RecordExpenseSheetState extends State<RecordExpenseSheet> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  late final TextEditingController _amount;
  late final TextEditingController _description;

  bool _saving = false;
  String? _error;

  bool get _editing => widget.initialExpense != null;

  @override
  void initState() {
    super.initState();

    final expense = widget.initialExpense;

    final amount = _num(expense?['amount']);

    _amount = TextEditingController(
      text: amount > 0 ? amount.round().toString() : '',
    );

    _description = TextEditingController(
      text: _string(expense?['description']) ?? '',
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();

    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) {
      return;
    }

    final amount = _parseAmount(_amount.text);
    final expenseName = _description.text.trim();

    if (expenseName.isEmpty) {
      setState(() {
        _error = 'Enter the name of the expense.';
      });

      return;
    }

    if (amount == null || amount <= 0) {
      setState(() {
        _error = 'Enter the expense amount.';
      });

      return;
    }

    final remaining = widget.remainingCash;
    if (remaining != null && amount > remaining) {
      setState(() {
        _error =
            'Expense exceeds remaining ${widget.paidFromAgentFloat ? 'float' : 'branch cash'}. Available: ${remaining.round()}.';
      });

      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      if (_editing) {
        final expenseId = _string(widget.initialExpense?['id']);

        if (expenseId == null) {
          throw ApiException('Expense record is not available.');
        }

        await _api.updateBranchExpense(
          session: widget.session,
          expenseId: expenseId,
          amount: amount,
          description: expenseName,
        );
      } else {
        await _api.recordBranchExpense(
          session: widget.session,
          branchId: widget.branchId,
          date: widget.date,
          amount: amount,
          description: expenseName,
          paidFrom: widget.paidFromAgentFloat ? 'AGENT_FLOAT' : 'BRANCH_CASH',
        );
      }

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }

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
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(22),
        ),
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

            const SizedBox(height: 18),

            Row(
              children: [
                Expanded(
                  child: Text(
                    _editing ? 'Edit expense' : 'Record expense',
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
                      : () {
                          Navigator.of(context).pop(false);
                        },
                  icon: const Icon(
                    Icons.close_rounded,
                    size: 21,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            const Text(
              'Name of expense',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),

            const SizedBox(height: 7),

            TextField(
              controller: _description,
              autofocus: !_editing,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                hintText: 'e.g. Transport to client follow-up',
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'Amount (UGX)',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),

            const SizedBox(height: 7),

            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                hintText: '0',
              ),
              onChanged: (_) => setState(() {}),
            ),

            const SizedBox(height: 4),

            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 11,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFF7FAF7),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
                border: Border.all(color: line),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.payments_outlined,
                    color: forestEmerald,
                    size: 18,
                  ),
                  const SizedBox(width: 9),
                  const Expanded(
                    child: Text(
                      'Paid from',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    widget.paidFromAgentFloat ? 'Your float' : 'Branch cash',
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),

            if (widget.remainingCash != null) ...[
              const SizedBox(height: 8),
              _RemainingCashLine(
                remaining: widget.remainingCash!,
                amountText: _amount.text,
                paidFromAgentFloat: widget.paidFromAgentFloat,
              ),
            ],

            if (_error != null) ...[
              const SizedBox(height: 12),
              _ErrorText(
                message: _error!,
              ),
            ],

            const SizedBox(height: 20),

            FilledButton(
              onPressed: _saving ? null : _save,
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
                  : Text(
                      _editing ? 'Save Changes' : 'Record Expense',
                    ),
            ),

            const SizedBox(height: 8),

            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () {
                      Navigator.of(context).pop(false);
                    },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}

class _RemainingCashLine extends StatelessWidget {
  const _RemainingCashLine({
    required this.remaining,
    required this.amountText,
    required this.paidFromAgentFloat,
  });

  final num remaining;
  final String amountText;
  final bool paidFromAgentFloat;

  @override
  Widget build(BuildContext context) {
    final entered = _parseAmount(amountText) ?? 0;
    final after = remaining - entered;
    final over = after < 0;

    return Text(
      over
          ? 'Exceeds remaining ${paidFromAgentFloat ? 'float' : 'cash'} by UGX ${formatMoney(after.abs())}'
          : entered > 0
          ? 'Remaining after this expense: UGX ${formatMoney(after)}'
          : 'Available ${paidFromAgentFloat ? 'in your float' : 'branch cash'}: UGX ${formatMoney(remaining)}',
      style: TextStyle(
        color: over ? const Color(0xFFB42318) : slateText,
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText({
    required this.message,
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: const TextStyle(
        color: Color(0xFFB42318),
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

num? _parseAmount(String value) {
  final clean = value.replaceAll(',', '').trim();

  if (clean.isEmpty) {
    return null;
  }

  return num.tryParse(clean);
}

num _num(dynamic value) {
  if (value is num) {
    return value;
  }

  return num.tryParse(value?.toString() ?? '') ?? 0;
}

String? _string(dynamic value) {
  final text = value?.toString().trim();

  if (text == null || text.isEmpty) {
    return null;
  }

  return text;
}
