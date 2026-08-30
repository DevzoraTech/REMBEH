import 'dart:async';

import 'package:flutter/material.dart';

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
  final _amount = TextEditingController();
  final _repaymentsUsed = TextEditingController();
  final _note = TextEditingController();

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _repaymentsUsed.dispose();
    _note.dispose();
    super.dispose();
  }

  int get _amountValue => _parseMoney(_amount.text);

  int get _repaymentValue => _parseMoney(_repaymentsUsed.text);

  Future<void> _save() async {
    final amount = _amountValue;
    final repaymentPortion = _repaymentValue;

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
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Maximum: UGX ${formatMoney(widget.item.remainingAmount)}',
                  style: const TextStyle(color: slateText, fontSize: 12),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Use collected repayments (optional)',
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
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Text(
                'The rest, UGX ${formatMoney((_amountValue - _repaymentValue).clamp(0, 1 << 31))}, will be treated as assigned float.',
                style: const TextStyle(color: slateText, fontSize: 12),
              ),
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
