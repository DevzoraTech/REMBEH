import 'dart:async';

import 'package:flutter/material.dart';

import '../features/agent_day/data/agent_day_status_store.dart';
import '../models/pending_disbursement.dart';
import '../services/api_client.dart';
import '../services/offline_cache_store.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';

class PendingDisbursementsScreen extends StatefulWidget {
  const PendingDisbursementsScreen({
    super.key,
    required this.session,
    this.initialItems = const [],
  });

  final RembehSession session;
  final List<PendingDisbursement> initialItems;

  @override
  State<PendingDisbursementsScreen> createState() =>
      _PendingDisbursementsScreenState();
}

class _PendingDisbursementsScreenState
    extends State<PendingDisbursementsScreen> {
  final _sessionStore = SessionStore();
  final _offlineCache = OfflineCacheStore.instance;
  final _search = TextEditingController();

  late final ApiClient _api = ApiClient(_sessionStore);

  List<PendingDisbursement> _items = const [];
  bool _loading = true;
  bool _changed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _items = widget.initialItems;
    _search.addListener(() => setState(() {}));
    unawaited(_load());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<PendingDisbursement> get _visibleItems {
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty) return _items;
    return _items
        .where(
          (item) =>
              item.borrowerName.toLowerCase().contains(query) ||
              item.phone.toLowerCase().contains(query) ||
              item.loanId.toLowerCase().contains(query),
        )
        .toList(growable: false);
  }

  int get _totalRemaining =>
      _items.fold(0, (total, item) => total + item.remainingAmount);

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await _api.listPendingDisbursements(widget.session);
      if (!mounted) return;
      setState(() {
        _items = response.items;
        _loading = false;
      });
      unawaited(_cacheItems());
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  String get _cacheKey => OfflineCacheKeys.pendingDisbursements(
    widget.session.tenantId ?? 'tenant',
    widget.session.branchId ?? 'branch',
  );

  Future<void> _cacheItems() async {
    try {
      await _offlineCache.putJson(
        _cacheKey,
        _items.map((item) => item.toJson()).toList(),
      );
    } catch (_) {
      // Keep the screen responsive even if local cache storage fails.
    }
  }

  Future<void> _openRecordSheet(PendingDisbursement item) async {
    final savedAmount = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RecordDisbursementSheet(
        session: widget.session,
        api: _api,
        item: item,
      ),
    );

    if (savedAmount != null && mounted) {
      _changed = true;
      _applyRecordedAmount(item, savedAmount);
      await _load();
    }
  }

  void _applyRecordedAmount(PendingDisbursement item, int amount) {
    setState(() {
      _items = _items
          .map((current) {
            if (current.loanId != item.loanId) return current;
            final disbursed = current.disbursedAmount + amount;
            final remaining = current.remainingAmount - amount;
            if (remaining <= 0) return null;
            final percent = current.agreedAmount <= 0
                ? 0
                : ((disbursed / current.agreedAmount) * 100).round();
            return current.copyWith(
              disbursedAmount: disbursed,
              remainingAmount: remaining,
              percentDisbursed: percent.clamp(0, 100),
              disbursementCount: current.disbursementCount + 1,
              lastDisbursementAt: DateTime.now(),
              lastDisbursementAmount: amount,
            );
          })
          .whereType<PendingDisbursement>()
          .toList(growable: false);
    });
    unawaited(_cacheItems());
  }

  void _close() => Navigator.of(context).pop(_changed);

  @override
  Widget build(BuildContext context) {
    final visible = _visibleItems;

    return Scaffold(
      backgroundColor: softIvory,
      body: SafeArea(
        child: RefreshIndicator(
          color: forestEmerald,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              _Header(onBack: _close),
              const SizedBox(height: 18),
              TextField(
                controller: _search,
                decoration: const InputDecoration(
                  hintText: 'Search borrower or loan ID...',
                  prefixIcon: Icon(Icons.search, color: slateText),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              const _WarningBanner(),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_items.length} borrower${_items.length == 1 ? '' : 's'}',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  Text.rich(
                    TextSpan(
                      text: 'Total remaining: ',
                      children: [
                        TextSpan(
                          text: 'UGX ${formatMoney(_totalRemaining)}',
                          style: const TextStyle(
                            color: Color(0xFFE11D2E),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                _InlineState(
                  icon: Icons.error_outline,
                  text: _error!,
                  onRetry: _load,
                )
              else if (visible.isEmpty)
                const _InlineState(
                  icon: Icons.check_circle_outline,
                  text: 'No pending disbursements.',
                )
              else
                ...visible.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _PendingDisbursementCard(
                      item: item,
                      onTap: () => _openRecordSheet(item),
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              const _InfoBanner(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back, color: forestEmerald),
        ),
        const Expanded(
          child: Column(
            children: [
              Text(
                'Pending disbursements',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w900,
                  fontSize: 19,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Borrowers waiting for the rest of their loan',
                textAlign: TextAlign.center,
                style: TextStyle(color: midnightNavy, fontSize: 12.5),
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: () {},
          icon: const Icon(Icons.filter_alt_outlined, color: forestEmerald),
        ),
      ],
    );
  }
}

class _WarningBanner extends StatelessWidget {
  const _WarningBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEAED),
        border: Border.all(color: const Color(0xFFFFCAD1)),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Color(0xFFE11D2E), size: 21),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'These loans are not yet fully disbursed.\nComplete the disbursement when cash is available.',
              style: TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w700,
                fontSize: 13,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF8F2),
        border: Border.all(color: const Color(0xFFD6EBDD)),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: forestEmerald, size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Once the full loan amount has been disbursed, the loan becomes active and the repayment schedule starts.',
              style: TextStyle(
                color: Color(0xFF14532D),
                fontWeight: FontWeight.w600,
                fontSize: 12.5,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingDisbursementCard extends StatelessWidget {
  const _PendingDisbursementCard({required this.item, required this.onTap});

  final PendingDisbursement item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: rembehBorderRadius(rembehRadiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 23,
                    backgroundColor: forestEmerald.withValues(alpha: 0.10),
                    child: Text(
                      item.initials,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.borrowerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Loan: ${item.loanId}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'UGX ${formatMoney(item.remainingAmount)}',
                        style: const TextStyle(
                          color: Color(0xFFE11D2E),
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 3),
                      const Text(
                        'remaining',
                        style: TextStyle(color: midnightNavy, fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, color: midnightNavy),
                ],
              ),
              const SizedBox(height: 14),
              const Divider(height: 1, color: line),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _AmountColumn(
                      label: 'Agreed amount',
                      value: item.agreedAmount,
                    ),
                  ),
                  Expanded(
                    child: _AmountColumn(
                      label: 'Disbursed so far',
                      value: item.disbursedAmount,
                    ),
                  ),
                  Expanded(
                    child: _AmountColumn(
                      label: 'Disbursements',
                      text:
                          '${item.disbursementCount} payment${item.disbursementCount == 1 ? '' : 's'}',
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

class _AmountColumn extends StatelessWidget {
  const _AmountColumn({required this.label, this.value, this.text});

  final String label;
  final int? value;
  final String? text;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: slateText, fontSize: 11)),
        const SizedBox(height: 4),
        Text(
          text ?? 'UGX ${formatMoney(value ?? 0)}',
          style: const TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w800,
            fontSize: 12.5,
          ),
        ),
      ],
    );
  }
}

class _RecordDisbursementSheet extends StatefulWidget {
  const _RecordDisbursementSheet({
    required this.session,
    required this.api,
    required this.item,
  });

  final RembehSession session;
  final ApiClient api;
  final PendingDisbursement item;

  @override
  State<_RecordDisbursementSheet> createState() =>
      _RecordDisbursementSheetState();
}

class _RecordDisbursementSheetState extends State<_RecordDisbursementSheet> {
  final _dayStore = AgentDayStatusStore.instance;
  final _amount = TextEditingController();
  final _repaymentsUsed = TextEditingController();
  final _note = TextEditingController();

  bool _saving = false;
  bool _repaymentsEdited = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _dayStore.addListener(_onDayStatusChanged);
    if (_dayStore.status == null) {
      unawaited(_dayStore.start(widget.session));
    } else {
      unawaited(_dayStore.refresh());
    }
  }

  @override
  void dispose() {
    _dayStore.removeListener(_onDayStatusChanged);
    _amount.dispose();
    _repaymentsUsed.dispose();
    _note.dispose();
    super.dispose();
  }

  int get _amountValue => _parseMoney(_amount.text);

  int get _repaymentValue => _parseMoney(_repaymentsUsed.text);

  int? get _remainingAssignedFloat {
    final status = _dayStore.status;
    if (status == null) return null;
    final remaining = status.float.unusedFloat;
    return remaining < 0 ? 0 : remaining;
  }

  int get _collectedRepaymentsAvailable {
    final status = _dayStore.status;
    if (status == null) return 0;
    final available = status.float.collectedRepaymentsAvailable;
    return available < 0 ? 0 : available;
  }

  bool get _checkingCash => _dayStore.status == null && _dayStore.loading;

  bool get _needsRepaymentFunding {
    final remainingFloat = _remainingAssignedFloat;
    return _amountValue > 0 &&
        remainingFloat != null &&
        _amountValue > remainingFloat;
  }

  bool get _showRepaymentFunding => _needsRepaymentFunding;

  int get _recommendedRepaymentValue {
    final remainingFloat = _remainingAssignedFloat;
    if (remainingFloat == null || _amountValue <= remainingFloat) return 0;
    final shortfall = _amountValue - remainingFloat;
    final available = _collectedRepaymentsAvailable;
    if (available <= 0) return 0;
    return shortfall > available ? available : shortfall;
  }

  int get _assignedFloatValue {
    final assigned = _amountValue - _repaymentValue;
    return assigned <= 0 ? 0 : assigned;
  }

  void _onDayStatusChanged() {
    if (!mounted) return;
    _syncRepaymentFunding();
    setState(() {});
  }

  void _onAmountChanged(String _) {
    _syncRepaymentFunding();
    setState(() {});
  }

  void _onRepaymentChanged(String _) {
    setState(() {
      _repaymentsEdited = true;
    });
  }

  void _syncRepaymentFunding() {
    if (!_needsRepaymentFunding) {
      _repaymentsEdited = false;
      _setRepaymentText(0);
      return;
    }
    if (_repaymentsEdited) return;
    _setRepaymentText(_recommendedRepaymentValue);
  }

  void _setRepaymentText(int value) {
    final next = value <= 0 ? '' : value.toString();
    if (_repaymentsUsed.text == next) return;
    _repaymentsUsed.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: next.length),
    );
  }

  Future<void> _save() async {
    final amount = _amountValue;
    final repaymentPortion = _repaymentValue;
    final remainingFloat = _remainingAssignedFloat;
    final assignedFloatPortion = amount - repaymentPortion;

    if (amount <= 0) {
      setState(() => _error = 'Enter the amount you are giving now.');
      return;
    }
    if (amount > widget.item.remainingAmount) {
      setState(
        () => _error =
            'Maximum amount is UGX ${formatMoney(widget.item.remainingAmount)}.',
      );
      return;
    }
    if (repaymentPortion < 0 || repaymentPortion > amount) {
      setState(
        () => _error = 'Repayments used must be part of the amount given now.',
      );
      return;
    }
    if (repaymentPortion > _collectedRepaymentsAvailable) {
      setState(
        () => _error =
            'Collected repayments available: UGX ${formatMoney(_collectedRepaymentsAvailable)}.',
      );
      return;
    }
    if (remainingFloat != null && assignedFloatPortion > remainingFloat) {
      final shortfall = assignedFloatPortion - remainingFloat;
      setState(
        () => _error = _collectedRepaymentsAvailable <= 0
            ? 'Assigned float is not enough. No collected repayments are available for this disbursement.'
            : 'Use at least UGX ${formatMoney(shortfall)} from collected repayments or reduce the amount.',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.api.recordLoanDisbursement(
        session: widget.session,
        loanId: widget.item.loanId,
        amount: amount,
        collectedRepaymentsAmount: repaymentPortion,
        note: _note.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(amount);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(100),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Record disbursement',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w900,
                        fontSize: 21,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: midnightNavy),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: forestEmerald.withValues(alpha: 0.10),
                    child: Text(
                      widget.item.initials,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.item.borrowerName,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Loan: ${widget.item.loanId}',
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEAED),
                  borderRadius: rembehBorderRadius(rembehRadiusLg),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _SheetAmount(
                        label: 'Agreed amount',
                        value: widget.item.agreedAmount,
                      ),
                    ),
                    Expanded(
                      child: _SheetAmount(
                        label: 'Disbursed so far',
                        value: widget.item.disbursedAmount,
                      ),
                    ),
                    Expanded(
                      child: _SheetAmount(
                        label: 'Remaining',
                        value: widget.item.remainingAmount,
                        danger: true,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              const Text(
                'Amount to disburse (UGX)',
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  prefixText: 'UGX  ',
                  hintText: 'Enter amount',
                  filled: true,
                  fillColor: Colors.white,
                ),
                onChanged: _onAmountChanged,
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Maximum: UGX ${formatMoney(widget.item.remainingAmount)}',
                  style: const TextStyle(color: slateText, fontSize: 12),
                ),
              ),
              const SizedBox(height: 12),
              _FundingSummary(
                amount: _amountValue,
                remainingFloat: _remainingAssignedFloat,
                assignedFloat: _assignedFloatValue,
                repaymentsUsed: _repaymentValue,
                repaymentsAvailable: _collectedRepaymentsAvailable,
                checking: _checkingCash,
              ),
              if (_showRepaymentFunding) ...[
                const SizedBox(height: 16),
                const Text(
                  'Use collected repayments',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _repaymentsUsed,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    prefixText: 'UGX  ',
                    hintText: '0',
                    filled: true,
                    fillColor: Colors.white,
                  ),
                  onChanged: _onRepaymentChanged,
                ),
                const SizedBox(height: 8),
                Text(
                  'Added from repayments: UGX ${formatMoney(_repaymentValue)}. The rest, UGX ${formatMoney(_assignedFloatValue)}, will be treated as assigned float.',
                  style: const TextStyle(color: slateText, fontSize: 12),
                ),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _note,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'Note (optional)',
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 18),
              const _SheetNotice(),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFE11D2E),
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFE11D2E),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton(
                  onPressed: _saving ? null : () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetAmount extends StatelessWidget {
  const _SheetAmount({
    required this.label,
    required this.value,
    this.danger = false,
  });

  final String label;
  final int value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(label, style: const TextStyle(color: slateText, fontSize: 11)),
        const SizedBox(height: 5),
        Text(
          'UGX ${formatMoney(value)}',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: danger ? const Color(0xFFE11D2E) : midnightNavy,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _FundingSummary extends StatelessWidget {
  const _FundingSummary({
    required this.amount,
    required this.remainingFloat,
    required this.assignedFloat,
    required this.repaymentsUsed,
    required this.repaymentsAvailable,
    required this.checking,
  });

  final int amount;
  final int? remainingFloat;
  final int assignedFloat;
  final int repaymentsUsed;
  final int repaymentsAvailable;
  final bool checking;

  @override
  Widget build(BuildContext context) {
    if (amount <= 0) return const SizedBox.shrink();

    if (checking || remainingFloat == null) {
      return const _CashNotice(
        icon: Icons.sync_rounded,
        color: slateText,
        background: sage,
        borderColor: line,
        text: "Checking today's assigned float before this is saved.",
      );
    }

    final needsRepayments = amount > remainingFloat!;
    if (!needsRepayments) {
      final after = (remainingFloat! - amount).clamp(0, 1 << 31);
      return _CashNotice(
        icon: Icons.account_balance_wallet_outlined,
        color: forestEmerald,
        background: forestEmerald.withValues(alpha: 0.08),
        borderColor: forestEmerald.withValues(alpha: 0.28),
        text:
            'This will use assigned float only. Float left after: UGX ${formatMoney(after)}.',
      );
    }

    final shortfall = amount - remainingFloat!;
    final hasRepayments = repaymentsAvailable > 0;
    final covered = repaymentsUsed > 0;

    return _CashNotice(
      icon: hasRepayments
          ? Icons.savings_outlined
          : Icons.warning_amber_rounded,
      color: const Color(0xFFE11D2E),
      background: const Color(0xFFFFEAED),
      borderColor: const Color(0xFFFFCAD1),
      text: hasRepayments
          ? 'Assigned float available: UGX ${formatMoney(remainingFloat!)}. Shortfall: UGX ${formatMoney(shortfall)}. ${covered ? 'Added from repayments: UGX ${formatMoney(repaymentsUsed)}.' : 'Add collected repayments to cover the shortfall.'} Available repayments: UGX ${formatMoney(repaymentsAvailable)}.'
          : 'Assigned float available: UGX ${formatMoney(remainingFloat!)}. No collected repayments are available, so reduce the amount or get more float.',
      footer: covered
          ? 'Tracked split: UGX ${formatMoney(assignedFloat)} assigned float + UGX ${formatMoney(repaymentsUsed)} collected repayments.'
          : null,
    );
  }
}

class _CashNotice extends StatelessWidget {
  const _CashNotice({
    required this.icon,
    required this.color,
    required this.background,
    required this.borderColor,
    required this.text,
    this.footer,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final Color borderColor;
  final String text;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: borderColor),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text,
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    height: 1.35,
                  ),
                ),
                if (footer != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    footer!,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      height: 1.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetNotice extends StatelessWidget {
  const _SheetNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEAED),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Color(0xFFE11D2E), size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Enter the amount you are giving to the borrower now. Any remaining balance stays pending.',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 13,
                height: 1.45,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineState extends StatelessWidget {
  const _InlineState({required this.icon, required this.text, this.onRetry});

  final IconData icon;
  final String text;
  final Future<void> Function()? onRetry;

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
        children: [
          Icon(icon, color: slateText),
          const SizedBox(height: 8),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: slateText),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 10),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}

int _parseMoney(String raw) =>
    int.tryParse(raw.replaceAll(',', '').trim()) ?? 0;
