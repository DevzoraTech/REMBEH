import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';

class SubmitReconciliationSheet extends StatefulWidget {
  const SubmitReconciliationSheet({
    super.key,
    required this.session,
    required this.date,
    required this.expectedClosingBalance,
    required this.countedCash,
    required this.variance,
    this.branchId,
    this.notes,
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  final num expectedClosingBalance;
  final num countedCash;
  final num variance;

  final String? notes;

  @override
  State<SubmitReconciliationSheet> createState() =>
      _SubmitReconciliationSheetState();
}

class _SubmitReconciliationSheetState extends State<SubmitReconciliationSheet> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  bool _saving = false;

  String? _error;

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final response = await _api.submitOperationReconciliation(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
        notes: widget.notes,
      );

      if (!mounted) return;

      Navigator.of(context).pop(response);
    } catch (error) {
      if (!mounted) return;

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
    final isShort = widget.variance < 0;

    final isOver = widget.variance > 0;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
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
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD8D8D8),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),

            const SizedBox(height: 24),

            Center(
              child: Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF4DB),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.warning_amber_rounded,
                  size: 34,
                  color: Color(0xFFD38B00),
                ),
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'Submit reconciliation report?',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: midnightNavy,
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 8),

            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 14),
              child: Text(
                'This will finalize today’s reconciliation and submit the report to the organization owner. Today’s operations can no longer be changed after submission.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: slateText,
                  fontSize: 11,
                  height: 1.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),

            if (isShort) ...[
              const SizedBox(height: 20),

              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7E8),
                  border: Border.all(color: const Color(0xFFF4D7A0)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: Color(0xFFD38B00),
                      size: 21,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'A UGX ${formatMoney(widget.variance.abs())} shortage will be recorded with this reconciliation.',
                        style: const TextStyle(
                          color: Color(0xFF9A6700),
                          fontSize: 11,
                          height: 1.4,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 20),

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusMd),
              ),
              child: Column(
                children: [
                  _ConfirmRow(
                    label: 'Expected closing balance',
                    amount: widget.expectedClosingBalance,
                    color: forestEmerald,
                  ),

                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: line),
                  ),

                  _ConfirmRow(
                    label: 'Counted closing balance',
                    amount: widget.countedCash,
                  ),

                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: line),
                  ),

                  _ConfirmRow(
                    label: widget.variance == 0
                        ? 'Variance'
                        : isShort
                        ? 'Variance (Shortage)'
                        : 'Variance (Excess)',
                    amount: widget.variance.abs(),
                    prefix: isShort
                        ? '- '
                        : isOver
                        ? '+ '
                        : '',
                    color: isShort ? const Color(0xFFB42318) : forestEmerald,
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
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],

            const SizedBox(height: 22),

            FilledButton.icon(
              onPressed: _saving ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: forestEmerald,
                minimumSize: const Size.fromHeight(54),
              ),
              icon: _saving
                  ? const SizedBox.shrink()
                  : const Icon(Icons.send_outlined),
              label: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Submit Report'),
            ),

            const SizedBox(height: 10),

            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () {
                      Navigator.of(context).pop(false);
                    },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(54),
              ),
              child: const Text('Go Back'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConfirmRow extends StatelessWidget {
  const _ConfirmRow({
    required this.label,
    required this.amount,
    this.prefix = '',
    this.color = midnightNavy,
  });

  final String label;
  final num amount;
  final String prefix;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: color == const Color(0xFFB42318) ? color : midnightNavy,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Text(
          '${prefix}UGX ${formatMoney(amount)}',
          style: TextStyle(
            color: color,
            fontSize: 13,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}
