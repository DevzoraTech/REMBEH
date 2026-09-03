import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../shortages/presentation/utils/shortage_formatters.dart';
import '../../domain/models/salary_models.dart';

class RecordShortagePayoffSheet extends StatefulWidget {
  const RecordShortagePayoffSheet({
    super.key,
    required this.employee,
    this.openCashDayLabel,
  });

  final SalaryEmployee employee;
  final String? openCashDayLabel;

  @override
  State<RecordShortagePayoffSheet> createState() =>
      _RecordShortagePayoffSheetState();
}

class _RecordShortagePayoffSheetState extends State<RecordShortagePayoffSheet> {
  late final TextEditingController _amountController;
  final TextEditingController _noteController = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(
      text: widget.employee.shortageOutstanding > 0
          ? widget.employee.shortageOutstanding.toString()
          : '',
    );
  }

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _submit() {
    final amount = parseShortageMoney(_amountController.text);
    if (amount <= 0) {
      setState(() {
        _error = 'Enter the cash amount being paid.';
      });
      return;
    }
    if (amount > widget.employee.shortageOutstanding + 0.001) {
      setState(() {
        _error = 'Amount cannot exceed the outstanding shortage.';
      });
      return;
    }
    Navigator.of(context).pop({
      'amount': amount,
      'notes': _noteController.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Record cash payoff',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.openCashDayLabel == null
                    ? 'Open the branch day first. Cash paid against this shortage is today’s income.'
                    : 'This cash-in is recorded on ${widget.openCashDayLabel} as shortage recovery from ${widget.employee.fullName}.',
                style: const TextStyle(
                  color: slateText,
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Outstanding: ${shortageMoney(widget.employee.shortageOutstanding)}',
                style: const TextStyle(
                  color: Color(0xFFD92D20),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  prefixText: 'UGX ',
                  hintText: 'Amount paid in cash',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Note, optional',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFD92D20),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: forestEmerald,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 50),
                ),
                child: const Text(
                  'Record cash received',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
