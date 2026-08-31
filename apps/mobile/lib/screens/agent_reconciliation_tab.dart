import 'dart:async';

import 'package:flutter/material.dart';

import '../models/agent_day_status.dart';
import '../services/api_client.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';

class AgentReconciliationTab extends StatefulWidget {
  const AgentReconciliationTab({
    super.key,
    required this.session,
    required this.status,
    required this.onRefreshStatus,
  });

  final RembehSession session;
  final AgentDayStatus status;
  final Future<void> Function() onRefreshStatus;

  @override
  State<AgentReconciliationTab> createState() => _AgentReconciliationTabState();
}

class _AgentReconciliationTabState extends State<AgentReconciliationTab> {
  final _api = ApiClient(SessionStore());
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();

  String? _shortageReason;
  bool _saving = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  AgentDayFloatSummary get _float => widget.status.float;

  num get _expected => _float.expectedHandover;

  num? get _enteredAmount {
    final clean = _amountController.text.replaceAll(',', '').trim();
    if (clean.isEmpty) return null;
    return num.tryParse(clean);
  }

  num get _variance {
    final entered = _enteredAmount ?? 0;
    return entered - _expected;
  }

  bool get _short => _enteredAmount != null && _variance < 0;

  bool get _alreadyReturned => _float.amountReturned != null;

  Future<void> _submit() async {
    final amount = _enteredAmount;
    if (amount == null || amount < 0) {
      setState(() => _error = 'Enter the cash you are handing over.');
      return;
    }

    if (_short && (_shortageReason == null || _shortageReason!.isEmpty)) {
      setState(() => _error = 'Choose why the handover is short.');
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Record handover?'),
        content: Text(
          'You are handing over UGX ${formatMoney(amount)}. '
          'Expected handover is UGX ${formatMoney(_expected)}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Record handover'),
          ),
        ],
      ),
    );

    if (confirmed != true || _saving) return;

    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });

    try {
      await _api.recordOwnAgentReturn(
        session: widget.session,
        date: widget.status.date,
        amountReturned: amount,
        shortageReason: _short ? _shortageReason : null,
        notes: _notesController.text,
      );
      await widget.onRefreshStatus();
      if (!mounted) return;
      setState(() {
        _notice = 'Cash handover recorded.';
        _amountController.clear();
        _notesController.clear();
        _shortageReason = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: widget.onRefreshStatus,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Reconciliation',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.status.branch?.name ?? 'Your branch',
                      style: const TextStyle(
                        color: slateText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                onPressed: _saving ? null : widget.onRefreshStatus,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _ExpectedHandoverCard(float: _float),
          const SizedBox(height: 12),
          if (_alreadyReturned)
            _ReturnedCard(float: _float)
          else
            _HandoverForm(
              amountController: _amountController,
              notesController: _notesController,
              expected: _expected,
              variance: _variance,
              shortageReason: _shortageReason,
              showShortageReason: _short,
              saving: _saving,
              onReasonChanged: (value) {
                setState(() => _shortageReason = value);
              },
              onChanged: () {
                setState(() {
                  _error = null;
                  _notice = null;
                });
              },
              onSubmit: _submit,
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            _MessageBox(text: _error!, danger: true),
          ],
          if (_notice != null) ...[
            const SizedBox(height: 12),
            _MessageBox(text: _notice!, danger: false),
          ],
        ],
      ),
    );
  }
}

class _ExpectedHandoverCard extends StatelessWidget {
  const _ExpectedHandoverCard({required this.float});

  final AgentDayFloatSummary float;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Expected handover',
            style: TextStyle(
              color: slateText,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'UGX ${formatMoney(float.expectedHandover)}',
            style: const TextStyle(
              color: forestEmerald,
              fontSize: 28,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          _MoneyLine(label: 'Float received', value: float.amountReceived),
          _MoneyLine(
            label: 'Loan disbursements',
            value: -float.amountDisbursed,
          ),
          _MoneyLine(
            label: 'Repayments collected',
            value: float.amountCollected,
          ),
          _MoneyLine(
            label: 'Repayments still available',
            value: float.collectedRepaymentsAvailable,
          ),
          _MoneyLine(label: 'Processing fees', value: float.processingFees),
          const Divider(height: 20, color: line),
          _MoneyLine(
            label: 'Cash expected back',
            value: float.expectedHandover,
            strong: true,
          ),
        ],
      ),
    );
  }
}

class _HandoverForm extends StatelessWidget {
  const _HandoverForm({
    required this.amountController,
    required this.notesController,
    required this.expected,
    required this.variance,
    required this.shortageReason,
    required this.showShortageReason,
    required this.saving,
    required this.onReasonChanged,
    required this.onChanged,
    required this.onSubmit,
  });

  final TextEditingController amountController;
  final TextEditingController notesController;
  final num expected;
  final num variance;
  final String? shortageReason;
  final bool showShortageReason;
  final bool saving;
  final ValueChanged<String?> onReasonChanged;
  final VoidCallback onChanged;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final varianceColor = variance < 0
        ? const Color(0xFFE11D2E)
        : variance > 0
        ? forestEmerald
        : slateText;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Record cash handover',
            style: TextStyle(
              color: midnightNavy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => onChanged(),
            decoration: const InputDecoration(
              prefixText: 'UGX ',
              labelText: 'Amount returned',
              hintText: 'Enter amount',
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Variance: UGX ${formatMoney(variance.abs())}'
            '${variance < 0
                ? ' short'
                : variance > 0
                ? ' over'
                : ' balanced'}',
            style: TextStyle(
              color: varianceColor,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (showShortageReason) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: shortageReason,
              decoration: const InputDecoration(labelText: 'Shortage reason'),
              items: const [
                DropdownMenuItem(
                  value: 'CASH_NOT_RETURNED',
                  child: Text('Cash not returned'),
                ),
                DropdownMenuItem(
                  value: 'COLLECTION_NOT_ACCOUNTED_FOR',
                  child: Text('Collection not accounted for'),
                ),
                DropdownMenuItem(
                  value: 'PROCESSING_FEE_NOT_ACCOUNTED_FOR',
                  child: Text('Processing fee not accounted for'),
                ),
                DropdownMenuItem(
                  value: 'FLOAT_NOT_ACCOUNTED_FOR',
                  child: Text('Float not accounted for'),
                ),
                DropdownMenuItem(value: 'OTHER', child: Text('Other')),
              ],
              onChanged: onReasonChanged,
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: notesController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Notes optional',
              hintText: 'Add any handover note',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: saving ? null : onSubmit,
            child: saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Record handover'),
          ),
        ],
      ),
    );
  }
}

class _ReturnedCard extends StatelessWidget {
  const _ReturnedCard({required this.float});

  final AgentDayFloatSummary float;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: forestEmerald.withValues(alpha: 0.08),
        border: Border.all(color: forestEmerald.withValues(alpha: 0.20)),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Cash handover recorded',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Returned UGX ${formatMoney(float.amountReturned ?? 0)}',
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 12,
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

class _MoneyLine extends StatelessWidget {
  const _MoneyLine({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final num value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final color = value < 0
        ? const Color(0xFFE11D2E)
        : strong
        ? forestEmerald
        : midnightNavy;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
          Text(
            '${value < 0 ? '- ' : ''}UGX ${formatMoney(value.abs())}',
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: strong ? FontWeight.w900 : FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.text, required this.danger});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? const Color(0xFFE11D2E) : forestEmerald;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.20)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
