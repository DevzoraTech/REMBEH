import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../../shortages/presentation/utils/shortage_formatters.dart';
import '../../domain/models/salary_models.dart';

class RecordOpeningShortageSheet extends StatefulWidget {
  const RecordOpeningShortageSheet({super.key, required this.employee});

  final SalaryEmployee employee;

  @override
  State<RecordOpeningShortageSheet> createState() =>
      _RecordOpeningShortageSheetState();
}

class _RecordOpeningShortageSheetState
    extends State<RecordOpeningShortageSheet> {
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  String? _error;

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
        _error = 'Enter the shortage amount from the previous system.';
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
                'Record prior shortage',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Enter the outstanding shortage ${widget.employee.fullName} still owes from the previous system.',
                style: const TextStyle(
                  color: slateText,
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
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
                  hintText: 'Amount outstanding',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Note, e.g. carried from previous books',
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
                  'Save shortage',
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
