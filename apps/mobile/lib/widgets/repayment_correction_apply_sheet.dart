import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/repayment/data/repayment_repository_impl.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/money.dart';

Future<ClientDetail?> showRepaymentCorrectionApplySheet(
  BuildContext context, {
  required ClientDetail detail,
  required ClientPaymentHistoryItem payment,
}) async {
  final result = await showModalBottomSheet<ClientDetail>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (_) =>
        _RepaymentCorrectionApplySheet(detail: detail, payment: payment),
  );

  return result;
}

class _RepaymentCorrectionApplySheet extends StatefulWidget {
  const _RepaymentCorrectionApplySheet({
    required this.detail,
    required this.payment,
  });

  final ClientDetail detail;
  final ClientPaymentHistoryItem payment;

  @override
  State<_RepaymentCorrectionApplySheet> createState() =>
      _RepaymentCorrectionApplySheetState();
}

class _RepaymentCorrectionApplySheetState
    extends State<_RepaymentCorrectionApplySheet> {
  late final _amount = TextEditingController(
    text: widget.payment.amount.toString(),
  );
  late final _note = TextEditingController(text: widget.payment.note ?? '');
  final _reason = TextEditingController();
  late String _method = widget.payment.method;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final reason = _reason.text.trim();
    final amount = int.tryParse(_amount.text.replaceAll(',', '').trim());

    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter the corrected amount.');
      return;
    }

    if (reason.length < 6) {
      setState(() => _error = 'Add a reason for this correction.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final updated = await RepaymentsLiveStore.instance
          .applyRepaymentCorrection(
            repaymentId: widget.payment.id,
            loanId: widget.detail.loanId,
            reason: reason,
            correctionRequestId:
                widget.payment.approvedCorrectionRequestId ??
                widget.payment.pendingCorrectionRequestId,
            amount: amount,
            method: _method,
            note: _note.text,
          );

      if (!mounted) return;
      Navigator.of(context).pop(toUiClientDetail(updated));
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
                      'Correct payment',
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
                  color: const Color(0xFFFFF1F2),
                  border: Border.all(color: const Color(0xFFFFCCD5)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Text(
                  '${widget.detail.fullName} · current payment ${formatMoney(widget.payment.amount)}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Correct amount',
                  prefixText: 'UGX ',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _method,
                decoration: const InputDecoration(labelText: 'Payment method'),
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
                decoration: const InputDecoration(labelText: 'Payment note'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _reason,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Reason for saved correction',
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
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(_saving ? 'Saving...' : 'Save correction'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
