import 'package:flutter/material.dart';

import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/record_cash_shortage_payment.dart';
import '../../domain/models/cash_shortage.dart';
import '../utils/shortage_formatters.dart';
import '../widgets/shortage_messages.dart';

class SettleShortageSheet extends StatefulWidget {
  const SettleShortageSheet({
    super.key,
    required this.session,
    required this.shortage,
    required this.recordPayment,
  });

  final RembehSession session;
  final CashShortage shortage;
  final RecordCashShortagePayment recordPayment;

  @override
  State<SettleShortageSheet> createState() => _SettleShortageSheetState();
}

class _SettleShortageSheetState extends State<SettleShortageSheet> {
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) {
      return;
    }

    final amount = parseShortageMoney(_amountController.text);

    if (amount <= 0) {
      setState(() {
        _error = 'Enter the amount received.';
      });
      return;
    }

    if (amount > widget.shortage.amountOutstanding) {
      setState(() {
        _error = 'Settlement cannot exceed the outstanding amount.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final updated = await widget.recordPayment(
        session: widget.session,
        shortageId: widget.shortage.id,
        amount: amount,
        notes: _noteController.text,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(updated);
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
                      'Settle shortage',
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
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7F7),
                  border: Border.all(color: const Color(0xFFF3D7D7)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Outstanding amount',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      shortageMoney(widget.shortage.amountOutstanding),
                      style: const TextStyle(
                        color: Color(0xFFD92D20),
                        fontSize: 21,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Amount received',
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
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  prefixText: 'UGX ',
                  hintText: 'Enter amount',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Enter amount to settle. Partial settlement is allowed.',
                style: TextStyle(
                  color: slateText,
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Settlement note (optional)',
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
                  hintText: 'e.g. Cash received from agent',
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
                        'Confirm settlement',
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
