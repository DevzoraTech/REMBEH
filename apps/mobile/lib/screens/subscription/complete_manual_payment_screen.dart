import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';
import 'payment_waiting_screen.dart';
import 'subscription_screen.dart';

enum ManualPaymentKind { sms, subscription }

class ManualPaymentMethod {
  const ManualPaymentMethod({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.available,
    required this.referenceHint,
    required this.howToPayTitle,
    required this.howToPaySteps,
    this.merchantCode,
    this.accountName,
  });

  final String id;
  final String title;
  final String subtitle;
  final bool available;
  final String referenceHint;
  final String howToPayTitle;
  final List<String> howToPaySteps;
  final String? merchantCode;
  final String? accountName;

  bool get isMtn => id == 'MTN_MOMO';
  bool get isAirtel => id == 'AIRTEL_MONEY';

  String get assetPath {
    if (isAirtel) return 'assets/payments/airtel.png';
    return 'assets/payments/mtn.png';
  }

  factory ManualPaymentMethod.fromJson(Map<String, dynamic> json) {
    final stepsRaw = json['howToPaySteps'];
    final steps = stepsRaw is List
        ? stepsRaw.map((s) => '$s').where((s) => s.trim().isNotEmpty).toList()
        : <String>[];
    return ManualPaymentMethod(
      id: '${json['id'] ?? ''}',
      title: '${json['title'] ?? 'Mobile Money'}',
      subtitle: '${json['subtitle'] ?? ''}',
      available: json['available'] == true,
      merchantCode: (json['merchantCode'] as String?)?.trim(),
      accountName: (json['accountName'] as String?)?.trim(),
      referenceHint: '${json['referenceHint'] ?? 'SMS'}',
      howToPayTitle: '${json['howToPayTitle'] ?? 'How to pay'}',
      howToPaySteps: steps,
    );
  }
}

/// Shared Complete payment screen for SMS bundles and Plan subscriptions.
class CompleteManualPaymentScreen extends StatefulWidget {
  CompleteManualPaymentScreen.sms({
    super.key,
    required this.session,
    required this.branchId,
    required SmsBundleOption bundle,
  })  : kind = ManualPaymentKind.sms,
        amount = bundle.priceUgx,
        currency = bundle.currency,
        title = bundle.name,
        subtitle =
            '${formatCompactMoney(bundle.smsUnits)} SMS · ${formatUgx(bundle.priceUgx, bundle.currency)}',
        bundleId = bundle.id,
        bundleName = bundle.name,
        smsUnits = bundle.smsUnits,
        planCode = null,
        planName = null,
        billingPeriodLabel = null,
        durationMonths = null;

  CompleteManualPaymentScreen.subscription({
    super.key,
    required this.session,
    required this.branchId,
    required BillingPlanOption plan,
  })  : kind = ManualPaymentKind.subscription,
        amount = plan.amount,
        currency = plan.currency,
        title = plan.name,
        subtitle = '${plan.label} · ${formatUgx(plan.amount, plan.currency)}',
        bundleId = null,
        bundleName = null,
        smsUnits = null,
        planCode = plan.code,
        planName = plan.name,
        billingPeriodLabel = plan.billingPeriodLabel,
        durationMonths = plan.durationMonths;

  final RembehSession session;
  final String branchId;
  final ManualPaymentKind kind;
  final num amount;
  final String currency;
  final String title;
  final String subtitle;

  final String? bundleId;
  final String? bundleName;
  final int? smsUnits;

  final String? planCode;
  final String? planName;
  final String? billingPeriodLabel;
  final int? durationMonths;

  @override
  State<CompleteManualPaymentScreen> createState() =>
      _CompleteManualPaymentScreenState();
}

class _CompleteManualPaymentScreenState
    extends State<CompleteManualPaymentScreen> {
  final _api = ApiClient(SessionStore());

  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String _accountNameFallback = 'ANTIKRA HOLDINGS LTD';
  List<ManualPaymentMethod> _methods = const [];
  ManualPaymentMethod? _selected;

  bool get _isSms => widget.kind == ManualPaymentKind.sms;

  @override
  void initState() {
    super.initState();
    // ignore: discarded_futures
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final payload = await _api.getManualPaymentMethods(
        session: widget.session,
        kind: _isSms ? 'sms' : 'subscription',
      );
      final fallback =
          (payload['accountNameFallback'] as String?)?.trim() ??
          'ANTIKRA HOLDINGS LTD';
      final raw = payload['methods'];
      final methods = raw is List
          ? raw
                .whereType<Map>()
                .map(
                  (row) => ManualPaymentMethod.fromJson(
                    Map<String, dynamic>.from(row),
                  ),
                )
                .where((m) => m.id.isNotEmpty)
                .toList()
          : <ManualPaymentMethod>[];

      if (!mounted) return;
      setState(() {
        _accountNameFallback = fallback;
        _methods = methods;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  String get _amountLabel => formatUgx(widget.amount, widget.currency);

  List<String> _resolvedSteps(ManualPaymentMethod method) {
    final code = method.merchantCode ?? '';
    return method.howToPaySteps
        .map(
          (step) => step
              .replaceAll('{merchantCode}', code)
              .replaceAll('{amountLabel}', _amountLabel),
        )
        .toList();
  }

  Future<void> _copy(String label, String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$label copied')),
    );
  }

  Future<void> _onMadePayment() async {
    final method = _selected;
    if (method == null || !method.available) return;

    final txnId = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (context) => _VerifyPaymentSheet(providerTitle: method.title),
    );
    if (txnId == null || !mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final Map<String, dynamic> payload;
      if (_isSms) {
        final bundleId = widget.bundleId;
        if (bundleId == null || bundleId.isEmpty) {
          throw ApiException('Missing SMS bundle for payment.');
        }
        payload = await _api.submitManualSmsPayment(
          session: widget.session,
          branchId: widget.branchId,
          bundleId: bundleId,
          provider: method.id,
          transactionId: txnId,
          confirmTransactionId: txnId,
        );
      } else {
        final planCode = widget.planCode;
        if (planCode == null || planCode.isEmpty) {
          throw ApiException('Missing plan for payment.');
        }
        payload = await _api.submitManualPlanPayment(
          session: widget.session,
          branchId: widget.branchId,
          planCode: planCode,
          provider: method.id,
          transactionId: txnId,
          confirmTransactionId: txnId,
        );
      }

      final paymentRaw = payload['payment'];
      final paymentMap = paymentRaw is Map
          ? Map<String, dynamic>.from(paymentRaw)
          : <String, dynamic>{};
      final paymentId = '${paymentMap['id'] ?? ''}'.trim();
      if (paymentId.isEmpty) {
        throw ApiException('Payment was submitted but no payment id returned.');
      }

      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => PaymentSubmittedScreen(
            session: widget.session,
            paymentId: paymentId,
            kind: widget.kind,
            amount: widget.amount,
            currency: widget.currency,
            paymentMethodTitle: method.title,
            transactionId: txnId,
            submittedAt: DateTime.tryParse('${paymentMap['date'] ?? ''}'),
            bundleName: widget.bundleName,
            smsUnits: widget.smsUnits,
            planName: widget.planName,
            billingPeriodLabel: widget.billingPeriodLabel ??
                (paymentMap['periodLabel'] as String?)?.trim(),
          ),
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text(
          'Complete payment',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: forestEmerald),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
              children: [
                Text(
                  widget.subtitle,
                  style: const TextStyle(
                    color: slateText,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Choose payment method',
                  style: TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                const Text(
                  'Select the mobile money provider you will use.',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 10),
                if (_methods.isEmpty)
                  const Text(
                    'No payment methods are available right now.',
                    style: TextStyle(
                      color: slateText,
                      fontWeight: FontWeight.w500,
                    ),
                  )
                else
                  ..._methods.map((method) {
                    final isSelected = selected?.id == method.id;
                    final enabled = method.available;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Opacity(
                        opacity: enabled ? 1 : 0.55,
                        child: Material(
                          color: Colors.white,
                          borderRadius: rembehBorderRadius(rembehRadiusLg),
                          child: InkWell(
                            onTap: enabled
                                ? () => setState(() => _selected = method)
                                : null,
                            borderRadius: rembehBorderRadius(rembehRadiusLg),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                borderRadius:
                                    rembehBorderRadius(rembehRadiusLg),
                                border: Border.all(
                                  color: isSelected && enabled
                                      ? forestEmerald
                                      : line,
                                  width: isSelected && enabled ? 1.6 : 1,
                                ),
                              ),
                              child: Row(
                                children: [
                                  ClipRRect(
                                    borderRadius:
                                        rembehBorderRadius(rembehRadiusSm),
                                    child: Image.asset(
                                      method.assetPath,
                                      width: 42,
                                      height: 42,
                                      fit: BoxFit.contain,
                                      errorBuilder: (_, _, _) => Container(
                                        width: 42,
                                        height: 42,
                                        color: sage,
                                        alignment: Alignment.center,
                                        child: Text(
                                          method.isAirtel ? 'A' : 'M',
                                          style: const TextStyle(
                                            color: forestEmerald,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                method.title,
                                                style: const TextStyle(
                                                  color: midnightNavy,
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 14,
                                                ),
                                              ),
                                            ),
                                            if (!enabled)
                                              Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                  horizontal: 8,
                                                  vertical: 3,
                                                ),
                                                decoration: BoxDecoration(
                                                  color:
                                                      const Color(0xFFF1F5F9),
                                                  borderRadius:
                                                      BorderRadius.circular(
                                                    999,
                                                  ),
                                                ),
                                                child: const Text(
                                                  'Unavailable',
                                                  style: TextStyle(
                                                    color: Color(0xFF64748B),
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          method.subtitle,
                                          style: const TextStyle(
                                            color: slateText,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Icon(
                                    isSelected && enabled
                                        ? Icons.radio_button_checked
                                        : Icons.radio_button_off,
                                    size: 20,
                                    color: isSelected && enabled
                                        ? forestEmerald
                                        : slateText,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                if (selected != null && selected.available) ...[
                  const SizedBox(height: 6),
                  const Text(
                    'Payment instructions',
                    style: TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(color: line),
                    ),
                    child: Column(
                      children: [
                        _InstructionRow(
                          label: 'Merchant code',
                          value: selected.merchantCode ?? '—',
                          onCopy: selected.merchantCode == null
                              ? null
                              : () => _copy(
                                    'Merchant code',
                                    selected.merchantCode!,
                                  ),
                        ),
                        const Divider(height: 18, color: line),
                        _InstructionRow(
                          label: 'Account name',
                          value: selected.accountName?.isNotEmpty == true
                              ? selected.accountName!
                              : _accountNameFallback,
                        ),
                        const Divider(height: 18, color: line),
                        _InstructionRow(
                          label: 'Reference',
                          value: selected.referenceHint,
                          onCopy: () =>
                              _copy('Reference', selected.referenceHint),
                        ),
                        const Divider(height: 18, color: line),
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Pay this amount',
                                style: TextStyle(
                                  color: slateText,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            Text(
                              _amountLabel,
                              style: const TextStyle(
                                color: forestEmerald,
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3FBF5),
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(color: line),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          selected.howToPayTitle,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ..._resolvedSteps(selected).asMap().entries.map((e) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 7),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 20,
                                  height: 20,
                                  alignment: Alignment.center,
                                  decoration: const BoxDecoration(
                                    color: forestEmerald,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Text(
                                    '${e.key + 1}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    e.value,
                                    style: const TextStyle(
                                      color: slateText,
                                      fontWeight: FontWeight.w500,
                                      fontSize: 12.5,
                                      height: 1.35,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: rembehBorderRadius(rembehRadiusMd),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                    ),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.info_outline_rounded,
                          size: 16,
                          color: Color(0xFF1D4ED8),
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Pay the exact amount shown above',
                            style: TextStyle(
                              color: Color(0xFF1E3A8A),
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xFFB42318),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _submitting ? null : _onMadePayment,
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('I have made the Payment'),
                  ),
                ],
              ],
            ),
    );
  }
}

class _InstructionRow extends StatelessWidget {
  const _InstructionRow({
    required this.label,
    required this.value,
    this.onCopy,
  });

  final String label;
  final String value;
  final VoidCallback? onCopy;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        if (onCopy != null)
          IconButton(
            tooltip: 'Copy',
            onPressed: onCopy,
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.copy_rounded, size: 17, color: forestEmerald),
          ),
      ],
    );
  }
}

class _VerifyPaymentSheet extends StatefulWidget {
  const _VerifyPaymentSheet({required this.providerTitle});

  final String providerTitle;

  @override
  State<_VerifyPaymentSheet> createState() => _VerifyPaymentSheetState();
}

class _VerifyPaymentSheetState extends State<_VerifyPaymentSheet> {
  final _txnController = TextEditingController();

  @override
  void dispose() {
    _txnController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final txn = _txnController.text.trim();
    final canSubmit = txn.length >= 3;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(14, 10, 14, 14 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: line,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Verify payment',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w700,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Enter the transaction ID from your ${widget.providerTitle} confirmation message.',
            style: const TextStyle(
              color: slateText,
              fontWeight: FontWeight.w500,
              fontSize: 13,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF8EB),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
              border: Border.all(color: const Color(0xFFF5D9A8)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.warning_amber_rounded,
                  size: 18,
                  color: Color(0xFFB45309),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Be very careful to enter the correct transaction ID. A wrong code may fail verification.',
                    style: TextStyle(
                      color: Color(0xFF92400E),
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _txnController,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Transaction ID',
              hintText: 'e.g. 12345',
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: canSubmit
                ? () => Navigator.of(context).pop(txn)
                : null,
            child: const Text('Verify payment'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: const Text(
              'Cancel',
              style: TextStyle(
                color: forestEmerald,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
