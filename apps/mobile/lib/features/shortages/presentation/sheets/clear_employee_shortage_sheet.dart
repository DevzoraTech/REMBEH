import 'package:flutter/material.dart';

import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/settle_employee_shortage.dart';
import '../../domain/models/cash_shortage.dart';
import '../utils/shortage_formatters.dart';
import '../widgets/shortage_messages.dart';

class ClearEmployeeShortageSheet extends StatefulWidget {
  const ClearEmployeeShortageSheet({
    super.key,
    required this.session,
    required this.employees,
    required this.settleEmployee,
  });

  final RembehSession session;
  final List<ShortageEmployeeOption> employees;
  final SettleEmployeeShortage settleEmployee;

  @override
  State<ClearEmployeeShortageSheet> createState() =>
      _ClearEmployeeShortageSheetState();
}

class _ClearEmployeeShortageSheetState
    extends State<ClearEmployeeShortageSheet> {
  late String? _selectedUserId;
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selectedUserId = widget.employees.length == 1
        ? widget.employees.first.userId
        : null;
    final selected = _selectedEmployee;
    if (selected != null) {
      _amountController.text = selected.outstanding.toString();
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  ShortageEmployeeOption? get _selectedEmployee {
    final userId = _selectedUserId;
    if (userId == null) {
      return null;
    }
    for (final employee in widget.employees) {
      if (employee.userId == userId) {
        return employee;
      }
    }
    return null;
  }

  void _selectEmployee(String? userId) {
    setState(() {
      _selectedUserId = userId;
      _error = null;
    });
    final selected = _selectedEmployee;
    if (selected != null) {
      _amountController.text = selected.outstanding.toString();
    }
  }

  Future<void> _submit() async {
    if (_saving) {
      return;
    }

    final employee = _selectedEmployee;
    if (employee == null) {
      setState(() {
        _error = 'Select the employee whose shortage is being cleared.';
      });
      return;
    }

    final amount = parseShortageMoney(_amountController.text);
    if (amount <= 0) {
      setState(() {
        _error = 'Enter the amount cleared.';
      });
      return;
    }

    if (amount > employee.outstanding) {
      setState(() {
        _error = 'Clearance cannot exceed the outstanding shortage.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.settleEmployee(
        session: widget.session,
        responsibleUserId: employee.userId,
        amount: amount,
        notes: _noteController.text,
      );

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
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final selected = _selectedEmployee;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
        child: SafeArea(
          top: false,
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
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Clear shortage',
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
                        : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: midnightNavy),
                  ),
                ],
              ),
              const Text(
                'Select the employee and record the amount cleared, even if their salary date is not due.',
                style: TextStyle(
                  color: slateText,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Employee',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              InputDecorator(
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _selectedUserId,
                    isExpanded: true,
                    hint: const Text('Select employee'),
                    items: [
                      for (final employee in widget.employees)
                        DropdownMenuItem(
                          value: employee.userId,
                          child: Text(
                            '${employee.name} · ${shortageMoney(employee.outstanding)}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: _saving ? null : _selectEmployee,
                  ),
                ),
              ),
              if (selected != null) ...[
                const SizedBox(height: 10),
                Text(
                  'Outstanding: ${shortageMoney(selected.outstanding)}',
                  style: const TextStyle(
                    color: Color(0xFFD92D20),
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              const Text(
                'Amount cleared',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              TextField(
                controller: _amountController,
                enabled: !_saving,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  prefixText: 'UGX ',
                  hintText: 'Enter amount',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Note (optional)',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              TextField(
                controller: _noteController,
                enabled: !_saving,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'e.g. Shortage cleared in cash',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                ShortageInlineMessage(message: _error!, error: true),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: forestEmerald,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 50),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
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
                        'Record shortage cleared',
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
