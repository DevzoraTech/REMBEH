import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/money.dart';

Future<bool> showRepaymentCorrectionRequestSheet(
  BuildContext context, {
  required ClientDetail detail,
  required ClientPaymentHistoryItem payment,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (_) =>
        _RepaymentCorrectionRequestSheet(detail: detail, payment: payment),
  );

  return result ?? false;
}

class _RepaymentCorrectionRequestSheet extends StatefulWidget {
  const _RepaymentCorrectionRequestSheet({
    required this.detail,
    required this.payment,
  });

  final ClientDetail detail;
  final ClientPaymentHistoryItem payment;

  @override
  State<_RepaymentCorrectionRequestSheet> createState() =>
      _RepaymentCorrectionRequestSheetState();
}

class _RepaymentCorrectionRequestSheetState
    extends State<_RepaymentCorrectionRequestSheet> {
  final _reason = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  late String _method = widget.payment.method;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason.text.trim();
    if (reason.length < 6) {
      setState(() => _error = 'Explain the mistake before sending.');
      return;
    }

    final requestedAmount = _amount.text.trim().isEmpty
        ? null
        : int.tryParse(_amount.text.replaceAll(',', '').trim());
    if (_amount.text.trim().isNotEmpty &&
        (requestedAmount == null || requestedAmount <= 0)) {
      setState(() => _error = 'Enter a valid corrected amount.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await RepaymentsLiveStore.instance.requestRepaymentCorrection(
        repaymentId: widget.payment.id,
        loanId: widget.detail.loanId,
        reason: reason,
        requestedAmount: requestedAmount,
        requestedMethod: _method == widget.payment.method ? null : _method,
        requestedNote: _note.text.trim().isEmpty ? null : _note.text.trim(),
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
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
                      'Request correction',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: sage,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.detail.fullName,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Recorded ${formatMoney(widget.payment.amount)} by ${widget.payment.recordedByName}',
                      style: const TextStyle(
                        color: slateText,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _reason,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'What is wrong?',
                  hintText: 'Example: I entered 50,000 but collected 5,000.',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Correct amount (optional)',
                  prefixText: 'UGX ',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _method,
                decoration: const InputDecoration(
                  labelText: 'Correct method (optional)',
                ),
                items: const [
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                  DropdownMenuItem(
                    value: 'MOBILE_MONEY',
                    child: Text('Mobile money'),
                  ),
                  DropdownMenuItem(
                    value: 'BANK_TRANSFER',
                    child: Text('Bank transfer'),
                  ),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value == null) return;
                        setState(() => _method = value);
                      },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Replacement note (optional)',
                  hintText: 'Leave empty if the note is still correct.',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFE11D2E),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _saving ? null : _submit,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.outgoing_mail),
                  label: Text(
                    _saving ? 'Sending...' : 'Send correction request',
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
