import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/network/realtime_client.dart';
import '../features/sms/data/sms_credits_store.dart';
import '../screens/subscription/payment_waiting_screen.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/money.dart';

/// Global celebration when a subscription/SMS payment is confirmed.
///
/// Shown on top of whatever screen the manager is on; only dismissible via Ok.
class BillingPaymentCelebrationWatcher {
  BillingPaymentCelebrationWatcher._();

  static final BillingPaymentCelebrationWatcher instance =
      BillingPaymentCelebrationWatcher._();

  static const _prefsKey = 'billing_payment_celebration_shown_ids';

  BuildContext Function()? _contextFinder;
  RembehSession? _session;
  bool _started = false;
  bool _showing = false;
  final Set<String> _shownIds = {};

  void start({
    required RembehSession session,
    required BuildContext Function() contextFinder,
  }) {
    _session = session;
    _contextFinder = contextFinder;
    if (_started) return;
    _started = true;
    // ignore: discarded_futures
    _bootstrap();
  }

  void stop() {
    if (!_started) return;
    _started = false;
    RealtimeClient.instance.off(
      'subscription_payment.updated',
      _handleRealtime,
    );
    _contextFinder = null;
    _session = null;
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    _shownIds
      ..clear()
      ..addAll(prefs.getStringList(_prefsKey) ?? const []);
    final session = _session;
    if (session != null) {
      try {
        await RealtimeClient.instance.connect(session);
      } catch (_) {}
    }
    RealtimeClient.instance.on(
      'subscription_payment.updated',
      _handleRealtime,
    );
  }

  void _handleRealtime(Map<String, dynamic> payload) {
    final nested = payload['payment'];
    final payment = nested is Map
        ? Map<String, dynamic>.from(nested)
        : <String, dynamic>{};
    final paymentId =
        '${payload['paymentId'] ?? payment['id'] ?? ''}'.trim();
    if (paymentId.isEmpty || _shownIds.contains(paymentId)) return;

    final status =
        '${payment['status'] ?? payload['status'] ?? ''}'.trim().toLowerCase();
    final paid =
        status == 'paid' || status == 'completed' || status == 'credited';
    if (!paid) return;

    // ignore: discarded_futures
    _present(paymentId: paymentId, payment: payment);
  }

  Future<void> _present({
    required String paymentId,
    required Map<String, dynamic> payment,
  }) async {
    if (_showing) return;
    final finder = _contextFinder;
    if (finder == null) return;
    final context = finder();
    if (!context.mounted) return;

    _showing = true;
    _shownIds.add(paymentId);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_prefsKey, _shownIds.toList(growable: false));
    } catch (_) {}

    await SmsCreditsStore.instance.refresh(silent: true);

    if (!context.mounted) {
      _showing = false;
      return;
    }

    final kind = '${payment['kind'] ?? 'subscription'}'.toLowerCase();
    final isSms = kind == 'sms';
    final credits = payment['credits'] is num
        ? (payment['credits'] as num).floor()
        : int.tryParse('${payment['credits'] ?? ''}') ?? 0;
    final newBalance = SmsCreditsStore.instance.credits;

    final durationMonths = payment['planDurationMonths'] is num
        ? (payment['planDurationMonths'] as num).floor()
        : int.tryParse('${payment['planDurationMonths'] ?? ''}');
    final periodLabel = (payment['periodLabel'] as String?)?.trim();
    final activeUntil = DateTime.tryParse('${payment['activeUntil'] ?? ''}');
    // Copy rule: "6 months · Valid until …" — never "6-month plan · …"
    final planPeriodLine = formatPlanCelebrationPeriodLine(
      durationMonths: durationMonths,
      periodLabel: periodLabel,
      activeUntil: activeUntil,
    );

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return PopScope(
          canPop: false,
          child: Dialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: rembehBorderRadius(rembehRadiusXl),
            ),
            insetPadding: const EdgeInsets.symmetric(horizontal: 28),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: const BoxDecoration(
                      color: Color(0xFFE8F7EE),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      size: 36,
                      color: forestEmerald,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Subscription activated',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (isSms && credits > 0) ...[
                    Text(
                      '${formatCompactMoney(credits)} SMS added',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                      ),
                    ),
                    if (newBalance != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        'New balance: ${formatCompactMoney(newBalance)} SMS',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: slateText,
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ] else if (!isSms) ...[
                    const Text(
                      'Pro plan activated for',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      planPeriodLine,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ] else
                    Text(
                      '${payment['transaction'] ?? 'Payment'} confirmed',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Ok'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );

    _showing = false;
  }
}
