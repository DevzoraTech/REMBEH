import 'package:flutter/material.dart';

import '../../features/sms/data/sms_credits_store.dart';
import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';
import 'complete_manual_payment_screen.dart';
import 'payment_waiting_screen.dart';

enum SubscriptionTab { plan, sms }

class SmsBundleOption {
  const SmsBundleOption({
    required this.id,
    required this.code,
    required this.name,
    required this.priceUgx,
    required this.smsUnits,
    required this.currency,
  });

  final String id;
  final String code;
  final String name;
  final int priceUgx;
  final int smsUnits;
  final String currency;

  factory SmsBundleOption.fromJson(Map<String, dynamic> json) {
    return SmsBundleOption(
      id: '${json['id'] ?? ''}',
      code: '${json['code'] ?? ''}',
      name: '${json['name'] ?? 'SMS bundle'}',
      priceUgx: _asInt(json['priceUgx']),
      smsUnits: _asInt(json['smsUnits']),
      currency: '${json['currency'] ?? 'UGX'}',
    );
  }
}

class BillingPlanOption {
  const BillingPlanOption({
    required this.code,
    required this.name,
    required this.amount,
    required this.currency,
    required this.interval,
    required this.durationMonths,
    required this.label,
    required this.tagline,
    this.compareAtAmount,
    this.savingsAmount,
    this.badge,
    this.defaultSelected = false,
  });

  final String code;
  final String name;
  final num amount;
  final String currency;
  final String interval;
  final int durationMonths;
  final String label;
  final String tagline;
  final num? compareAtAmount;
  final num? savingsAmount;
  final String? badge;
  final bool defaultSelected;

  String get billingPeriodLabel {
    if (durationMonths <= 1) return 'Monthly';
    return '$durationMonths months';
  }

  bool get isBestValue => badge == 'BEST_VALUE';
  bool get isMostPopular => badge == 'MOST_POPULAR';

  factory BillingPlanOption.fromJson(Map<String, dynamic> json) {
    return BillingPlanOption(
      code: '${json['code'] ?? ''}'.trim().toUpperCase(),
      name: '${json['name'] ?? 'Pro'}',
      amount: json['amount'] is num
          ? json['amount'] as num
          : num.tryParse('${json['amount']}') ?? 0,
      currency: '${json['currency'] ?? 'UGX'}',
      interval: '${json['interval'] ?? ''}',
      durationMonths: _asInt(json['durationMonths']),
      label: '${json['label'] ?? 'Plan'}',
      tagline: '${json['tagline'] ?? ''}',
      compareAtAmount: json['compareAtAmount'] is num
          ? json['compareAtAmount'] as num
          : num.tryParse('${json['compareAtAmount'] ?? ''}'),
      savingsAmount: json['savingsAmount'] is num
          ? json['savingsAmount'] as num
          : num.tryParse('${json['savingsAmount'] ?? ''}'),
      badge: (json['badge'] as String?)?.trim(),
      defaultSelected: json['defaultSelected'] == true,
    );
  }
}

class BillingPaymentRow {
  const BillingPaymentRow({
    required this.id,
    required this.date,
    required this.kind,
    required this.transaction,
    required this.amount,
    required this.currency,
    required this.status,
    this.periodLabel,
    this.credits,
    this.paymentMethod,
    this.failureReason,
    this.transactionId,
    this.bundleId,
    this.branchId,
    this.canCancel,
    this.planCode,
    this.planDurationMonths,
    this.activeUntil,
  });

  final String id;
  final DateTime? date;
  final String kind;
  final String transaction;
  final num amount;
  final String currency;
  final String status;
  final String? periodLabel;
  final int? credits;
  final String? paymentMethod;
  final String? failureReason;
  final String? transactionId;
  final String? bundleId;
  final String? branchId;
  final bool? canCancel;
  final String? planCode;
  final int? planDurationMonths;
  final DateTime? activeUntil;

  bool get isSms => kind.toLowerCase() == 'sms';

  bool get isPending {
    final s = status.trim().toLowerCase();
    return s == 'pending' || s.contains('pending');
  }

  factory BillingPaymentRow.fromJson(Map<String, dynamic> json) {
    return BillingPaymentRow(
      id: '${json['id'] ?? ''}',
      date: DateTime.tryParse('${json['date'] ?? ''}'),
      kind: '${json['kind'] ?? 'subscription'}',
      transaction: '${json['transaction'] ?? 'Payment'}',
      amount: json['amount'] is num
          ? json['amount'] as num
          : num.tryParse('${json['amount']}') ?? 0,
      currency: '${json['currency'] ?? 'UGX'}',
      status: '${json['status'] ?? 'Pending'}',
      periodLabel: (json['periodLabel'] as String?)?.trim(),
      credits: json['credits'] is num
          ? (json['credits'] as num).floor()
          : int.tryParse('${json['credits'] ?? ''}'),
      paymentMethod: (json['paymentMethod'] as String?)?.trim(),
      failureReason: (json['failureReason'] as String?)?.trim(),
      transactionId: (json['transactionId'] as String?)?.trim(),
      bundleId: (json['bundleId'] as String?)?.trim(),
      branchId: (json['branchId'] as String?)?.trim(),
      canCancel: json['canCancel'] == true,
      planCode: (json['planCode'] as String?)?.trim(),
      planDurationMonths: json['planDurationMonths'] is num
          ? (json['planDurationMonths'] as num).floor()
          : int.tryParse('${json['planDurationMonths'] ?? ''}'),
      activeUntil: DateTime.tryParse('${json['activeUntil'] ?? ''}'),
    );
  }
}

int _asInt(dynamic value) {
  if (value is num) return value.floor();
  return int.tryParse('$value') ?? 0;
}

String formatUgx(num amount, [String currency = 'UGX']) {
  return '$currency ${formatCompactMoney(amount)}';
}

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({
    super.key,
    required this.session,
    this.initialTab = SubscriptionTab.plan,
    this.branchId,
  });

  static const routeName = 'subscription';

  final RembehSession session;
  final SubscriptionTab initialTab;

  /// Prefer this when the owner filter has a concrete branch selected.
  final String? branchId;

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final _api = ApiClient(SessionStore());
  final _smsStore = SmsCreditsStore.instance;

  late SubscriptionTab _tab;
  bool _loading = true;
  String? _error;

  Map<String, dynamic>? _branchBilling;
  List<BillingPlanOption> _plans = const [];
  List<SmsBundleOption> _bundles = const [];
  List<BillingPaymentRow> _smsPayments = const [];
  List<BillingPaymentRow> _planPayments = const [];
  BillingPaymentRow? _pendingSmsPayment;
  BillingPaymentRow? _pendingPlanPayment;
  String? _selectedBundleId;
  String? _selectedPlanCode;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
    _smsStore.addListener(_onSmsChanged);
    // ignore: discarded_futures
    _load();
  }

  @override
  void dispose() {
    _smsStore.removeListener(_onSmsChanged);
    super.dispose();
  }

  void _onSmsChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        _api.getBillingMyBranch(session: widget.session),
        _api.getBillingSummary(session: widget.session),
        _api.getSmsCreditBundles(session: widget.session),
        _api.getBillingPayments(session: widget.session),
        _smsStore.refresh(silent: true),
      ]);

      final branch = results[0] as Map<String, dynamic>;
      final summary = results[1] as Map<String, dynamic>;
      final bundlesPayload = results[2] as Map<String, dynamic>;
      final paymentsPayload = results[3] as Map<String, dynamic>;

      final branchId = _resolvedBranchId;
      final plans = _plansFromSummary(summary, branchId);

      final rawBundles = bundlesPayload['bundles'];
      final bundles = rawBundles is List
          ? rawBundles
                .whereType<Map>()
                .map((row) => SmsBundleOption.fromJson(
                      Map<String, dynamic>.from(row),
                    ))
                .where((b) => b.id.isNotEmpty)
                .toList()
          : <SmsBundleOption>[];

      final rawPayments = paymentsPayload['payments'];
      final allPayments = rawPayments is List
          ? rawPayments
                .whereType<Map>()
                .map((row) => BillingPaymentRow.fromJson(
                      Map<String, dynamic>.from(row),
                    ))
                .where((p) => p.id.isNotEmpty)
                .toList()
          : <BillingPaymentRow>[];

      final smsPayments = allPayments.where((p) => p.isSms).toList();
      final planPayments = allPayments.where((p) => !p.isSms).toList();

      BillingPaymentRow? pendingSms;
      for (final payment in smsPayments) {
        if (!payment.isPending) continue;
        if (branchId != null &&
            payment.branchId != null &&
            payment.branchId!.isNotEmpty &&
            payment.branchId != branchId) {
          continue;
        }
        pendingSms = payment;
        break;
      }

      BillingPaymentRow? pendingPlan;
      for (final payment in planPayments) {
        if (!payment.isPending) continue;
        if (branchId != null &&
            payment.branchId != null &&
            payment.branchId!.isNotEmpty &&
            payment.branchId != branchId) {
          continue;
        }
        pendingPlan = payment;
        break;
      }

      String? selectedPlan = _selectedPlanCode;
      if (selectedPlan == null || !plans.any((p) => p.code == selectedPlan)) {
        BillingPlanOption? preferred;
        for (final plan in plans) {
          if (plan.defaultSelected) {
            preferred = plan;
            break;
          }
        }
        preferred ??= plans.isNotEmpty ? plans.first : null;
        selectedPlan = preferred?.code;
      }

      if (!mounted) return;
      setState(() {
        _branchBilling = branch;
        _plans = plans;
        _bundles = bundles;
        _smsPayments = smsPayments;
        _planPayments = planPayments;
        _pendingSmsPayment = pendingSms;
        _pendingPlanPayment = pendingPlan;
        _selectedBundleId = bundles.isNotEmpty ? bundles.first.id : null;
        _selectedPlanCode = selectedPlan;
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

  List<BillingPlanOption> _plansFromSummary(
    Map<String, dynamic> summary,
    String? branchId,
  ) {
    if (branchId != null && branchId.isNotEmpty) {
      final branches = summary['branches'];
      if (branches is List) {
        for (final row in branches.whereType<Map>()) {
          final map = Map<String, dynamic>.from(row);
          if ('${map['branchId']}' != branchId) continue;
          final branchPlans = map['plans'];
          if (branchPlans is List && branchPlans.isNotEmpty) {
            return _parsePlans(branchPlans);
          }
        }
      }
    }

    final rootPlans = summary['plans'];
    if (rootPlans is List && rootPlans.isNotEmpty) {
      return _parsePlans(rootPlans);
    }

    final single = summary['plan'];
    if (single is Map) {
      final plan = BillingPlanOption.fromJson(Map<String, dynamic>.from(single));
      if (plan.code.isNotEmpty) return [plan];
    }
    return const [];
  }

  List<BillingPlanOption> _parsePlans(List<dynamic> raw) {
    return raw
        .whereType<Map>()
        .map((row) => BillingPlanOption.fromJson(Map<String, dynamic>.from(row)))
        .where((p) => p.code.isNotEmpty)
        .toList()
      ..sort((a, b) => a.durationMonths.compareTo(b.durationMonths));
  }

  String? get _resolvedBranchId {
    final override = widget.branchId?.trim();
    if (override != null && override.isNotEmpty) return override;
    final sessionBranch = widget.session.branchId?.trim();
    if (sessionBranch != null && sessionBranch.isNotEmpty) return sessionBranch;
    final fromBilling = (_branchBilling?['branchId'] as String?)?.trim();
    if (fromBilling != null && fromBilling.isNotEmpty) return fromBilling;
    return null;
  }

  Future<void> _openBundlePayment(SmsBundleOption bundle) async {
    final branchId = _resolvedBranchId;
    if (branchId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Select a branch first, then buy an SMS bundle for that branch.',
          ),
        ),
      );
      return;
    }

    setState(() => _selectedBundleId = bundle.id);

    final paid = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CompleteManualPaymentScreen.sms(
          session: widget.session,
          branchId: branchId,
          bundle: bundle,
        ),
      ),
    );

    if (!mounted) return;
    if (paid == true) {
      setState(() => _tab = SubscriptionTab.sms);
    }
    await _load();
  }

  Future<void> _openPlanPayment(BillingPlanOption plan) async {
    final branchId = _resolvedBranchId;
    if (branchId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Select a branch first, then subscribe for that branch.',
          ),
        ),
      );
      return;
    }

    setState(() => _selectedPlanCode = plan.code);

    final paid = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CompleteManualPaymentScreen.subscription(
          session: widget.session,
          branchId: branchId,
          plan: plan,
        ),
      ),
    );

    if (!mounted) return;
    if (paid == true) {
      setState(() => _tab = SubscriptionTab.plan);
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text(
          'Subscription',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
            child: _PlanSmsSegment(
              tab: _tab,
              onChanged: (tab) => setState(() => _tab = tab),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
              child: Text(
                _error!,
                style: const TextStyle(
                  color: Color(0xFFB42318),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: forestEmerald),
                  )
                : RefreshIndicator(
                    color: forestEmerald,
                    onRefresh: _load,
                    child: _tab == SubscriptionTab.sms
                        ? (_pendingSmsPayment != null
                            ? PaymentSubmittedScreen(
                                session: widget.session,
                                paymentId: _pendingSmsPayment!.id,
                                kind: ManualPaymentKind.sms,
                                amount: _pendingSmsPayment!.amount,
                                currency: _pendingSmsPayment!.currency,
                                paymentMethodTitle:
                                    _pendingSmsPayment!.paymentMethod ??
                                    'Mobile Money',
                                transactionId:
                                    _pendingSmsPayment!.transactionId ??
                                    _pendingSmsPayment!.transaction,
                                submittedAt: _pendingSmsPayment!.date,
                                bundleName: _pendingSmsPayment!.transaction,
                                smsUnits: _pendingSmsPayment!.credits ?? 0,
                                embedded: true,
                                onResolved: () {
                                  // ignore: discarded_futures
                                  _load();
                                },
                              )
                            : _SmsTab(
                                credits: _smsStore.credits ?? 0,
                                bundles: _bundles,
                                selectedBundleId: _selectedBundleId,
                                payments: _smsPayments,
                                onSelectBundle: (bundle) {
                                  setState(
                                    () => _selectedBundleId = bundle.id,
                                  );
                                  // ignore: discarded_futures
                                  _openBundlePayment(bundle);
                                },
                                onViewAllPayments: () {
                                  Navigator.of(context).push<void>(
                                    MaterialPageRoute(
                                      builder: (_) => _PaymentsListScreen(
                                        title: 'SMS payments',
                                        payments: _smsPayments,
                                      ),
                                    ),
                                  );
                                },
                              ))
                        : (_pendingPlanPayment != null
                            ? PaymentSubmittedScreen(
                                session: widget.session,
                                paymentId: _pendingPlanPayment!.id,
                                kind: ManualPaymentKind.subscription,
                                amount: _pendingPlanPayment!.amount,
                                currency: _pendingPlanPayment!.currency,
                                paymentMethodTitle:
                                    _pendingPlanPayment!.paymentMethod ??
                                    'Mobile Money',
                                transactionId:
                                    _pendingPlanPayment!.transactionId ??
                                    _pendingPlanPayment!.transaction,
                                submittedAt: _pendingPlanPayment!.date,
                                planName: 'Pro',
                                billingPeriodLabel:
                                    _pendingPlanPayment!.periodLabel ??
                                    (_pendingPlanPayment!.planDurationMonths !=
                                            null
                                        ? (_pendingPlanPayment!
                                                    .planDurationMonths ==
                                                1
                                            ? 'Monthly'
                                            : '${_pendingPlanPayment!.planDurationMonths} months')
                                        : '—'),
                                embedded: true,
                                onResolved: () {
                                  // ignore: discarded_futures
                                  _load();
                                },
                              )
                            : _PlanTab(
                                billing: _branchBilling,
                                plans: _plans,
                                selectedPlanCode: _selectedPlanCode,
                                payments: _planPayments,
                                onSelectPlan: (plan) {
                                  // ignore: discarded_futures
                                  _openPlanPayment(plan);
                                },
                                onViewAllPayments: () {
                                  Navigator.of(context).push<void>(
                                    MaterialPageRoute(
                                      builder: (_) => _PaymentsListScreen(
                                        title: 'Subscription payments',
                                        payments: _planPayments,
                                      ),
                                    ),
                                  );
                                },
                              )),
                  ),
          ),
        ],
      ),
    );
  }
}

class _PlanSmsSegment extends StatelessWidget {
  const _PlanSmsSegment({required this.tab, required this.onChanged});

  final SubscriptionTab tab;
  final ValueChanged<SubscriptionTab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(rembehRadiusMd),
        border: Border.all(color: line),
      ),
      child: Row(
        children: [
          Expanded(
            child: _SegmentChip(
              label: 'Plan',
              selected: tab == SubscriptionTab.plan,
              onTap: () => onChanged(SubscriptionTab.plan),
            ),
          ),
          Expanded(
            child: _SegmentChip(
              label: 'SMS',
              selected: tab == SubscriptionTab.sms,
              onTap: () => onChanged(SubscriptionTab.sms),
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentChip extends StatelessWidget {
  const _SegmentChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? forestEmerald : Colors.transparent,
      borderRadius: rembehBorderRadius(rembehRadiusSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusSm),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : midnightNavy,
              fontWeight: FontWeight.w700,
              fontSize: 13.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _PlanTab extends StatelessWidget {
  const _PlanTab({
    required this.billing,
    required this.plans,
    required this.selectedPlanCode,
    required this.payments,
    required this.onSelectPlan,
    required this.onViewAllPayments,
  });

  final Map<String, dynamic>? billing;
  final List<BillingPlanOption> plans;
  final String? selectedPlanCode;
  final List<BillingPaymentRow> payments;
  final ValueChanged<BillingPlanOption> onSelectPlan;
  final VoidCallback onViewAllPayments;

  @override
  Widget build(BuildContext context) {
    final status = '${billing?['status'] ?? 'Unknown'}';
    final locked = billing?['locked'] == true;
    final message = (billing?['message'] as String?)?.trim();
    final periodEnd =
        DateTime.tryParse('${billing?['currentPeriodEnd'] ?? ''}');
    final daysLeft = billing?['daysUntilPeriodEnd'] is num
        ? (billing!['daysUntilPeriodEnd'] as num).floor()
        : int.tryParse('${billing?['daysUntilPeriodEnd'] ?? ''}');
    final trialDays = billing?['trialDaysRemaining'] is num
        ? (billing!['trialDaysRemaining'] as num).floor()
        : int.tryParse('${billing?['trialDaysRemaining'] ?? ''}');

    final statusLower = status.toUpperCase();
    final isTrial = statusLower == 'TRIAL';
    final isActive = statusLower == 'ACTIVE';
    final badgeLabel = () {
      if (locked || statusLower == 'LOCKED') return 'Paused';
      if (isTrial && trialDays != null) {
        return '$trialDays day${trialDays == 1 ? '' : 's'} left';
      }
      if (daysLeft != null && (isActive || statusLower == 'GRACE')) {
        return '$daysLeft day${daysLeft == 1 ? '' : 's'} left';
      }
      return status.replaceAll('_', ' ');
    }();

    final preview = payments.take(5).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 22),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            border: Border.all(color: line),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: sage,
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: const Icon(
                  Icons.workspace_premium_outlined,
                  color: forestEmerald,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Pro',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isTrial
                          ? 'Free trial'
                          : isActive
                              ? 'Current plan'
                              : status.replaceAll('_', ' '),
                      style: const TextStyle(
                        color: slateText,
                        fontWeight: FontWeight.w500,
                        fontSize: 12,
                      ),
                    ),
                    if (periodEnd != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Until ${_formatDate(periodEnd)}',
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: locked
                      ? const Color(0xFFFFE4E6)
                      : const Color(0xFFE8F7EE),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badgeLabel,
                  style: TextStyle(
                    color: locked
                        ? const Color(0xFFB42318)
                        : forestEmerald,
                    fontWeight: FontWeight.w700,
                    fontSize: 11.5,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (message != null && message.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF8F1),
              borderRadius: rembehBorderRadius(rembehRadiusMd),
              border: Border.all(color: const Color(0xFFF5D0A9)),
            ),
            child: Text(
              message,
              style: const TextStyle(
                color: Color(0xFF9A3412),
                fontWeight: FontWeight.w500,
                fontSize: 12.5,
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        const Text(
          'Choose billing period',
          style: TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 3),
        const Text(
          'Tap a period to continue to payment.',
          style: TextStyle(
            color: slateText,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 10),
        if (plans.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: rembehBorderRadius(rembehRadiusLg),
              border: Border.all(color: line),
            ),
            child: const Text(
              'No billing periods are available right now.',
              style: TextStyle(
                color: slateText,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else
          ...plans.map((plan) {
            final selected = plan.code == selectedPlanCode;
            final badgeText = plan.isBestValue
                ? 'Best value'
                : plan.isMostPopular
                    ? 'Most popular'
                    : null;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: Colors.white,
                borderRadius: rembehBorderRadius(rembehRadiusLg),
                child: InkWell(
                  onTap: () => onSelectPlan(plan),
                  borderRadius: rembehBorderRadius(rembehRadiusLg),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
                        decoration: BoxDecoration(
                          borderRadius: rembehBorderRadius(rembehRadiusLg),
                          border: Border.all(
                            color: selected ? forestEmerald : line,
                            width: selected ? 1.6 : 1,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              selected
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_off,
                              color: selected ? forestEmerald : slateText,
                              size: 20,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    plan.label,
                                    style: const TextStyle(
                                      color: midnightNavy,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                    ),
                                  ),
                                  if (plan.compareAtAmount != null) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      formatUgx(
                                        plan.compareAtAmount!,
                                        plan.currency,
                                      ),
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                        fontWeight: FontWeight.w500,
                                        fontSize: 11.5,
                                        decoration: TextDecoration.lineThrough,
                                      ),
                                    ),
                                  ],
                                  if (plan.savingsAmount != null &&
                                      plan.savingsAmount! > 0) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      'Save ${formatUgx(plan.savingsAmount!, plan.currency)}',
                                      style: const TextStyle(
                                        color: forestEmerald,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 11.5,
                                      ),
                                    ),
                                  ] else if (plan.tagline.isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      plan.tagline,
                                      style: const TextStyle(
                                        color: slateText,
                                        fontWeight: FontWeight.w500,
                                        fontSize: 11.5,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            Text(
                              formatUgx(plan.amount, plan.currency),
                              style: const TextStyle(
                                color: forestEmerald,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (badgeText != null)
                        Positioned(
                          top: -8,
                          left: 36,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: plan.isBestValue
                                  ? forestEmerald
                                  : const Color(0xFF2B6CB0),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              badgeText,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            );
          }),
        const SizedBox(height: 8),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Recent subscription payments',
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
            if (payments.length > 5)
              TextButton(
                onPressed: onViewAllPayments,
                child: const Text(
                  'View all',
                  style: TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        if (preview.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: rembehBorderRadius(rembehRadiusLg),
              border: Border.all(color: line),
            ),
            child: const Text(
              'No subscription payments yet.',
              style: TextStyle(
                color: slateText,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else
          ...preview.map(
            (row) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PaymentTile(row: row),
            ),
          ),
      ],
    );
  }

  String _formatDate(DateTime value) {
    return formatBillingShortDate(value);
  }
}

class _SmsTab extends StatelessWidget {
  const _SmsTab({
    required this.credits,
    required this.bundles,
    required this.selectedBundleId,
    required this.payments,
    required this.onSelectBundle,
    required this.onViewAllPayments,
  });

  final int credits;
  final List<SmsBundleOption> bundles;
  final String? selectedBundleId;
  final List<BillingPaymentRow> payments;
  final ValueChanged<SmsBundleOption> onSelectBundle;
  final VoidCallback onViewAllPayments;

  @override
  Widget build(BuildContext context) {
    final preview = payments.take(5).toList();
    final tone = smsCreditTone(credits);

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 22),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            border: Border.all(color: line),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SMS balance',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Credits for borrower alerts and reminders on this branch.',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _BalancePill(credits: credits, tone: tone),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'Buy SMS bundle',
          style: TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 3),
        const Text(
          'Tap a pack to continue to payment.',
          style: TextStyle(
            color: slateText,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 10),
        if (bundles.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: rembehBorderRadius(rembehRadiusLg),
              border: Border.all(color: line),
            ),
            child: const Text(
              'No SMS bundles are available right now.',
              style: TextStyle(
                color: slateText,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else
          ...bundles.map((bundle) {
            final selected = bundle.id == selectedBundleId;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: Colors.white,
                borderRadius: rembehBorderRadius(rembehRadiusLg),
                child: InkWell(
                  onTap: () => onSelectBundle(bundle),
                  borderRadius: rembehBorderRadius(rembehRadiusLg),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(
                        color: selected ? forestEmerald : line,
                        width: selected ? 1.6 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          selected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_off,
                          color: selected ? forestEmerald : slateText,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: sage,
                            borderRadius: rembehBorderRadius(rembehRadiusMd),
                          ),
                          child: const Icon(
                            Icons.chat_bubble_outline_rounded,
                            color: forestEmerald,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${formatCompactMoney(bundle.smsUnits)} SMS',
                                style: const TextStyle(
                                  color: midnightNavy,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                bundle.name,
                                style: const TextStyle(
                                  color: slateText,
                                  fontWeight: FontWeight.w500,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          formatUgx(bundle.priceUgx, bundle.currency),
                          style: const TextStyle(
                            color: forestEmerald,
                            fontWeight: FontWeight.w800,
                            fontSize: 13.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        const SizedBox(height: 8),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Recent SMS payments',
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
            if (payments.length > 5)
              TextButton(
                onPressed: onViewAllPayments,
                child: const Text(
                  'View all',
                  style: TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        if (preview.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: rembehBorderRadius(rembehRadiusLg),
              border: Border.all(color: line),
            ),
            child: const Text(
              'No SMS payments yet.',
              style: TextStyle(
                color: slateText,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else
          ...preview.map(
            (row) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PaymentTile(row: row),
            ),
          ),
      ],
    );
  }
}

class _BalancePill extends StatelessWidget {
  const _BalancePill({required this.credits, required this.tone});

  final int credits;
  final SmsCreditTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      SmsCreditTone.red => (
        bg: const Color(0xFFFFE4E6),
        fg: const Color(0xFFB42318),
      ),
      SmsCreditTone.orange => (
        bg: const Color(0xFFFFEDD5),
        fg: const Color(0xFFC2410C),
      ),
      SmsCreditTone.green => (
        bg: const Color(0xFFD8F3E0),
        fg: const Color(0xFF06603A),
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '${formatCompactMoney(credits)} SMS',
        style: TextStyle(
          color: colors.fg,
          fontWeight: FontWeight.w700,
          fontSize: 12.5,
        ),
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.row});

  final BillingPaymentRow row;

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (row.status.toLowerCase()) {
      'paid' || 'completed' => forestEmerald,
      'failed' || 'cancelled' => const Color(0xFFB42318),
      _ => const Color(0xFFB45309),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        border: Border.all(color: line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.transaction,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    if (row.periodLabel != null && row.periodLabel!.isNotEmpty)
                      row.periodLabel!,
                    if (row.paymentMethod != null &&
                        row.paymentMethod!.isNotEmpty)
                      row.paymentMethod!,
                    if (row.date != null) _shortDate(row.date!),
                  ].join(' · '),
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
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
                formatUgx(row.amount, row.currency),
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                row.status,
                style: TextStyle(
                  color: statusColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _shortDate(DateTime value) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final local = value.toLocal();
    return '${local.day} ${months[local.month - 1]}';
  }
}

class _PaymentsListScreen extends StatelessWidget {
  const _PaymentsListScreen({
    required this.title,
    required this.payments,
  });

  final String title;
  final List<BillingPaymentRow> payments;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(14),
        itemCount: payments.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (_, index) => _PaymentTile(row: payments[index]),
      ),
    );
  }
}
