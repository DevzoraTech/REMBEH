import 'package:flutter/material.dart';

import '../../../../../theme.dart';
import '../../domain/models/salary_models.dart';
import '../utils/salary_formatters.dart';
import '../widgets/salary_avatar.dart';

class RecordSalaryPaymentSheet extends StatefulWidget {
  const RecordSalaryPaymentSheet({
    super.key,
    required this.employee,
    required this.cycleLabel,
  });

  final SalaryEmployee employee;
  final String cycleLabel;

  @override
  State<RecordSalaryPaymentSheet> createState() =>
      _RecordSalaryPaymentSheetState();
}

class _RecordSalaryPaymentSheetState extends State<RecordSalaryPaymentSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _reference;
  String _method = 'CASH';
  DateTime _paidAt = DateTime.now();

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController();
    _reference = TextEditingController();
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _paidAt,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _paidAt = picked);
    }
  }

  void _save() {
    final amount = num.tryParse(_amount.text.replaceAll(',', '').trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid payment amount.')),
      );
      return;
    }
    Navigator.of(context).pop(<String, dynamic>{
      'amount': amount,
      'method': _method,
      'paidAt': _paidAt.toIso8601String(),
      if (_reference.text.trim().isNotEmpty)
        'referenceNote': _reference.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 10,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 48,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Record Salary Payment',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close_rounded, color: midnightNavy),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  SalaryAvatar(
                    name: widget.employee.fullName,
                    photoUrl: widget.employee.photoUrl,
                    radius: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.employee.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '${widget.employee.roleName ?? 'Employee'}\nCycle: ${widget.cycleLabel}',
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 12,
                            height: 1.35,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F6FF),
                  border: Border.all(color: const Color(0xFFDDE6FF)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Column(
                  children: [
                    const Text(
                      'Outstanding balance',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      salaryMoney(widget.employee.outstanding),
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount paid',
                  prefixText: 'UGX  ',
                ),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _method,
                items: const [
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                  DropdownMenuItem(
                    value: 'MOBILE_MONEY',
                    child: Text('Mobile Money'),
                  ),
                  DropdownMenuItem(
                    value: 'BANK_TRANSFER',
                    child: Text('Bank transfer'),
                  ),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: (value) => setState(() => _method = value!),
                decoration: const InputDecoration(
                  labelText: 'Payment method',
                  prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                ),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _pickDate,
                borderRadius: rembehBorderRadius(rembehRadiusMd),
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Payment date',
                    prefixIcon: Icon(Icons.calendar_today_outlined),
                  ),
                  child: Text(salaryDate(_paidAt)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _reference,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Reference / Note',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _save,
                      child: const Text('Record payment'),
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
